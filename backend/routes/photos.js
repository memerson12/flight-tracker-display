const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
let sharp = require('sharp');

const { randomUUID } = require('crypto');
const metadataStore = require('../lib/metadataStore');
const adminAuth = require('../middleware/adminAuth');

const PHOTOS_DIR = path.join(__dirname, '..', 'photos');
const THUMBS_DIR = path.join(PHOTOS_DIR, 'thumbs');

// Ensure dirs exist
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

// Multer setup (store in tmp) with limits
const MAX_FILE_SIZE = Number(process.env.MAX_PHOTO_SIZE) || 8 * 1024 * 1024; // 8MB default
const upload = multer({ 
  dest: path.join(os.tmpdir(), 'flights-uploads'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    cb(null, true);
  }
});

// Rate limiter for uploads
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 }); // 10 uploads per minute per IP

// GET /api/photos
router.get('/', (req, res) => {
  try {
    const all = metadataStore.getAll();
    // If query param `admin=1` return everything, otherwise only enabled
    if (req.query.admin === '1') return res.json(all);
    return res.json(all.filter(p => p.enabled));
  } catch (err) {
    console.error('Failed to read photos metadata', err.message);
    res.status(500).json({ error: 'Failed to read metadata' });
  }
});

// POST /api/photos (admin)
router.post('/', adminAuth, uploadLimiter, upload.fields([
  { name: 'files', maxCount: 20 },
  { name: 'file', maxCount: 20 }
]), async (req, res) => {
  try {
    const uploadedFiles = [
      ...(req.files?.files || []),
      ...(req.files?.file || [])
    ];

    if (uploadedFiles.length === 0) return res.status(400).json({ error: 'Missing files' });

    // Multer's fileFilter will reject unsupported types; detect and return proper code
    if (req.fileValidationError) {
      for (const file of uploadedFiles) {
        try { fs.unlinkSync(file.path); } catch (e) {}
      }
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const created = [];

    for (const file of uploadedFiles) {
      const id = randomUUID();
      const ext = file.originalname.split('.').pop().toLowerCase();
      const filename = `${id}.${ext}`;
      const dest = path.join(PHOTOS_DIR, filename);

      try {
        await sharp(file.path)
          .resize({ width: 3840, height: 2160, fit: 'inside' })
          .toFile(dest);
      } catch (err) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        if (err && err.code === 'ENOSPC') return res.status(503).json({ error: 'No space left on device' });
        console.error('sharp processing error', err.message);
        return res.status(500).json({ error: 'Image processing failed' });
      }

      const thumbName = `${id}.webp`;
      const thumbPath = path.join(THUMBS_DIR, thumbName);
      try {
        await sharp(dest)
          .resize({ width: 800, height: 800, fit: 'cover' })
          .webp({ quality: 80 })
          .toFile(thumbPath);
      } catch (err) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        try { fs.unlinkSync(dest); } catch (e) {}
        if (err && err.code === 'ENOSPC') return res.status(503).json({ error: 'No space left on device' });
        console.error('sharp thumbnail error', err.message);
        return res.status(500).json({ error: 'Thumbnail generation failed' });
      }

      try { fs.unlinkSync(file.path); } catch (e) {}

      const meta = {
        id,
        filename: filename,
        url: `/photos/${filename}`,
        thumb: `/photos/thumbs/${thumbName}`,
        caption: '',
        order: Date.now(),
        enabled: true,
        uploadedAt: new Date().toISOString()
      };

      created.push(metadataStore.add(meta));
    }

    return res.status(201).json(created);
  } catch (err) {
    // Multer fileFilter throws custom error
    if (err && err.message === 'UNSUPPORTED_FILE_TYPE') {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    console.error('Error handling upload', err && err.message);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// PUT /api/photos/:id (admin)
router.put('/:id', adminAuth, express.json(), (req, res) => {
  try {
    const { id } = req.params;
    const patch = {};
    if (req.body.caption !== undefined) patch.caption = String(req.body.caption);
    if (req.body.order !== undefined) patch.order = Number(req.body.order);
    if (req.body.enabled !== undefined) patch.enabled = Boolean(req.body.enabled);

    const updated = metadataStore.update(id, patch);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    return res.json(updated);
  } catch (err) {
    console.error('Failed to update metadata', err.message);
    res.status(500).json({ error: 'Failed to update' });
  }
});

// DELETE /api/photos/:id (admin)
router.delete('/:id', adminAuth, (req, res) => {
  try {
    const { id } = req.params;
    const removed = metadataStore.remove(id);
    if (!removed) return res.status(404).json({ error: 'Not found' });

    // Delete files
    try { fs.unlinkSync(path.join(PHOTOS_DIR, removed.filename)); } catch (e) {}
    // thumb
    try { fs.unlinkSync(path.join(THUMBS_DIR, `${removed.id}.webp`)); } catch (e) {}

    return res.status(204).send();
  } catch (err) {
    console.error('Failed to delete photo', err.message);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
