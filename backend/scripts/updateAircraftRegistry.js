#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { pipeline } = require('stream/promises');
const axios = require('axios');
const Database = require('better-sqlite3');
const unzipper = require('unzipper');

const { DB_PATH } = require('../lib/aircraftRegistry');
const { looksLikeOrganization } = require('../lib/aircraftClassification');

const FAA_URL = process.env.FAA_REGISTRY_URL || 'https://registry.faa.gov/database/ReleasableAircraft.zip';
const CASA_URL = process.env.CASA_REGISTRY_URL || 'https://services.casa.gov.au/CSV/acrftreg.zip';
const MAX_AGE_MS = Number(process.env.AIRCRAFT_REGISTRY_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 2000;
const UPDATE_LOCK_PATH = `${DB_PATH}.update.lock`;
const STALE_LOCK_MS = 30 * 60 * 1000;

const engineTypes = {
  '0': 'None',
  '1': 'Reciprocating',
  '2': 'Turboprop',
  '3': 'Turboshaft',
  '4': 'Turbojet',
  '5': 'Turbofan',
  '6': 'Ramjet',
  '7': '2 Cycle',
  '8': '4 Cycle',
  '9': 'Unknown',
  '10': 'Electric',
  '11': 'Rotary'
};

const trim = (value) => String(value || '').trim().replace(/\s+/g, ' ');

function acquireUpdateLock(lockPath = UPDATE_LOCK_PATH) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const descriptor = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return descriptor;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    try {
      const lockAge = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (lockAge > STALE_LOCK_MS) {
        fs.unlinkSync(lockPath);
        return acquireUpdateLock(lockPath);
      }
    } catch (statError) {
      if (statError.code === 'ENOENT') return acquireUpdateLock(lockPath);
      throw statError;
    }
    return null;
  }
}

function releaseUpdateLock(descriptor, lockPath = UPDATE_LOCK_PATH) {
  if (descriptor === null || descriptor === undefined) return;
  try {
    fs.closeSync(descriptor);
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
}

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function headerIndex(header) {
  return new Map(header.map((name, index) => [trim(name).replace(/^\uFEFF/, ''), index]));
}

function valueAt(values, indices, name) {
  const index = indices.get(name);
  return index === undefined ? '' : trim(values[index]);
}

async function forEachZipRow(zipPath, entryName, onRow) {
  const archive = await unzipper.Open.file(zipPath);
  const entry = archive.files.find((candidate) => candidate.path.toUpperCase() === entryName.toUpperCase());
  if (!entry) throw new Error(`${entryName} is missing from ${path.basename(zipPath)}`);

  const lines = readline.createInterface({ input: entry.stream(), crlfDelay: Infinity });
  let indices = null;
  for await (const line of lines) {
    if (!indices) {
      indices = headerIndex(parseCsvLine(line));
      continue;
    }
    if (!line.trim()) continue;
    await onRow(parseCsvLine(line), indices);
  }
}

async function downloadFile(url, destination, referer) {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    maxRedirects: 5,
    headers: {
      Accept: 'application/zip,application/octet-stream;q=0.9,*/*;q=0.8',
      Referer: referer,
      'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
    }
  });
  await pipeline(response.data, fs.createWriteStream(destination, { flags: 'wx' }));
}

function createStagingTable(db) {
  db.exec(`
    DROP TABLE IF EXISTS aircraft_registry_staging;
    CREATE TABLE aircraft_registry_staging (
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
  `);
}

