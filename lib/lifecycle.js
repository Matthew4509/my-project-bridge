// Stopping the Bridge: every local copy it started goes with it, and run.json is removed (only if it is this run's).
'use strict';
const fs = require('fs');
const cfg = require('./config');
const Sensors = require('./sensors');
const { stopAllProjects } = require('./runner');
const { stopCurrent } = require('./snapshot');

function shutdown() {
  stopAllProjects();
  Sensors.stopGpu();
  stopCurrent(); // a picture being taken: its hidden Edge goes too
  try { if (JSON.parse(fs.readFileSync(cfg.RUN_FILE, 'utf8')).pid === process.pid) fs.unlinkSync(cfg.RUN_FILE); } catch {}
  process.exit(0);
}

module.exports = { shutdown };
