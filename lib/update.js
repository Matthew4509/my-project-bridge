// Updates (About › Updates): a newer Bridge from a GitHub Release (downloaded, and its signature required), from a zip
// picked by hand (its signature checked; a missing or failing one is a warning the person may override), or, for a
// copy that is a git clone, from a signed git tag (lib/update-git.js). Nothing is asked of GitHub until the person
// presses Check for updates, and nothing about them is sent: a plain GET of a fixed public address.
// Every way in ends the same: the new copy is opened beside this one and checked (a whole Bridge, newer than this
// one, no data of its own), started once as a test copy on a free port, and only then does the Bridge hand over to
// lib/update-swap.js and exit, which puts the new copy in this folder's place and moves your data across. The old
// copy stays beside it (a dot folder, so it is not listed as a project) for Go back, until you remove it.
// A test copy (dry run) opens and checks an update like the real one but never installs it; the demo does neither.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const cfg = require('./config');
const release = require('./release');
const { readZip } = require('./disclosure');

const MAX_ZIP = 20 * 1024 * 1024;       // a Bridge zip is about 1 MB
const MAX_SIG = 64 * 1024;
const MAX_UNPACKED = 100 * 1024 * 1024;
const MAX_ENTRIES = 3000;
const HANDOVER_EXIT = 75;               // start-bridge.cmd closes its window on this, so the folder is free to move
// start-bridge.cmd's window, which sits in this folder (it sets BRIDGE_CONSOLE, and nothing else does). Taken out of
// the environment so the local copies the Bridge starts do not inherit it.
const CONSOLE = process.env.BRIDGE_CONSOLE === '1' ? process.ppid : 0;
delete process.env.BRIDGE_CONSOLE;

// Where things are, overridable by the tests (a made-up Bridge in a temp folder).
const where = (o = {}) => {
  const app = o.app || cfg.HERE;
  return { app, parent: path.dirname(app), base: path.basename(app), data: o.data || cfg.DATA, version: o.version || cfg.VERSION,
    key: o.key == null ? release.RELEASE_KEY : o.key, api: o.api || process.env.BRIDGE_RELEASE_API || '',
    // A test copy and the demo never install; tests that drive a real hand-over name what the helper starts and waits for.
    dry: o.dry == null ? cfg.DRY || cfg.DEMO : o.dry, start: o.start, wait: o.wait };
};
const updateDir = w => path.join(w.data, 'update');
const lastFile = w => path.join(updateDir(w), 'last.json');
const oldName = (w, v) => '.' + w.base + '.old-' + v;
const OLD_RE = base => new RegExp('^\\.' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.old-(\\d{1,4}\\.\\d{1,4}\\.\\d{1,4})(-\\d+)?$');
const NEW_PREFIX = w => '.' + w.base + '.new-';
const versionIn = dir => { try { return (/const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(dir, 'lib', 'config.js'), 'utf8')) || [])[1] || null; } catch { return null; } };
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const fail = error => ({ ok: false, error });

let pending = null; // the copy opened and checked, waiting for Install: { route, source, version, staging, dir, check, ... }
let busy = '';

// ---- opening a zip: every name checked before anything is written; written by the Bridge itself, never a program ----

