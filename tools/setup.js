// Run by install.cmd and uninstall.cmd (they check Node.js first). Asks in the console window, then sets up or takes
// away the Load Bridge link, the desktop shortcut and Start with Windows, for this Windows user only.
//   node tools/setup.js install            asks about the shortcut and Start with Windows (both Yes if Enter)
//   node tools/setup.js install --yes      no questions: link, shortcut and Start with Windows
//   node tools/setup.js uninstall          stops the Bridge, takes all three away; the folder is left for you to delete
// Add --no-desktop / --no-startup to leave one out without being asked.
'use strict';
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const cmd = args[0];
const has = f => args.includes(f);
const setup = require('../lib/setup');
const say = s => console.log(' ' + s);

// One reader for the whole run (answers can arrive together when typed ahead or piped in by a test). No input left
// counts as Enter: Yes for ask, No for askNo.
let rl = null, lines = [], waiting = null, closed = false;
async function ask(q) {
  if (has('--yes')) return true;
  process.stdout.write(' ' + q + ' [Y/n] ');
  return !/^\s*n/i.test(await answer());
}
// A question whose Yes cannot be taken back: only a typed y counts; Enter, no input and --yes are No.
async function askNo(q) {
  process.stdout.write(' ' + q + ' [y/N] ');
  return /^\s*y/i.test(await answer());
}
async function answer() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin });
    rl.on('line', l => { if (waiting) { const w = waiting; waiting = null; w(l); } else lines.push(l); });
    rl.on('close', () => { closed = true; if (waiting) { const w = waiting; waiting = null; w(''); } });
  }
  const a = lines.length ? lines.shift() : closed ? '' : await new Promise(r => { waiting = r; });
  if (!process.stdin.isTTY) console.log(a);
  return a;
}

function report(r) {
  for (const x of r.results) {
    const name = setup.NAMES[x.where];
    if (x.error) say('  x ' + name + ': ' + x.error);
    else if (x.dryRun) say('  - ' + name + ': test copy, not changed (' + x.dryRun + ')');
    else if (x.other) say('  - ' + name + ': left alone, it starts another copy of My Project Bridge');
    else say('  ' + (x.exists ? 'OK ' + name + (x.path ? ' (' + x.path + ')' : '') : 'OK ' + name + ' removed'));
  }
}

async function install() {
  const want = { link: true };
  want.desktop = has('--no-desktop') ? undefined : await ask('Put a My Project Bridge shortcut on your desktop?');
  want.startup = has('--no-startup') ? undefined : await ask('Start the Bridge quietly when you sign in to Windows?');
  if (want.desktop === false) want.desktop = undefined; // "no" leaves an existing one alone; About can remove it
  if (want.startup === false) want.startup = undefined;
  console.log('');
  const r = await setup.apply(want);
  report(r);
  if (r.errors.length) { say(''); say('Not everything could be set up. The Bridge still works: start it with start-bridge.cmd.'); return 1; }
  // Both questions are answered here, so the Bridge's Welcome window (the same two, offered ticked) is not asked again.
  // A Bridge already running keeps its settings in memory and would write them back over the file, so it is told
  // through its own API; otherwise the file is marked.
  try {
    const cfg = require('../lib/config'), settings = require('../lib/settings');
    let told = false;
    try {
      const run = JSON.parse(require('fs').readFileSync(cfg.RUN_FILE, 'utf8'));
      const res = await fetch('http://127.0.0.1:' + run.port + '/api/welcome', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': run.key }, body: '{}', signal: AbortSignal.timeout(3000) });
      told = res.ok;
    } catch {}
    if (!told) {
      const s = settings.load(cfg.SETTINGS_FILE, cfg.DEFAULT_ROOT);
      if (!s.welcomed) { s.welcomed = true; settings.save(cfg.SETTINGS_FILE, s); }
    }
  } catch {}
  return 0;
}

async function uninstall() {
  // Stop a running Bridge first (it would put the link back the next time it starts).
  try { execFileSync(process.execPath, [path.join(__dirname, '..', 'server.js'), '--stop'], { stdio: 'ignore', timeout: 15000 }); } catch {}
  const r = await setup.uninstall();
  report(r);
  const s = await setup.status();
  say('');
  say('My Project Bridge is switched off and its links are gone' + (r.results.some(x => x.other) ? ' (except those that start another copy, above)' : '') + '. Its files are still in');
  say('  ' + s.folder);
  if (r.errors.length || process.env.BRIDGE_INSTALL_NO_START === '1' || process.platform !== 'win32') {
    say('Delete that folder to remove it completely (your settings, audits and prompts are in its data folder).');
    return r.errors.length ? 1 : 0;
  }
  // The folder itself, on request: to the Recycle Bin (so it can still be brought back), with the old copies an update
  // kept beside it. Never a projects folder or a backup: only this Bridge's own folder and its .<name>.old-* copies.
  const update = require('../lib/update');
  const w = update.where();
  const dirs = [s.folder, ...update.oldCopies(w).map(o => path.join(w.parent, o.folder))];
  say('');
  if (fs.existsSync(path.join(s.folder, '.git'))) say('Note: this folder is a git clone. Work in it that is not pushed goes with it.');
  const extra = dirs.length > 1 ? ' and the ' + (dirs.length - 1) + ' old ' + (dirs.length === 2 ? 'copy' : 'copies') + ' beside it' : '';
  if (!(await askNo('Also put this folder' + extra + ' in the Recycle Bin? Your projects and backups are not touched.'))) {
    say('Kept. Delete that folder yourself to remove it completely (your settings, audits and prompts are in its data folder).');
    return 0;
  }
  // This window holds the folder open, so a copy of the helper in Temp (the original is in the folder) waits for it to
  // close first.
  const helper = path.join(os.tmpdir(), 'my-project-bridge-recycle-' + process.pid + '.ps1');
  fs.copyFileSync(path.join(__dirname, '..', 'lib', 'platform', 'windows', 'recycle-later.ps1'), helper);
  recycleLater(helper, dirs, process.ppid);
  say('It goes to the Recycle Bin once this window closes. Restore it from there if you change your mind.');
  return 0;
}

// The helper must outlive this window: Start-Process gives it its own (hidden) one. A PowerShell started detached from
// Node has no console and exits at once, and cmd's start would trip over a folder name with & in it. The folders and
// the process id go in the environment, so nothing is quoted.
function recycleLater(helper, dirs, waitFor) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('\"' + $env:BRIDGE_RECYCLE_HELPER + '\"'))"],
  { cwd: os.tmpdir(), windowsHide: true, stdio: 'ignore', timeout: 30000,
    env: { ...process.env, BRIDGE_RECYCLE_HELPER: helper, BRIDGE_RECYCLE_PATHS: dirs.join('|'), BRIDGE_RECYCLE_WAIT: String(waitFor) } });
}

if (require.main !== module) module.exports = { recycleLater };
else (async () => {
  if (cmd === 'install') process.exitCode = await install();
  else if (cmd === 'uninstall') process.exitCode = await uninstall();
  else { say('Use: node tools/setup.js install | uninstall'); process.exitCode = 2; }
  if (rl) rl.close();
})();
