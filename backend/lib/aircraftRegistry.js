const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.FLIGHT_TRACKER_DATA_DIR
  ? path.resolve(process.env.FLIGHT_TRACKER_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_PATH = process.env.AIRCRAFT_REGISTRY_DB_PATH
  ? path.resolve(process.env.AIRCRAFT_REGISTRY_DB_PATH)
  : path.join(DATA_DIR, 'aircraft-registry.db');

let db = null;
let lookupByRegistration = null;
let lookupByModeS = null;

function normalizeRegistration(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^N[0-9A-Z]{1,5}$/.test(compact)) return compact;
  const australian = compact.match(/^VH-?([A-Z0-9]{3})$/);
  return australian ? `VH-${australian[1]}` : compact;
}

function normalizeModeS(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-F0-9]/g, '');
}

function ensureDatabase() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS aircraft_registry (
      registration TEXT PRIMARY KEY,
      mode_s TEXT,
      registry TEXT NOT NULL,
      manufacturer TEXT,
      model TEXT,
      icao_type TEXT,
      engine_type TEXT,
      registered_name TEXT,
      party_kind TEXT,
      relationship TEXT
    );
    CREATE INDEX IF NOT EXISTS aircraft_registry_mode_s_idx ON aircraft_registry(mode_s);
    CREATE TABLE IF NOT EXISTS aircraft_registry_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  lookupByRegistration = db.prepare('SELECT * FROM aircraft_registry WHERE registration = ?');
  lookupByModeS = db.prepare('SELECT * FROM aircraft_registry WHERE mode_s = ?');
  return db;
}

function toRegistryRecord(row) {
  if (!row) return null;
  return {
    registration: row.registration,
    modeS: row.mode_s || '',
    registry: row.registry,
    manufacturer: row.manufacturer || '',
    model: row.model || '',
    icaoType: row.icao_type || '',
    engineType: row.engine_type || '',
    registeredName: row.registered_name || '',
    partyKind: row.party_kind || '',
    relationship: row.relationship || ''
  };
}

function lookupAircraftRegistration({ registration, modeS } = {}) {
  try {
    ensureDatabase();
    const normalizedRegistration = normalizeRegistration(registration);
    if (normalizedRegistration) {
      const match = lookupByRegistration.get(normalizedRegistration);
      if (match) return toRegistryRecord(match);
    }

    const normalizedModeS = normalizeModeS(modeS);
    return normalizedModeS ? toRegistryRecord(lookupByModeS.get(normalizedModeS)) : null;
  } catch (error) {
    console.warn('Aircraft registry lookup unavailable:', error.message);
    return null;
  }
}

function closeAircraftRegistry() {
  if (db?.open) db.close();
  db = null;
  lookupByRegistration = null;
  lookupByModeS = null;
}

module.exports = {
  DB_PATH,
  closeAircraftRegistry,
  lookupAircraftRegistration,
  normalizeModeS,
  normalizeRegistration
};
