
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PHOTOS_DIR = path.join(__dirname, '..', 'photos');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const DB_PATH = path.join(PHOTOS_DIR, 'photos.db');
const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    thumb TEXT,
    caption TEXT,
    ord INTEGER,
    enabled INTEGER DEFAULT 1,
    uploadedAt TEXT
  );
`);

const insertStmt = db.prepare(`INSERT INTO photos (id, filename, url, thumb, caption, ord, enabled, uploadedAt) VALUES (@id,@filename,@url,@thumb,@caption,@ord,@enabled,@uploadedAt)`);
const updateStmt = db.prepare(`UPDATE photos SET filename=@filename, url=@url, thumb=@thumb, caption=@caption, ord=@ord, enabled=@enabled, uploadedAt=@uploadedAt WHERE id=@id`);
const deleteStmt = db.prepare(`DELETE FROM photos WHERE id = ?`);
const selectAllStmt = db.prepare(`SELECT * FROM photos ORDER BY ord ASC`);
const selectEnabledStmt = db.prepare(`SELECT * FROM photos WHERE enabled = 1 ORDER BY ord ASC`);
const selectByIdStmt = db.prepare(`SELECT * FROM photos WHERE id = ?`);

function getAll(admin = false) {
  if (admin) return selectAllStmt.all();
  return selectEnabledStmt.all();
}

function add(item) {
  const meta = Object.assign({}, item);
  insertStmt.run({
    id: meta.id,
    filename: meta.filename,
    url: meta.url,
    thumb: meta.thumb,
    caption: meta.caption || '',
    ord: meta.order || meta.ord || Date.now(),
    enabled: meta.enabled ? 1 : 0,
    uploadedAt: meta.uploadedAt || new Date().toISOString()
  });
  return getById(meta.id);
}

function getById(id) {
  return selectByIdStmt.get(id) || null;
}

function update(id, patch) {
  const existing = getById(id);
  if (!existing) return null;
  const next = Object.assign({}, existing, patch);
  updateStmt.run({
    id: next.id,
    filename: next.filename,
    url: next.url,
    thumb: next.thumb,
    caption: next.caption || '',
    ord: next.order !== undefined ? next.order : next.ord,
    enabled: next.enabled ? 1 : 0,
    uploadedAt: next.uploadedAt || next.uploadedAt
  });
  return getById(id);
}

function remove(id) {
  const existing = getById(id);
  if (!existing) return false;
  deleteStmt.run(id);
  return existing;
}

module.exports = { getAll, add, update, remove, getById };
