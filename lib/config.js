// Everything the Bridge decides once at start: version, port, mode (real / dry run / demo) and where its data lives.
// Read from the command line and environment only; nothing here changes while it runs.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = path.resolve(__dirname, '..'); // the Bridge's own folder
const VERSION = '0.1.12';
const argPort = (process.argv.find(a => /^--port=\d+$/.test(a)) || '').slice(7);
// Demo mode (node demo/demo.js starts it): made-up projects for screenshots. Its own port and data folder, made-up
// token numbers, "DEMO-PC", paths shown as C:\Users\demo\..., and the desktop / Start with Windows shortcuts are
// only pretended, so a demo never touches the real ones.
const DEMO = process.argv.includes('--demo');
// Tests and trying things out: report windows, browsers and stops instead of doing them.
const DRY = process.env.BRIDGE_DRYRUN === '1' || process.argv.includes('--dry-run');
const PORT = Number(argPort || process.env.BRIDGE_PORT || (DEMO ? 8486 : 8484));
// A port that is not a number would leave the Bridge running with nothing listening: it stops here with the reason.
const badPortArg = process.argv.find(a => /^--port=/.test(a) && !/^--port=\d+$/.test(a));
if (badPortArg || !Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('The port must be a whole number from 1 to 65535, as --port=8490 or BRIDGE_PORT=8490. Given: ' + (badPortArg ? badPortArg.slice(7) : argPort || process.env.BRIDGE_PORT));
  process.exit(2);
}
// First run only: the working folder to start with (the folder that holds the Bridge's own folder). Windows'
// Extract All adds a folder named after the zip around it; a folder holding nothing but the Bridge is that one, and
// the folder above it is taken instead.
function firstRoot() {
  const up = path.join(HERE, '..');
  try {
    const names = fs.readdirSync(up).filter(n => !/^(\..*|desktop\.ini|thumbs\.db)$/i.test(n));
    if (names.length === 1) return path.join(up, '..');
  } catch {}
  return up;
}
const DEFAULT_ROOT = path.resolve(process.env.BRIDGE_ROOT || firstRoot());
// A dry run and a demo keep their own data, so trying Add/Remove never changes the real list.
const dataDirFor = mode => path.join(HERE, mode === 'demo' ? 'data-demo' : mode === 'dry' ? 'data-dryrun' : 'data');
const DATA = path.resolve(process.env.BRIDGE_DATA || dataDirFor(DEMO ? 'demo' : DRY ? 'dry' : 'real'));

module.exports = {
  HERE, VERSION, PORT, DEMO, DRY, DEFAULT_ROOT, DATA, dataDirFor,
  SETTINGS_FILE: path.join(DATA, 'settings.json'),
  RUN_FILE: path.join(DATA, 'run.json'),
  LIVE_FILE: path.join(DATA, 'live.json'),
  PROMPTS_FILE: path.join(DATA, 'prompts.json'),
  PRIVATE_FILE: path.join(DATA, 'private-details.json'), // what the disclosure pass looks for; never shipped, never sent
  JUDGED_FILE: path.join(DATA, 'judged.json'), // findings a person judged wrong (lib/judged.js); never shipped
  SNAPS: path.join(DATA, 'snaps'),
  KEY: crypto.randomBytes(18).toString('hex'), // per run; the page is served with it and must send it back
  STARTED: Date.now(),
  // The data folder carries its own .gitignore of "*": wherever the Bridge is unpacked (inside a git repository too),
  // private details, settings and audits are never offered for a commit.
  ensureDataDirs() {
    for (const d of ['audits', 'logs', 'snaps']) fs.mkdirSync(path.join(DATA, d), { recursive: true });
    const gi = path.join(DATA, '.gitignore');
    try { if (!fs.existsSync(gi)) fs.writeFileSync(gi, '# Made by the Bridge: everything here stays on this PC.\n*\n'); } catch {}
  },
};
