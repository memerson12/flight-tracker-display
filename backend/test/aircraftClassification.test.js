const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isBusinessJetModel,
  looksLikeOrganization,
  resolveAircraftIdentity
} = require('../lib/aircraftClassification');
const {
  acquireUpdateLock,
  parseCsvLine,
  releaseUpdateLock
} = require('../scripts/updateAircraftRegistry');

describe('business aircraft identity', function() {
  it('recognizes common business-jet ICAO types', function() {
    for (const aircraftType of ['GLF6', 'C25C', 'LJ60', 'FA7X', 'E50P', 'PC24']) {
      assert.strictEqual(isBusinessJetModel({ aircraftType }), true, aircraftType);
    }
  });

  it('does not classify ordinary airliners as business jets', function() {
    for (const aircraftType of ['B738', 'A320', 'E190', 'B77W']) {
      assert.strictEqual(isBusinessJetModel({ aircraftType }), false, aircraftType);
    }
  });

  it('uses registry manufacturer and model when the live type is missing', function() {
    assert.strictEqual(isBusinessJetModel({
      manufacturer: 'Cessna Aircraft Company',
      model: '525C'
    }), true);
  });

  it('shows organizational registry relationships but suppresses private names', function() {
    const corporate = resolveAircraftIdentity({
      aircraftType: 'GLF6',
      registration: 'N123AB',
      registryRecord: {
        registration: 'N123AB',
        registry: 'FAA',
        registeredName: 'EXAMPLE AVIATION LLC',
        partyKind: 'organization',
        relationship: 'registered-owner'
      }
    });
    const privateRecord = resolveAircraftIdentity({
      aircraftType: 'GLF6',
      registration: 'N456CD',
      registryRecord: {
        registration: 'N456CD',
        registry: 'FAA',
        registeredName: 'A PRIVATE PERSON',
        partyKind: 'private-or-withheld',
        relationship: ''
      }
    });

    assert.strictEqual(corporate.registeredName, 'EXAMPLE AVIATION LLC');
    assert.strictEqual(privateRecord.registeredName, '');
  });

  it('labels a CASA-registered Qantas business jet as corporate aircraft', function() {
    const identity = resolveAircraftIdentity({
      aircraftType: 'GLF6',
      registryRecord: {
        registration: 'VH-QTJ',
        registry: 'CASA',
        registeredName: 'QANTAS AIRWAYS LIMITED',
        partyKind: 'organization',
        relationship: 'registered-operator'
      }
    });

    assert.strictEqual(identity.label, 'Qantas Corporate Aircraft');
    assert.strictEqual(identity.brandCode, 'QF');
  });

  it('recognizes organizational names conservatively', function() {
    assert.strictEqual(looksLikeOrganization('Example Holdings Pty Ltd'), true);
    assert.strictEqual(looksLikeOrganization('A Private Person'), false);
  });

  it('parses quoted registry CSV without leaking columns into one another', function() {
    assert.deepStrictEqual(
      parseCsvLine('N123AB,"EXAMPLE AVIATION, LLC","G650"'),
      ['N123AB', 'EXAMPLE AVIATION, LLC', 'G650']
    );
  });

  it('prevents overlapping registry updates', function() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aircraft-registry-lock-test-'));
    const lockPath = path.join(tempDir, 'registry.update.lock');
    const firstLock = acquireUpdateLock(lockPath);
    try {
      assert.notStrictEqual(firstLock, null);
      assert.strictEqual(acquireUpdateLock(lockPath), null);
    } finally {
      releaseUpdateLock(firstLock, lockPath);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
