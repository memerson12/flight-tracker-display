const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { writeJsonAtomic } = require('../lib/atomicJsonStore');

describe('atomic JSON persistence', function() {
  let runtimeDirectory;
  let targetPath;

  beforeEach(function() {
    runtimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-tracker-config-test-'));
    targetPath = path.join(runtimeDirectory, 'config.json');
  });

  afterEach(function() {
    fs.rmSync(runtimeDirectory, { recursive: true, force: true });
  });

  it('replaces the complete document without leaving temporary files', function() {
    fs.writeFileSync(targetPath, JSON.stringify({ version: 1 }));

    writeJsonAtomic(targetPath, { version: 2, nested: { healthy: true } }, {
      createId: () => 'successful-write'
    });

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(targetPath, 'utf8')), {
      version: 2,
      nested: { healthy: true }
    });
    assert.deepStrictEqual(fs.readdirSync(runtimeDirectory), ['config.json']);
  });

  it('preserves the previous document when the final rename fails', function() {
    fs.writeFileSync(targetPath, JSON.stringify({ version: 1 }));
    const failingFileSystem = Object.create(fs);
    failingFileSystem.renameSync = () => {
      throw new Error('simulated rename failure');
    };

    assert.throws(() => writeJsonAtomic(targetPath, { version: 2 }, {
      fileSystem: failingFileSystem,
      createId: () => 'failed-write'
    }), /simulated rename failure/);

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(targetPath, 'utf8')), { version: 1 });
    assert.deepStrictEqual(fs.readdirSync(runtimeDirectory), ['config.json']);
  });
});