function createBatchWriter(db) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO aircraft_registry_staging (
      registration, mode_s, registry, manufacturer, model, icao_type,
      engine_type, registered_name, party_kind, relationship
    ) VALUES (
      @registration, @modeS, @registry, @manufacturer, @model, @icaoType,
      @engineType, @registeredName, @partyKind, @relationship
    )
  `);
  const writeBatch = db.transaction((records) => records.forEach((record) => insert.run(record)));
  let batch = [];

  return {
    add(record) {
      if (!record?.registration) return;
      batch.push(record);
      if (batch.length >= BATCH_SIZE) {
        writeBatch(batch);
        batch = [];
      }
    },
    flush() {
      if (batch.length) writeBatch(batch);
      batch = [];
    }
  };
}

async function importFaa(zipPath, writer) {
  const aircraftReferences = new Map();
  await forEachZipRow(zipPath, 'ACFTREF.txt', (values, indices) => {
    const code = valueAt(values, indices, 'CODE');
    if (!code) return;
    aircraftReferences.set(code, {
      manufacturer: valueAt(values, indices, 'MFR'),
      model: valueAt(values, indices, 'MODEL'),
      engineType: engineTypes[valueAt(values, indices, 'TYPE-ENG')] || ''
    });
  });

  let count = 0;
  await forEachZipRow(zipPath, 'MASTER.txt', (values, indices) => {
    const nNumber = valueAt(values, indices, 'N-NUMBER').replace(/\s+/g, '');
    if (!nNumber) return;
    const reference = aircraftReferences.get(valueAt(values, indices, 'MFR MDL CODE')) || {};
    const registrantType = valueAt(values, indices, 'TYPE REGISTRANT');
    const rawName = valueAt(values, indices, 'NAME');
    const isOrganization = ['3', '5', '7', '8'].includes(registrantType) && Boolean(rawName);

    writer.add({
      registration: `N${nNumber}`,
      modeS: valueAt(values, indices, 'MODE S CODE HEX').toUpperCase(),
      registry: 'FAA',
      manufacturer: reference.manufacturer || '',
      model: reference.model || '',
      icaoType: '',
      engineType: reference.engineType || engineTypes[valueAt(values, indices, 'TYPE ENGINE')] || '',
      registeredName: isOrganization ? rawName : '',
      partyKind: isOrganization ? 'organization' : 'private-or-withheld',
      relationship: isOrganization ? 'registered-owner' : ''
    });
    count += 1;
  });
  writer.flush();
  return count;
}

async function importCasa(zipPath, writer) {
  let count = 0;
  await forEachZipRow(zipPath, 'acrftreg.csv', (values, indices) => {
    const mark = valueAt(values, indices, 'Mark').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!mark) return;
    const operatorName = valueAt(values, indices, 'regopName');
    const holderName = valueAt(values, indices, 'regholdname');
    const registeredName = looksLikeOrganization(operatorName)
      ? operatorName
      : looksLikeOrganization(holderName) ? holderName : '';
    const relationship = registeredName
      ? (registeredName === operatorName ? 'registered-operator' : 'registered-holder')
      : '';

    writer.add({
      registration: `VH-${mark}`,
      modeS: '',
      registry: 'CASA',
      manufacturer: valueAt(values, indices, 'Manu'),
      model: valueAt(values, indices, 'Model') || valueAt(values, indices, 'Type'),
      icaoType: valueAt(values, indices, 'ICAOtypedesig').toUpperCase(),
      engineType: valueAt(values, indices, 'Engtype'),
      registeredName,
      partyKind: registeredName ? 'organization' : 'private-or-withheld',
      relationship
    });
    count += 1;
  });
  writer.flush();
  return count;
}

function ensureSchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
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
}

function isFresh(db) {
  const row = db.prepare("SELECT value FROM aircraft_registry_metadata WHERE key = 'updatedAt'").get();
  const updatedAt = Date.parse(row?.value || '');
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < MAX_AGE_MS;
}

async function updateAircraftRegistry({ force = false } = {}) {
  const lockDescriptor = acquireUpdateLock();
  if (lockDescriptor === null) {
    console.log('Aircraft registry update already in progress; skipping duplicate run.');
    return { skipped: true, reason: 'in-progress' };
  }

  let db = null;
  let tempDir = '';

  try {
    db = new Database(DB_PATH);
    ensureSchema(db);
    if (!force && isFresh(db)) {
      console.log('Aircraft registry is current; skipping download.');
      return { skipped: true, reason: 'current' };
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-aircraft-registry-'));
    const faaZip = path.join(tempDir, 'faa.zip');
    const casaZip = path.join(tempDir, 'casa.zip');
    console.log('Downloading FAA aircraft registry...');
    await downloadFile(
      FAA_URL,
      faaZip,
      'https://www.faa.gov/licenses_certificates/aircraft_certification/aircraft_registry/releasable_aircraft_download'
    );
    console.log('Downloading CASA aircraft registry...');
    await downloadFile(
      CASA_URL,
      casaZip,
      'https://www.casa.gov.au/aircraft/aircraft-registration/data-files-registered-aircraft'
    );

    createStagingTable(db);
    const writer = createBatchWriter(db);
    const faaCount = await importFaa(faaZip, writer);
    const casaCount = await importCasa(casaZip, writer);
    const updatedAt = new Date().toISOString();

    db.transaction(() => {
      db.exec(`
        DELETE FROM aircraft_registry;
        INSERT INTO aircraft_registry SELECT * FROM aircraft_registry_staging;
        DROP TABLE aircraft_registry_staging;
      `);
      const upsertMetadata = db.prepare(`
        INSERT INTO aircraft_registry_metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      upsertMetadata.run('updatedAt', updatedAt);
      upsertMetadata.run('faaRecords', String(faaCount));
      upsertMetadata.run('casaRecords', String(casaCount));
    })();
    db.exec('CREATE INDEX IF NOT EXISTS aircraft_registry_mode_s_idx ON aircraft_registry(mode_s)');

    console.log(`Aircraft registry updated: ${faaCount} FAA and ${casaCount} CASA records.`);
    return { skipped: false, faaCount, casaCount, updatedAt };
  } finally {
    if (db?.open) db.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    releaseUpdateLock(lockDescriptor);
  }
}

if (require.main === module) {
  updateAircraftRegistry({ force: process.argv.includes('--force') }).catch((error) => {
    console.error('Aircraft registry update failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  acquireUpdateLock,
  importCasa,
  importFaa,
  parseCsvLine,
  releaseUpdateLock,
  updateAircraftRegistry
};
