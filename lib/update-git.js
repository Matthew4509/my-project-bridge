// Updates for a Bridge that is a git clone: the newest v<version> tag at the Bridge's FIXED address (lib/release.js,
// never the folder's own `origin`), fetched into a private ref, and taken only when the tag's message carries a
// signature from the release key for that exact commit and its files. Checked with Node: no gpg, no ssh-keygen, no
// git signing set up anywhere. The working folder must have no changed tracked files (nothing is ever reset, stashed
// or overwritten), and the signed commit must be a fast-forward of where it is. The new files are first opened in a
// temp folder (git archive of the signed commit) and started once as a test copy; only then does git move this
// folder forward, and the Bridge restarts. Git runs fenced as everywhere in the Bridge, with hooks pointed at an
// empty folder and never stopping to ask for a password.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const cfg = require('./config');
const release = require('./release');
const { fenced, gitConfigRisky } = require('./gitstate');
const update = require('./update');

const REF = v => 'refs/bridge-update/v' + v;
let noHooksDir = null;
const noHooks = () => noHooksDir || (noHooksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-no-hooks-')));
process.on('exit', () => { if (noHooksDir) try { fs.rmSync(noHooksDir, { recursive: true, force: true }); } catch {} });
const url = () => process.env.BRIDGE_RELEASE_GIT || release.GIT_URL;
const fail = error => ({ ok: false, error });
const firstLine = s => String(s || '').trim().split(/\r?\n/).find(Boolean) || '';

function git(dir, args, timeout = 20000) {
  const fence = fenced(dir);
  return new Promise(resolve => {
    execFile('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=' + noHooks(), '-c', 'log.showSignature=false', '-c', 'credential.helper=', '-c', 'protocol.ext.allow=never', ...fence.args, '-C', dir, ...args], {
      timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', LC_ALL: 'C', ...fence.env },
    }, (err, stdout, stderr) => resolve({ ok: !err, missing: !!(err && err.code === 'ENOENT'), raw: String(stdout || ''), out: String(stdout || '').trim(), err: String(stderr || (err && err.message) || '').trim() }));
  });
}

/** Can this copy take updates through git? '' when it can, else why not (a sentence). */
function whyNotClone(dir) {
  let st;
  try { st = fs.statSync(path.join(dir, '.git')); } catch { return 'this copy is not a git clone'; }
  if (!st.isDirectory() && !st.isFile()) return 'this copy is not a git clone';
  if (gitConfigRisky(dir)) return 'this folder\'s git settings could run a program (a filter, hook or similar), so the Bridge does not run git here';
  return '';
}
const isClone = (dir = cfg.HERE) => !whyNotClone(dir);

/** The newest v<version> tag at the fixed address, and whether it is newer. Nothing is fetched yet. */
async function check(w = update.where()) {
  const no = whyNotClone(w.app);
  if (no) return fail('Updates through git: ' + no + '.');
  const r = await git(w.app, ['ls-remote', '--tags', '--refs', url()], 30000);
  if (r.missing) return fail('Git is not installed, so this clone cannot update through git. Install it (About › Git), or use Update from a zip….');
  if (!r.ok) return fail(/not found|could not read|authentication|403|401/i.test(r.err)
    ? update.PRIVATE_FOR_NOW
    : 'GitHub could not be asked (' + firstLine(r.err).slice(0, 160) + '). Check this PC is online, then press Check for updates again.');
  const versions = [...r.out.matchAll(/refs\/tags\/v(\d{1,4}\.\d{1,4}\.\d{1,4})$/gm)].map(m => m[1]).sort(release.compareVersions);
  if (!versions.length) return fail(update.PRIVATE_FOR_NOW);
  const v = versions[versions.length - 1];
  return { ok: true, route: 'git', version: v, newer: release.newer(v, w.version), mine: w.version };
}

// The working folder as it stands: no changed tracked files, and where HEAD is.
async function standing(dir) {
  const [st, head] = await Promise.all([git(dir, ['status', '--porcelain', '--untracked-files=no', '--ignore-submodules=all']), git(dir, ['rev-parse', 'HEAD'])]);
  return { changed: st.ok ? st.raw.split('\n').filter(l => l.trim()).map(l => l.slice(3)) : null, head: head.ok ? head.out : null };
}

