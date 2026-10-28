// About › Updates: Check for updates (GitHub Releases, or the signed git tags for a clone), Update from a zip…, Install,
// and the old copies kept beside this one (Go back, Remove). One update action at a time.
'use strict';
const cfg = require('../config');
const desktop = require('../desktop');
const update = require('../update');
const updateGit = require('../update-git');
const release = require('../release');
const { shutdown } = require('../lifecycle');

// The reply goes out first; then the Bridge stops its local copies and exits for the helper.
const exit = () => setTimeout(() => shutdown(update.HANDOVER_EXIT), 300);
// A test copy asks only a stand-in GitHub (tests) and never runs git; the demo asks nothing.
const standIn = () => !!process.env.BRIDGE_RELEASE_API;
const offline = () => cfg.DEMO ? { ok: false, error: 'The demo does not check for updates.' }
  : cfg.DRY && !standIn() ? { ok: true, dryRun: 'test copy: a real Bridge would now ask GitHub for the newest release (' + release.REPO + ')' } : null;

// Steps that end with the Bridge stopping (install, switch, go back) wait for a running backup, as Quit does.
function midBackup() {
  const j = require('../state').state.backups.status();
  return j && !j.finished ? { ok: false, error: 'A backup is running. Wait for it to finish, or Cancel it (Backups), then try again.' } : null;
}

async function one(name, fn) {
  if (update.busy) return { ok: false, error: 'An update step is already running (' + update.busy + '). Wait for it, then try again.' };
  update.busy = name;
  try { return await fn(); } finally { update.busy = ''; }
}

function status() {
  update.tidy();
  const w = update.where();
  const git = updateGit.whyNotClone(w.app);
  const last = update.lastResult(w);
  return {
    version: cfg.VERSION, dry: cfg.DRY, demo: cfg.DEMO, route: git ? 'zip' : 'git', gitWhy: git, hasKey: !!release.RELEASE_KEY,
    pending: update.shown(update.pending), busy: update.busy || '',
    last, old: update.oldCopies(w), gitBack: !!(last && last.route === 'git' && last.ok && last.fromCommit && !last.back),
  };
}

const get = { '/api/update': status };

const post = {
  '/api/update/check': () => one('checking', async () => {
    const off = offline(); if (off) return off;
    const w = update.where();
    if (updateGit.isClone(w.app)) return cfg.DRY ? { ok: true, dryRun: 'test copy: a real Bridge would now ask ' + release.GIT_URL + ' for its signed tags' } : updateGit.check(w);
    return update.check(w);
  }),
  '/api/update/get': ({ body }) => one('downloading', async () => {
    const off = offline(); if (off) return off;
    const w = update.where();
    if (body.route === 'git') return cfg.DRY ? { ok: true, dryRun: 'test copy: git is never run for an update' } : updateGit.get(String(body.version || ''), w);
    return update.download(String(body.version || ''), w);
  }),
  '/api/update/pick': () => desktop.pickZip(),
  '/api/update/zip': ({ body }) => one('opening the zip', async () => {
    if (cfg.DEMO) return { ok: false, error: 'The demo does not install updates.' };
    return update.fromFile(body.path);
  }),
  '/api/update/install': ({ body }) => midBackup() || one('installing', async () => {
    const p = update.pending;
    if (!p || p.version !== body.version) return { ok: false, error: 'That update is no longer waiting here (the Bridge started again, or another was opened). Check or pick it again.' };
    const w = update.where();
    return p.route === 'git' ? updateGit.install(p, w, exit) : update.installZip(p, body.anyway === true, w, exit);
  }),
  '/api/update/cancel': () => { if (!update.busy) update.dropPending(); return { ok: true }; },
  '/api/update/switch': ({ body }) => midBackup() || one('switching', async () => update.switchTo(String(body.folder || ''), update.where(), exit)),
  '/api/update/git-back': () => midBackup() || one('going back', async () => updateGit.goBack(update.where(), exit)),
  '/api/update/remove-old': ({ body }) => one('removing', async () => update.removeOld(String(body.folder || ''))),
};

module.exports = { get, post };