// A name in the zip that could land outside the folder it is opened into, or that Windows reads specially.
function badName(name) {
  if (!name || name.length > 240 || /[\\:*?"<>|\x00-\x1f]/.test(name) || name.startsWith('/')) return true;
  return name.replace(/\/$/, '').split('/').some(s => !s || s === '.' || s === '..' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s));
}
// The Bridge's own folder in what was opened: the one folder at the top of the zip.
function topFolder(names) {
  const tops = new Set(names.map(n => n.split('/')[0]));
  if (tops.size !== 1 || names.some(n => !n.includes('/'))) return null;
  return [...tops][0];
}
/** A whole Bridge, or why not. */
function bridgeWhy(dir) {
  for (const f of ['server.js', 'lib/config.js', 'lib/app.js', 'public/index.html', 'start-bridge.cmd']) if (!fs.existsSync(path.join(dir, f))) return 'it is not a whole My Project Bridge (' + f + ' is missing)';
  for (const d of ['data', 'data-demo', 'data-dryrun']) if (fs.existsSync(path.join(dir, d))) return 'it carries a ' + d + ' folder of its own, and the Bridge never takes settings or data from a zip';
  return versionIn(dir) ? '' : 'it does not say which version it is (lib/config.js)';
}

/**
 * Opens a zip (its bytes) beside this copy and checks it. sigRaw: the .zip.sig as text, or null when none came.
 * Returns { ok, version, staging, dir, check } or { ok: false, error }. Nothing in it is run.
 */
function openZip(buf, sigRaw, w, { expect } = {}) {
  let entries;
  try { entries = readZip(buf, MAX_ENTRIES + 1); } catch (e) { return fail('That file could not be read as a zip (' + e.message + '). Download it again, or pick the my-project-bridge-<version>.zip file.'); }
  if (entries.length > MAX_ENTRIES) return fail('That zip holds more files than a Bridge does, so it was not opened. Pick the my-project-bridge-<version>.zip file.');
  const bad = entries.find(e => badName(e.name));
  if (bad) return fail('That zip holds a file whose name could land outside its folder (' + JSON.stringify(bad.name.slice(0, 80)) + '), so it was not opened. It is not a zip the Bridge\'s maker makes.');
  if (entries.some(e => e.encrypted)) return fail('That zip is password-protected, so it was not opened. Pick the my-project-bridge-<version>.zip file.');
  const top = topFolder(entries.map(e => e.name));
  if (!top) return fail('That zip does not hold one folder with the Bridge in it, so it is not a Bridge zip. Pick the my-project-bridge-<version>.zip file.');
  const total = entries.reduce((n, e) => n + e.size, 0);
  if (total > MAX_UNPACKED) return fail('That zip would unpack to ' + Math.round(total / 1048576) + ' MB, far more than a Bridge, so it was not opened.');
  // Named for this Bridge's process, so another Bridge from the same folder (a test copy) never tidies it away.
  const staging = path.join(w.parent, NEW_PREFIX(w) + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  try {
    fs.mkdirSync(staging);
    let written = 0;
    for (const e of entries) {
      const to = path.join(staging, ...e.name.split('/'));
      if (!to.startsWith(staging + path.sep)) throw new Error('a name climbs out of the folder');
      const data = e.read(MAX_UNPACKED - written);
      written += data.length;
      if (written > MAX_UNPACKED) throw new Error('it unpacks to more than it says');
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, data, { flag: 'wx' });
    }
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    return fail('That zip could not be opened (' + e.message + '). Download it again and try once more.');
  }
  const dir = path.join(staging, top);
  const no = msg => { fs.rmSync(staging, { recursive: true, force: true }); return fail(msg); };
  const whyNot = bridgeWhy(dir);
  if (whyNot) return no('That zip was not taken: ' + whyNot + '.');
  const version = versionIn(dir);
  if (!release.isVersion(version)) return no('That zip was not taken: its version (' + String(version).slice(0, 20) + ') is not one the Bridge reads.');
  if (expect && version !== expect) return no('That zip was not taken: GitHub named version ' + expect + ', but the zip holds ' + version + '.');
  if (!release.newer(version, w.version)) return no('That zip holds My Project Bridge ' + version + ', and this one is ' + w.version + ' already. Only a newer version is installed this way; to go back, use Go back below (while the older copy is kept), or unzip the older one by hand.');
  let sig = null, sigBad = false;
  if (sigRaw != null) { try { sig = JSON.parse(sigRaw); } catch { sigBad = true; } }
  const check = sigBad ? { code: 'format', why: 'its signature file is not one the Bridge\'s maker makes' } : release.zipCheck(sig, version, sha256(buf), w.key);
  return { ok: true, version, staging, dir, check, sha256: sha256(buf) };
}

// What the person is told about a signature that does not pass, for a zip picked by hand.
const WARN = {
  none: 'There is no signature beside it (' + 'my-project-bridge-<version>.zip.sig' + ').',
  format: 'The signature beside it is not one the Bridge\'s maker makes.',
  version: 'The signature beside it is for another version.',
  changed: 'The zip was changed after it was signed (or the download was cut short).',
  newkey: 'It is signed with a key this Bridge does not know. If the Bridge\'s maker changed keys, this is expected once.',
  bad: 'Its signature was not made with the Bridge\'s release key.',
  nokey: 'This Bridge carries no release key, so it cannot check any signature.',
};

function dropPending() {
  if (pending && pending.staging) fs.rmSync(pending.staging, { recursive: true, force: true });
  if (pending && pending.cleanup) try { pending.cleanup(); } catch {}
  pending = null;
}
const shown = p => p && { route: p.route, source: p.source, version: p.version, signed: !p.check.code, code: p.check.code, warning: p.check.code ? WARN[p.check.code] + ' It may not be from the Bridge\'s maker.' : '' };

// ---- a zip picked by hand ----

async function fromFile(file, w = where()) {
  const f = String(file || '').trim().replace(/^"(.*)"$/, '$1');
  if (!f) return fail('Choose the zip with Browse…, or type its path.');
  if (!/\.zip$/i.test(f)) return fail('That is not a zip file. Pick the my-project-bridge-<version>.zip file.');
  let st;
  try { st = fs.statSync(f); } catch { return fail('There is no file at ' + f + '. Check the path, or use Browse….'); }
  if (!st.isFile()) return fail('That is a folder, not a zip. Pick the my-project-bridge-<version>.zip file.');
  if (st.size > MAX_ZIP) return fail('That file is ' + Math.round(st.size / 1048576) + ' MB: a Bridge zip is about 1 MB, so it is not one.');
  let sigRaw = null;
  try { if (fs.statSync(f + '.sig').size <= MAX_SIG) sigRaw = fs.readFileSync(f + '.sig', 'utf8'); else sigRaw = '{}'; } catch {}
  dropPending();
  const r = openZip(fs.readFileSync(f), sigRaw, w);
  if (!r.ok) return r;
  pending = { route: 'zip', source: 'file', file: f, ...r };
  return { ok: true, pending: shown(pending) };
}

// ---- GitHub: the newest release, then its zip and signature ----

const HEADERS = () => ({ accept: 'application/vnd.github+json', 'user-agent': 'My-Project-Bridge/' + cfg.VERSION });
const PRIVATE_FOR_NOW = 'GitHub has no release of the Bridge to offer (the repository could not be found, or holds no release yet). Update from a zip instead: Update from a zip… below.';

async function latest(w = where()) {
  const url = w.api ? w.api.replace(/\/$/, '') + '/releases/latest' : release.API_URL;
  let r;
  try { r = await fetch(url, { headers: HEADERS(), signal: AbortSignal.timeout(20000) }); }
  catch (e) { return fail('GitHub did not answer (' + (e && e.name === 'TimeoutError' ? 'it took too long' : 'no connection') + '). Check this PC is online, then press Check for updates again; or use Update from a zip… with a zip copied from another PC.'); }
  if (r.status === 404) return fail(PRIVATE_FOR_NOW);
  if (r.status === 403 || r.status === 429) return fail('GitHub is turning this PC away for asking too often just now. Wait an hour, then press Check for updates again.');
  if (!r.ok) return fail('GitHub answered ' + r.status + '. Press Check for updates again later.');
  const l = release.latestOf(await r.json().catch(() => null), w.api ? new URL(w.api).origin + '/' : undefined);
  if (typeof l === 'string') return fail('Nothing to take: ' + l + '.');
  return { ok: true, latest: l };
}

async function fetchCapped(url, max) {
  const r = await fetch(url, { headers: { 'user-agent': HEADERS()['user-agent'] }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!r.ok || !r.body) throw new Error('GitHub answered ' + r.status + ' for ' + path.basename(new URL(url).pathname));
  const chunks = [];
  let got = 0;
  for await (const c of r.body) {
    got += c.length;
    if (got > max) throw new Error('the download is bigger than a Bridge zip can be');
    chunks.push(Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

/** Check for updates (zip route): what GitHub offers, and whether it is newer. Nothing is downloaded. */
async function check(w = where()) {
  const l = await latest(w);
  if (!l.ok) return l;
  const v = l.latest.version;
  return { ok: true, route: 'zip', version: v, newer: release.newer(v, w.version), mine: w.version, notes: l.latest.notes, published: l.latest.published, bytes: l.latest.zip.bytes };
}

/** Download and check: the zip and its signature come down; a signature that does not pass refuses it outright. */
async function download(version, w = where()) {
  const l = await latest(w);
  if (!l.ok) return l;
  const L = l.latest;
  if (L.version !== version) return fail('GitHub now has My Project Bridge ' + L.version + ', not ' + String(version).slice(0, 20) + '. Press Check for updates again.');
  if (!release.newer(L.version, w.version)) return fail('This Bridge is ' + w.version + ' already: nothing newer on GitHub.');
  let zip, sigRaw;
  try { sigRaw = (await fetchCapped(L.sig.url, MAX_SIG)).toString('utf8'); zip = await fetchCapped(L.zip.url, MAX_ZIP); }
  catch (e) { return fail('The download stopped: ' + String(e.message || e).replace(/\.$/, '') + '. Press Check for updates again to start it again.'); }
  dropPending();
  const r = openZip(zip, sigRaw, w, { expect: L.version });
  if (!r.ok) return r;
  if (r.check.code) {
    fs.rmSync(r.staging, { recursive: true, force: true });
    return fail(r.check.code === 'newkey'
      ? 'My Project Bridge ' + L.version + ' on GitHub is signed with a key this Bridge does not know, so it was not installed. If the Bridge\'s maker changed keys, install this one version by hand once: download the zip from the releases page and use Update from a zip… (Install anyway). Updates are automatic again from it on.'
      : 'My Project Bridge ' + L.version + ' was downloaded but not opened: ' + r.check.why + '. Something is wrong with that download or that release, so nothing was installed. Try again later, or tell the Bridge\'s maker.');
  }
  pending = { route: 'zip', source: 'github', ...r };
  return { ok: true, pending: shown(pending) };
}

// ---- the self-test: the new copy started once, as a test copy, before anything is swapped ----

const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
function get(port, p, headers = {}, method = 'GET') {
  return new Promise(resolve => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: '127.0.0.1:' + port, 'Content-Type': 'application/json', ...headers }, timeout: 2000 }, res => {
      let b = ''; res.setEncoding('utf8'); res.on('data', c => { if (b.length < 200000) b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('timeout', () => r.destroy()); r.on('error', () => resolve({ status: 0, body: '' }));
    r.end(method === 'POST' ? '{}' : undefined);
  });
}

/** Starts the new copy with --dry-run on a free port over a throwaway data folder; '' when it came up as `version`. */
async function selfTest(dir, version, w = where(), ms = 30000) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-selftest-'));
  const data = path.join(tmp, 'data'), root = path.join(tmp, 'root');
  fs.mkdirSync(data); fs.mkdirSync(root);
  // Your settings, so the new version is seen reading them, but with nothing it could reach out to: an empty working
  // folder, no projects added one by one, and no live addresses (it must not check your sites while it is tested).
  try {
    const s = JSON.parse(fs.readFileSync(path.join(w.data, 'settings.json'), 'utf8'));
    fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ ...s, workingFolders: [root], extraProjects: [], liveUrls: {} }));
  } catch {}
  const port = await freePort();
  // None of this Bridge's own BRIDGE_* settings (a test's stand-in addresses, a link or shortcut place, a console):
  // only the ones the test copy needs.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^BRIDGE_/i.test(k)));
  Object.assign(env, { BRIDGE_DATA: data, BRIDGE_ROOT: root, BRIDGE_OPEN: '0' });
  let out = '', ended = false;
  const child = spawn(process.execPath, ['server.js', '--dry-run', '--port=' + port], { cwd: dir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { if (out.length < 4000) out += d; });
  child.stderr.on('data', d => { if (out.length < 4000) out += d; });
  child.on('exit', () => { ended = true; });
  child.on('error', () => { ended = true; });
  let why = 'it did not answer within ' + Math.round(ms / 1000) + ' seconds';
  const end = Date.now() + ms;
  try {
    while (Date.now() < end && !ended) {
      await new Promise(r => setTimeout(r, 300));
      const page = await get(port, '/');
      if (page.status !== 200 || !/name="bridge-key"/.test(page.body)) continue;
      const ico = await get(port, '/bridge.ico');
      let run = null; try { run = JSON.parse(fs.readFileSync(path.join(data, 'run.json'), 'utf8')); } catch {}
      const stats = run ? await get(port, '/api/stats', { 'X-Bridge-Key': run.key }) : { status: 0 };
      let v = null; try { v = JSON.parse(stats.body).version; } catch {}
      why = ico.status !== 200 ? 'its icon did not load' : v !== version ? 'it says it is ' + (v || 'no version') + ', not ' + version : '';
      if (run) await get(port, '/api/quit', { 'X-Bridge-Key': run.key }, 'POST');
      break;
    }
    if (ended && why.startsWith('it did not answer')) why = 'it stopped as soon as it started' + (out.trim() ? ' (' + out.trim().split(/\r?\n/).pop().slice(0, 200) + ')' : '');
  } finally {
    for (let i = 0; i < 15 && !ended; i++) await new Promise(r => setTimeout(r, 200));
    if (!ended) try { child.kill(); } catch {}
    await new Promise(r => setTimeout(r, 200));
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return why;
}

// ---- hand-over: the helper waits for this Bridge to end, swaps the folders (or only restarts), starts the Bridge ----

// What the restart needs from this Bridge's environment, and all of it that is written into the plan file (which sits
// in the temp folder while the helper waits): Windows' own places, where node and cmd are found, and the BRIDGE_
// settings this Bridge was started with. Nothing else, so keys and tokens kept as environment variables never reach
// the disk. The helper itself gets the whole environment in memory and starts the Bridge with it, these laid over it.
const START_ENV = /^(path|pathext|systemroot|systemdrive|windir|comspec|temp|tmp|userprofile|appdata|localappdata|programdata|programfiles|bridge_data|bridge_root)$/i;
function startCommand(w) {
  // As start-bridge.cmd itself starts the Bridge, minimised and quiet: the page already open reloads by itself.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => START_ENV.test(k)));
  env.BRIDGE_PORT = String(cfg.PORT);
  return { exe: process.env.ComSpec || 'cmd.exe', args: ['/d', '/c', 'start', 'My Project Bridge', '/min', process.env.ComSpec || 'cmd.exe', '/d', '/k', '.\\start-bridge.cmd', 'run', 'quiet'], cwd: w.app, env };
}
/** Writes the helper and its plan into a new temp folder: { dir, helper, planFile }. */
function writePlan(plan, w = where()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-update-'));
  const helper = path.join(dir, 'update-swap.js');
  fs.copyFileSync(path.join(__dirname, 'update-swap.js'), helper);
  const planFile = path.join(dir, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({ wait: w.wait || [process.pid], console: w.wait ? 0 : CONSOLE, last: lastFile(w), start: w.start === undefined ? startCommand(w) : w.start, ...plan }));
  return { dir, helper, planFile };
}
/** Starts the helper from the temp folder; the caller then exits with HANDOVER_EXIT. */
function handover(plan, w = where()) {
  const { helper, planFile } = writePlan(plan, w);
  // The whole environment, in memory only, so the restarted Bridge has what this one had (BRIDGE_OPEN aside:
  // start-bridge.cmd sets it).
  const env = { ...process.env };
  delete env.BRIDGE_OPEN;
  spawn(process.execPath, [helper, planFile], { cwd: os.tmpdir(), env, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
function freeOldName(w, v) {
  let n = oldName(w, v), i = 2;
  while (fs.existsSync(path.join(w.parent, n))) n = oldName(w, v) + '-' + i++;
  return path.join(w.parent, n);
}

/** Install (zip route): the self-test, then the hand-over. anyway: the person pressed Install anyway on a warning. */
async function installZip(p, anyway, w, exit) {
  if (p.check.code && !anyway) return fail('This zip is not signed by the Bridge\'s maker: ' + WARN[p.check.code] + ' Press Install anyway only if you trust where it came from.');
  if (p.check.code && p.source !== 'file') return fail('A download from GitHub is never installed without its signature.');
  const t = await selfTest(p.dir, p.version, w);
  if (t) return fail('My Project Bridge ' + p.version + ' was not installed: started as a test copy, ' + t + '. Nothing was changed. Download it again, or tell the Bridge\'s maker.');
  const plan = { mode: 'swap', app: w.app, incoming: p.dir, old: freeOldName(w, w.version), from: w.version, to: p.version };
  if (w.dry) return { ok: true, dryRun: 'test copy: My Project Bridge ' + p.version + ' passed its test start; a real Bridge would now stop, put it in ' + w.app + ' (the old one kept as ' + path.basename(plan.old) + ') and start it' };
  try { fs.mkdirSync(updateDir(w), { recursive: true }); } catch {}
  handover(plan, w);
  pending = null; // its folder is now the helper's
  exit();
  return { ok: true, restarting: true, version: p.version };
}

// ---- the old copies kept beside this one: Go back, Remove ----

function oldCopies(w = where()) {
  let names = [];
  try { names = fs.readdirSync(w.parent); } catch {}
  const re = OLD_RE(w.base);
  return names.map(n => ({ n, m: re.exec(n) })).filter(x => x.m && fs.existsSync(path.join(w.parent, x.n, 'server.js')))
    .map(x => ({ folder: x.n, version: x.m[1] })).sort((a, b) => release.compareVersions(b.version, a.version));
}

/** Go back (or forward) to a copy kept beside this one: the same hand-over, without the version rule. */
function switchTo(folder, w, exit) {
  const o = oldCopies(w).find(x => x.folder === folder);
  if (!o) return fail('That copy is not beside this one any more. Open About again to see what is kept.');
  const dir = path.join(w.parent, o.folder);
  const whyNot = bridgeWhy(dir);
  if (whyNot) return fail('My Project Bridge ' + o.version + ' beside this one cannot be started again: ' + whyNot + '. Remove it, or unzip that version by hand.');
  const plan = { mode: 'swap', app: w.app, incoming: dir, old: freeOldName(w, w.version), from: w.version, to: o.version, extra: { back: true } };
  if (w.dry) return { ok: true, dryRun: 'test copy: a real Bridge would now stop, swap in ' + o.folder + ' and start it' };
  dropPending();
  handover(plan, w);
  exit();
  return { ok: true, restarting: true, version: o.version };
}

/** Remove an old copy: to the Recycle Bin, and only when nothing of yours is left in it. */
async function removeOld(folder, w = where()) {
  const o = oldCopies(w).find(x => x.folder === folder);
  if (!o) return fail('That copy is not beside this one any more.');
  const dir = path.join(w.parent, o.folder);
  for (const d of ['data', 'projects.json', '.git']) if (fs.existsSync(path.join(dir, d))) return fail('The old copy still holds ' + d + ', so it was not removed (it may be yours). Look in ' + dir + ', move what you need, then remove the folder yourself.');
  if (w.dry) return { ok: true, dryRun: 'test copy: ' + o.folder + ' would go to the Recycle Bin' };
  const r = await require('./platform').recycle(dir);
  if (r.error) return fail('The old copy could not be moved to the Recycle Bin (' + r.error + '). Delete ' + dir + ' yourself.');
  return { ok: true, removed: o.folder };
}

function lastResult(w = where()) {
  try { const v = JSON.parse(fs.readFileSync(lastFile(w), 'utf8')); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
// Folders a check left beside this one (the Bridge stopped before Install, or after a failed one).
function tidy(w = where()) {
  let names = [];
  try { names = fs.readdirSync(w.parent); } catch {}
  for (const n of names) {
    if (!n.startsWith(NEW_PREFIX(w)) || (pending && path.join(w.parent, n) === pending.staging)) continue;
    // Another Bridge that is still running owns it; this one's own leftovers, and those of Bridges gone, go.
    const owner = Number((/^(\d+)-/.exec(n.slice(NEW_PREFIX(w).length)) || [])[1]);
    if (owner && owner !== process.pid) { try { process.kill(owner, 0); continue; } catch (e) { if (e.code === 'EPERM') continue; } }
    fs.rmSync(path.join(w.parent, n), { recursive: true, force: true });
  }
}

module.exports = {
  where, openZip, bridgeWhy, badName, fromFile, latest, check, download, selfTest, installZip, switchTo, removeOld,
  oldCopies, lastResult, lastFile, tidy, handover, writePlan, WARN, HANDOVER_EXIT, PRIVATE_FOR_NOW,
  get pending() { return pending; }, set pending(v) { pending = v; }, dropPending, shown,
  get busy() { return busy; }, set busy(v) { busy = v; },
};