/** Fetch and check v<version>: the signed tag, the commit it names, its files. Then opened in a temp folder. */
async function get(version, w = update.where()) {
  const no = whyNotClone(w.app);
  if (no) return fail('Updates through git: ' + no + '.');
  if (!release.isVersion(version)) return fail('That is not a version. Press Check for updates again.');
  if (!release.newer(version, w.version)) return fail('This Bridge is ' + w.version + ' already: nothing newer to take.');
  const f = await git(w.app, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', url(), '+refs/tags/v' + version + ':' + REF(version)], 120000);
  if (!f.ok) return fail('The tag v' + version + ' could not be fetched (' + firstLine(f.err).slice(0, 160) + '). Press Check for updates again.');
  const drop = () => git(w.app, ['update-ref', '-d', REF(version)]);
  const refuse = async msg => { await drop(); return fail(msg); };
  const type = await git(w.app, ['cat-file', '-t', REF(version)]);
  if (type.out !== 'tag') return refuse('v' + version + ' on GitHub is not a signed release tag (it is a plain tag), so it was not taken. Update from a zip… instead, or tell the Bridge\'s maker.');
  const tag = await git(w.app, ['cat-file', 'tag', REF(version)]);
  const head = tag.out.split('\n\n')[0];
  const commit = (/^object ([0-9a-f]{40,64})$/m.exec(head) || [])[1];
  if (!commit || !/^type commit$/m.test(head) || !new RegExp('^tag v' + version.replace(/\./g, '\\.') + '$', 'm').test(head)) return refuse('The tag v' + version + ' does not point at a commit of that name, so it was not taken.');
  const tree = await git(w.app, ['rev-parse', commit + '^{tree}']);
  const c = release.tagCheck(release.tagSigOf(tag.out), version, commit, tree.out, w.key);
  if (c.code) return refuse(c.code === 'newkey'
    ? 'v' + version + ' is signed with a key this Bridge does not know, so it was not taken. If the Bridge\'s maker changed keys, update this copy by hand once (git pull --ff-only in its folder, or Update from a zip…); updates are automatic again from it on.'
    : c.code === 'none' ? 'v' + version + ' carries no signature, so it was not taken. Something is wrong with that release; tell the Bridge\'s maker.'
    : 'v' + version + ' was fetched but not taken: ' + c.why + '. Nothing was changed.');
  const s = await standing(w.app);
  if (!s.head) return refuse('Git could not say where this copy is (no commit?), so nothing was taken.');
  if (s.changed && s.changed.length) return refuse('Files in the Bridge\'s folder were changed here (' + s.changed.slice(0, 3).join(', ') + (s.changed.length > 3 ? ', …' : '') + '), and an update could overwrite them. Commit or undo those changes yourself, then press Check for updates again.');
  const ff = await git(w.app, ['merge-base', '--is-ancestor', s.head, commit]);
  if (!ff.ok) return refuse('This copy has commits of its own that v' + version + ' does not, so it cannot simply move forward. Bring it up to date by hand (git pull), or use Update from a zip….');
  // The signed files, opened in a temp folder for the test start (git archive, then Windows' own tar).
  update.dropPending();
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-git-'));
  const tarFile = path.join(staging, 'v.tar'), dir = path.join(staging, 'app');
  const a = await git(w.app, ['archive', '--format=tar', '-o', tarFile, commit], 60000);
  fs.mkdirSync(dir);
  const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const x = a.ok && await new Promise(r => execFile(TAR, ['-x', '-f', tarFile, '-C', dir], { windowsHide: true }, e => r(!e)));
  const whyNot = x ? update.bridgeWhy(dir) : 'it could not be opened';
  const v2 = x && (/const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(dir, 'lib', 'config.js'), 'utf8')) || [])[1];
  if (whyNot || v2 !== version) { fs.rmSync(staging, { recursive: true, force: true }); return refuse('v' + version + ' was not taken: ' + (whyNot || 'its files say version ' + v2) + '.'); }
  update.pending = { route: 'git', source: 'github', version, staging, dir, commit, from: s.head, check: { code: '', why: '' }, cleanup: () => { drop(); } };
  return { ok: true, pending: update.shown(update.pending) };
}

/** Install (git route): the test start, then a fast-forward to the exact signed commit, then a restart. */
async function install(p, w, exit) {
  const t = await update.selfTest(p.dir, p.version, w);
  if (t) return fail('My Project Bridge ' + p.version + ' was not installed: started as a test copy, ' + t + '. Nothing was changed.');
  if (w.dry) return { ok: true, dryRun: 'test copy: v' + p.version + ' passed its test start; a real Bridge would now move this clone forward to ' + p.commit.slice(0, 7) + ' and restart' };
  const s = await standing(w.app);
  if (s.head !== p.from || (s.changed && s.changed.length)) return fail('This copy changed since the check (a commit or an edit), so nothing was taken. Press Check for updates again.');
  const m = await git(w.app, ['merge', '--ff-only', '--quiet', p.commit], 120000);
  if (!m.ok) return fail('The update did not go in (' + firstLine(m.err).slice(0, 160) + '). Nothing was changed.');
  update.dropPending();
  fs.mkdirSync(path.join(w.data, 'update'), { recursive: true });
  update.handover({ mode: 'restart', route: 'git', from: w.version, to: p.version, extra: { fromCommit: p.from, toCommit: p.commit } }, w);
  exit();
  return { ok: true, restarting: true, version: p.version };
}

/** Go back after a git update: the clone moved back to the commit it was on, only while nothing changed since. */
async function goBack(w, exit) {
  const last = update.lastResult(w);
  if (!last || last.route !== 'git' || !last.ok || !last.fromCommit || !last.toCommit) return fail('There is no git update to go back from.');
  const s = await standing(w.app);
  if (s.head !== last.toCommit) return fail('This clone has moved since the update (a commit or a pull), so going back is up to you: git log shows where it was (' + last.fromCommit.slice(0, 7) + ').');
  if (s.changed && s.changed.length) return fail('Files in the Bridge\'s folder were changed here, so going back could overwrite them. Commit or undo those changes, then press Go back again.');
  if (w.dry) return { ok: true, dryRun: 'test copy: a real Bridge would move this clone back to ' + last.fromCommit.slice(0, 7) + ' and restart' };
  const r = await git(w.app, ['reset', '--keep', '--quiet', last.fromCommit], 60000);
  if (!r.ok) return fail('Going back did not work (' + firstLine(r.err).slice(0, 160) + '). Nothing was changed.');
  update.handover({ mode: 'restart', route: 'git', from: last.to, to: last.from, extra: { back: true } }, w);
  exit();
  return { ok: true, restarting: true, version: last.from };
}

module.exports = { check, get, install, goBack, isClone, whyNotClone, git, REF, url };
