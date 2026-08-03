
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PHOTOS_DIR = process.env.PHOTO_STORAGE_DIR
  ? path.resolve(process.env.PHOTO_STORAGE_DIR)
  : path.join(__dirname, '..', 'photos');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const DATA_DIR = process.env.FLIGHT_TRACKER_DATA_DIR
  ? path.resolve(process.env.FLIGHT_TRACKER_DATA_DIR)
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.PHOTO_DB_PATH
  ? path.resolve(process.env.PHOTO_DB_PATH)
  : path.join(DATA_DIR, 'photos.db');
const LEGACY_DB_PATH = path.join(PHOTOS_DIR, 'photos.db');

const migrateLegacyDatabase = () => {
  if (DB_PATH === LEGACY_DB_PATH || fs.existsSync(DB_PATH) || !fs.existsSync(LEGACY_DB_PATH)) return;

  const suffixes = ['', '-wal', '-shm', '-journal'];
  const moved = [];
  try {
    for (const suffix of suffixes) {
      const source = `${LEGACY_DB_PATH}${suffix}`;
      if (!fs.existsSync(source)) continue;
      const destination = `${DB_PATH}${suffix}`;
      fs.renameSync(source, destination);
      moved.push({ source, destination });
    }
  } catch (error) {
    for (const { source, destination } of moved.reverse()) {
      if (fs.existsSync(destination) && !fs.existsSync(source)) {
        fs.renameSync(destination, source);
      }
    }
    throw new Error(`Failed to migrate the photo database out of public storage: ${error.message}`);
  }
};

migrateLegacyDatabase();
const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    thumb TEXT,
    latitude REAL,
    longitude REAL,
    location TEXT,
    ord INTEGER,
    enabled INTEGER DEFAULT 1,
    uploadedAt TEXT
  );
`);

const existingColumns = new Set(db.prepare('PRAGMA table_info(photos)').all().map((column) => column.name));
const needsLocationMigration = existingColumns.has('caption')
  || !existingColumns.has('latitude')
  || !existingColumns.has('longitude')
  || !existingColumns.has('location');

if (needsLocationMigration) {
  const columnOrNull = (name) => existingColumns.has(name) ? name : 'NULL';
  const migratePhotos = db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS photos_migrated');
    db.exec(`
      CREATE TABLE photos_migrated (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        thumb TEXT,
        latitude REAL,
        longitude REAL,
        location TEXT,
        ord INTEGER,
        enabled INTEGER DEFAULT 1,
        uploadedAt TEXT
      )
    `);
    db.exec(`
      INSERT INTO photos_migrated (id, filename, url, thumb, latitude, longitude, location, ord, enabled, uploadedAt)
      SELECT id, filename, url, thumb, ${columnOrNull('latitude')}, ${columnOrNull('longitude')},
        ${columnOrNull('location')}, ord, enabled, uploadedAt
      FROM photos
    `);
    db.exec('DROP TABLE photos');
    db.exec('ALTER TABLE photos_migrated RENAME TO photos');
  });
  migratePhotos();
}

const insertStmt = db.prepare(`INSERT INTO photos (id, filename, url, thumb, latitude, longitude, location, ord, enabled, uploadedAt) VALUES (@id,@filename,@url,@thumb,@latitude,@longitude,@location,@ord,@enabled,@uploadedAt)`);
const updateStmt = db.prepare(`UPDATE photos SET filename=@filename, url=@url, thumb=@thumb, latitude=@latitude, longitude=@longitude, location=@location, ord=@ord, enabled=@enabled, uploadedAt=@uploadedAt WHERE id=@id`);
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
    latitude: Number.isFinite(meta.latitude) ? meta.latitude : null,
    longitude: Number.isFinite(meta.longitude) ? meta.longitude : null,
    location: meta.location || null,
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
    latitude: Number.isFinite(next.latitude) ? next.latitude : null,
    longitude: Number.isFinite(next.longitude) ? next.longitude : null,
    location: next.location || null,
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

function close() {
  if (db.open) db.close();
}

module.exports = { DB_PATH, getAll, add, update, remove, getById, close };
