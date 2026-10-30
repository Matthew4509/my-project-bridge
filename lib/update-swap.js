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
// If the old copy cannot be put back either, there is no Bridge in its folder: UPDATE-FAILED.txt beside it says what
// happened and how to put it right, `last` goes beside it too, and the Bridge is started from whichever copy is left.
// start.env, when given, is laid over the helper's own environment (the plan file carries only what the start needs).
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
// The one way folders are moved; the tests replace it to make a move fail.
const io = { rename: (from, to) => fs.renameSync(from, to) };
// A virus scanner or the search indexer can hold a folder for a moment after the Bridge ends: try for a while.
async function moveRetry(from, to, tries) {
  for (let i = 0; ; i++) {
    try { io.rename(from, to); return null; } catch (e) {
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
  try {
    const env = s.env ? { ...process.env, ...s.env } : process.env;
    spawn(s.exe, s.args, { cwd: s.cwd, env, detached: true, stdio: 'ignore', windowsHide: false }).on('error', () => {}).unref();
  } catch {}
}
const why = e => (e && e.code === 'EPERM' || e && e.code === 'EBUSY' || e && e.code === 'EACCES')
  ? 'a program still had the Bridge\'s folder open (a terminal, an editor or a file window whose folder is the Bridge\'s)'
  : (e && e.message) || String(e);

async function swap(p) {
  const tries = p.tries == null ? 30 : p.tries;
  // Putting the old copy back matters most (without it there is no Bridge in its folder), so it is tried for longer.
  const backTries = p.backTries == null ? Math.max(tries, 120) : p.backTries;
  const fail = (step, e, extra = {}) => ({ ok: false, from: p.from, to: p.to, why: step + ': ' + why(e), ...extra });
  const putBack = async () => {
    const x = await moveRetry(p.old, p.app, backTries);
    return x && !fs.existsSync(p.app) ? { stranded: true, backWhy: why(x), old: path.basename(p.old), incoming: path.basename(p.incoming) } : {};
  };
  let e = await moveRetry(p.app, p.old, tries);
  if (e) return fail('the Bridge\'s folder could not be moved aside', e);
  e = await moveRetry(p.incoming, p.app, tries);
  if (e) return fail('the new copy could not be moved into place', e, await putBack());
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
    // While the new copy is still in the Bridge's folder the old one cannot go back there, so that is not tried.
    const out = await moveRetry(p.app, p.incoming, tries);
    return fail('your files could not be moved into the new copy', bad, out ? {} : await putBack());
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

// Neither copy is in the Bridge's folder: said in a plain file beside it, with the way back.
function tellStranded(p, r) {
  const parent = path.dirname(p.app), base = path.basename(p.app), old = path.basename(p.old), neu = path.basename(p.incoming);
  const lines = [
    'My Project Bridge: an update could not finish, and the Bridge could not be put back in its folder.',
    'When: ' + new Date().toISOString(),
    '',
    'Updating from ' + p.from + ' to ' + p.to + ', ' + r.why + '.',
    'Putting the old version back failed too: ' + r.backWhy + '.',
    '',
    'So there is no folder named "' + base + '" in ' + parent + ' just now. Nothing is lost: your Bridge is in',
    'these two folders there:',
    '  ' + old + '    your Bridge as it was (' + p.from + '), with your data folder, projects.json and notes',
    '  ' + neu + '    the new version (' + p.to + '), which was not installed',
    '',
    r.startedFrom ? 'So that you can keep working, the Bridge was started again from the folder "' + r.startedFrom + '".'
      : 'The Bridge could not be started again for you; the steps below start it.',
    '',
    'To put it right:',
    '  1. Quit the Bridge if it is running: About > Quit, or close its console window ("My Project Bridge" on the',
    '     taskbar). Close any terminal, editor or File Explorer window that is open in either folder above.',
    '  2. In File Explorer, go to ' + parent,
    '  3. Rename the folder "' + old + '" to "' + base + '".',
    '  4. Open "' + base + '" and double-click start-bridge.cmd.',
    '  5. Delete the folder "' + neu + '" (it holds only the new version\'s files; if something of yours is',
    '     missing after step 4, look in it first), then try the update again from About > Updates.',
    '',
    'You can delete this file afterwards.',
  ];
  try { fs.writeFileSync(path.join(parent, 'UPDATE-FAILED.txt'), lines.join('\r\n') + '\r\n'); } catch {}
}

async function main(planFile) {
  const p = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  try { fs.unlinkSync(planFile); } catch {}
  await waitGone(p.wait || [], p.waitMs || 60000);
  await closeConsole(p.console);
  const r = p.mode === 'swap' ? await swap(p) : { ok: true, from: p.from, to: p.to };
  let run = p.start;
  if (r.stranded) {
    // Started from the copy that is left (the old one first), in its own folder: the Bridge's folder is not there.
    const left = [p.old, p.incoming].find(d => fs.existsSync(path.join(d, 'server.js')));
    run = run && left ? { ...run, cwd: left } : null;
    r.startedFrom = run ? path.basename(left) : '';
    tellStranded(p, r);
  }
  // Never written into a Bridge's folder that is not there (that would make the folder again, in the way of the old
  // copy going back): beside it instead.
  const last = !p.app || fs.existsSync(p.app) ? p.last : path.join(path.dirname(p.app), '.' + path.basename(p.app) + '.update-last.json');
  record(last, { route: p.route || 'zip', ...r, ...(p.extra || {}) });
  start(run);
  // The helper's own temp folder (this file and its plan), when it runs from one the Bridge made.
  if (/^bridge-update-/.test(path.basename(__dirname))) try { fs.rmSync(__dirname, { recursive: true, force: true }); } catch {}
  return r;
}

if (require.main === module) main(process.argv[2]).catch(e => { try { process.stderr.write(String(e && e.stack || e)); } catch {} });
module.exports = { main, swap, io };
