const path = require('path');
const { fork } = require('child_process');

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
let updateProcess = null;

function runUpdate() {
  if (updateProcess || process.env.AIRCRAFT_REGISTRY_AUTO_UPDATE === 'false') return;
  updateProcess = fork(path.join(__dirname, '..', 'scripts', 'updateAircraftRegistry.js'), [], {
    stdio: 'inherit'
  });
  updateProcess.once('exit', () => {
    updateProcess = null;
  });
}

function scheduleAircraftRegistryUpdates() {
  if (process.env.AIRCRAFT_REGISTRY_AUTO_UPDATE === 'false') return;
  const initialTimer = setTimeout(runUpdate, 10_000);
  const updateTimer = setInterval(runUpdate, UPDATE_INTERVAL_MS);
  initialTimer.unref();
  updateTimer.unref();
}

module.exports = { scheduleAircraftRegistryUpdates };
