const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function writeJsonAtomic(filePath, value, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const createId = options.createId || randomUUID;
  const targetPath = path.resolve(filePath);
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(directory, `.${path.basename(targetPath)}.${process.pid}.${createId()}.tmp`);
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  let descriptor = null;

  fileSystem.mkdirSync(directory, { recursive: true });

  try {
    descriptor = fileSystem.openSync(temporaryPath, 'wx', 0o600);
    fileSystem.writeFileSync(descriptor, contents, 'utf8');
    fileSystem.fsyncSync(descriptor);
    fileSystem.closeSync(descriptor);
    descriptor = null;

    fileSystem.renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (descriptor !== null) {
      try { fileSystem.closeSync(descriptor); } catch {}
    }
    try { fileSystem.unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

module.exports = { writeJsonAtomic };
