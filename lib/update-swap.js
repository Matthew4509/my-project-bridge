// The hand-over helper for an update or Go back. The Bridge copies this file to the temp folder and starts it there,
// detached, then exits: Windows will not rename a folder that a running program sits in. It needs nothing from the
// Bridge's folder (Node's own modules only), so it keeps running while that folder is renamed.
//   node update-swap.js <plan.json>
// plan: { wait: [pid, ...], mode: 'swap' | 'restart', app, incoming, old, from, to, last, start: { exe, args, cwd, env } }
//   swap:    app -> old, incoming -> app (the same path, so shortcuts, Start with Windows and the link keep working),
//            then everything at the top of the old copy that the new one does not bring (data/, projects.json, .git,
//            your own notes) is moved across, except what the old version shipped itself (its release.json); the new
//            copy's empty projects.json gives way to yours.
//   restart: nothing is moved (git already brought the new files in); the Bridge is only started again.
// Any step that fails puts every folder back as it was and starts the old Bridge. What happened is written to
// `last` (data/update/last.json) for About to show.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

async function waitGone(pids, ms) {
  const end = Date.now() + ms;
  for (const pid of pids.filter(Boolean)) while (alive(pid) && Date.now() < end) await sleep(200);
}
// A virus scanner or the search indexer can hold a folder for a moment after the Bridge ends: try for a while.
async function moveRetry(from, to, tries) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return null; } catch (e) {
      if (i >= tries || !['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(e.code)) return e;
      await sleep(500);
    }
  }
}
function record(file, v) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ ...v, when: new Date().toISOString() }, null, 1) + '\n'); } catch {}
}
function start(s) {
  if (!s) return;
  try { spawn(s.exe, s.args, { cwd: s.cwd, env: s.env || process.env, detached: true, stdio: 'ignore', windowsHide: false }).unref(); } catch {}
}
const why = e => (e && e.code === 'EPERM' || e && e.code === 'EBUSY' || e && e.code === 'EACCES')
  ? 'a program still had the Bridge\'s folder open (a terminal, an editor or a file window whose folder is the Bridge\'s)'
  : (e && e.message) || String(e);

async function swap(p) {
  const tries = p.tries == null ? 30 : p.tries;
  const fail = (step, e, extra = {}) => ({ ok: false, from: p.from, to: p.to, why: step + ': ' + why(e), ...extra });
  let e = await moveRetry(p.app, p.old, tries);
  if (e) return fail('the Bridge\'s folder could not be moved aside', e);
  e = await moveRetry(p.incoming, p.app, tries);
  if (e) { await moveRetry(p.old, p.app, tries); return fail('the new copy could not be moved into place', e); }
  // Yours, from the old copy: anything at its top the new one does not bring, and always projects.json. What the old
  // version shipped itself (its release.json, written by the bake) stays with it, so it is whole if you switch back.
  let shipped = new Set();
  try { const r = JSON.parse(fs.readFileSync(path.join(p.old, 'release.json'), 'utf8')); if (Array.isArray(r.top)) shipped = new Set(r.top.map(String)); } catch {}
  const moved = [];
  let bad = null;
  for (const name of fs.readdirSync(p.old)) {
    const to = path.join(p.app, name);
    if (name === 'projects.json' && fs.existsSync(to)) { try { fs.rmSync(to); } catch (x) { bad = x; break; } }
    if (fs.existsSync(to) || (shipped.has(name) && name !== 'projects.json')) continue;
    const x = await moveRetry(path.join(p.old, name), to, tries);
    if (x) { bad = Object.assign(x, { message: name + ' ' + x.message }); break; }
    moved.push(name);
  }
  if (bad) {
    for (const name of moved.reverse()) await moveRetry(path.join(p.app, name), path.join(p.old, name), tries);
    await moveRetry(p.app, p.incoming, tries);
    await moveRetry(p.old, p.app, tries);
    return fail('your files could not be moved into the new copy', bad);
  }
  return { ok: true, from: p.from, to: p.to, old: path.basename(p.old), carried: moved.length };
}

// The Bridge's own console window (start-bridge.cmd) sits in the Bridge's folder. It closes itself on the hand-over's
// exit code; if it is still there a few seconds later (another exit code came through), it is closed here, but only
// when Windows says that process is cmd.exe.
async function closeConsole(pid) {
  if (!pid || process.platform !== 'win32') return;
  await waitGone([pid], 3000);
  if (!alive(pid)) return;
  const { execFileSync } = require('child_process');
  try {
    const row = execFileSync('tasklist.exe', ['/FI', 'PID eq ' + Number(pid), '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
    if (/^"cmd\.exe"/i.test(row.trim())) execFileSync('taskkill.exe', ['/PID', String(Number(pid)), '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {}
  await waitGone([pid], 3000);
}

async function main(planFile) {
  const p = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  try { fs.unlinkSync(planFile); } catch {}
  await waitGone(p.wait || [], p.waitMs || 60000);
  await closeConsole(p.console);
  const r = p.mode === 'swap' ? await swap(p) : { ok: true, from: p.from, to: p.to };
  record(p.last, { route: p.route || 'zip', ...r, ...(p.extra || {}) });
  start(p.start);
  // The helper's own temp folder (this file and its plan), when it runs from one the Bridge made.
  if (/^bridge-update-/.test(path.basename(__dirname))) try { fs.rmSync(__dirname, { recursive: true, force: true }); } catch {}
  return r;
}

if (require.main === module) main(process.argv[2]).catch(e => { try { process.stderr.write(String(e && e.stack || e)); } catch {} });
module.exports = { main, swap };
