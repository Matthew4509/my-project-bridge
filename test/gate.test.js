// The publish guard (lib/gate.js, tools/gate.js): turned on and off per project, never touching a hook it did not
// write, refused (with the line to add by hand) where git would not run it, and a real git push through the hook:
// stopped while the audit says "fix first", let through when the project is ready.
// Run: node test/gate.test.js   (git on PATH; everything in a temp folder, the Bridge's data folder too).
// The key is put together at run time, so no key-shaped text sits in this file.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-gate-'));
process.env.BRIDGE_DATA = path.join(tmp, 'data'); // before lib/config is loaded: the hook names this data folder
const gate = require('../lib/gate');

let failures = 0;
const check = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + ': ' + e.message); } };
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
function repo(name, files = { 'index.html': '<!doctype html><title>Shop</title>' }) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  // A noreply address: a real one in the commits is itself a finding (DISC-005), and would stop every push here.
  git(dir, 'config', 'user.email', '12345+tester@users.noreply.github.com'); git(dir, 'config', 'user.name', 'Tester'); git(dir, 'config', 'commit.gpgsign', 'false');
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'one');
  return dir;
}
const hook = dir => path.join(dir, '.git', 'hooks', 'pre-push');
const globalHooks = (() => { try { return git(tmp, 'config', '--global', '--get', 'core.hooksPath').trim(); } catch { return ''; } })();

(async () => {
  const P = { name: 'Shop' };
  const clean = { findings: [], partly: false, notRead: [], cut: [] };
  check('the report: a clean audit is ready, with no word about what was not read', () => {
    assert(/is ready to publish \(no Critical or High finding\)/.test(gate.report(P, clean)));
    assert.strictEqual(gate.isReady({ ...clean, verdict: 'passed' }), true);
  });
  check('the report: partly checked does not say a plain ready, and lists what was not read; the push may go', () => {
    const a = { findings: [], partly: true, notRead: ['Code files over 800 KB: 2'], cut: [], verdict: 'passed' };
    const t = gate.report(P, a);
    assert(/PARTLY CHECKED/.test(t) && /Code files over 800 KB: 2/.test(t), t);
    assert(!/is ready to publish \(no Critical/.test(t), t);
    assert.strictEqual(gate.isReady(a), true);
  });
  check('the report: a part that stopped or crashed is not ready, even with no finding', () => {
    const a = { findings: [], partly: true, notRead: ['The code check stopped after 125 s, so what it found is lost'], cut: ['The code check stopped after 125 s, so what it found is lost'], verdict: 'passed' };
    const t = gate.report(P, a);
    assert.strictEqual(gate.isReady(a), false);
    assert(/NOT READY TO PUBLISH/.test(t) && /did not finish/.test(t) && /125 s/.test(t), t);
    assert(/do not use --no-verify/.test(t), t);
  });
  check('the report: faults and a stopped part together name both', () => {
    const f = { sev: 'High', rule: 'SEC-001', where: 'a.js:1', title: 'A key', fix: 'Remove it.' };
    const a = { findings: [f], partly: true, notRead: ['The AI agent files check crashed, so what it found is lost'], cut: ['The AI agent files check crashed, so what it found is lost'], verdict: 'fix-first' };
    const t = gate.report(P, a);
    assert(/1 fault to fix first/.test(t) && /did not finish/.test(t), t);
    assert.strictEqual(gate.isReady(a), false);
  });
  check('the report: an audit saved before these fields reads as it did', () => {
    assert(/is ready to publish \(/.test(gate.report(P, { findings: [] })));
    assert.strictEqual(gate.isReady({ findings: [], verdict: 'passed' }), true);
  });

  const plain = path.join(tmp, 'plain'); fs.mkdirSync(plain);
  check('a folder that is not a git repository has no guard to add', () => assert.strictEqual(gate.guardState(plain).state, 'no-git'));

  if (globalHooks) console.log('skip the on/off and push checks: this PC sends every hook to ' + globalHooks + ' (core.hooksPath)');
  else {
    const a = repo('a');
    check('off at first; Turn on writes .git/hooks/pre-push with the mark, and says on (current)', () => {
      assert.strictEqual(gate.guardState(a).state, 'off');
      assert.strictEqual(gate.turnOn(a).ok, true);
      assert(fs.readFileSync(hook(a), 'utf8').includes(gate.MARK));
      assert.deepStrictEqual(gate.guardState(a), { state: 'on', current: true });
    });
    check('Turn off removes only its own hook', () => {
      assert.strictEqual(gate.turnOff(a).ok, true);
      assert(!fs.existsSync(hook(a)));
      assert.strictEqual(gate.guardState(a).state, 'off');
    });
    const b = repo('b');
    fs.writeFileSync(hook(b), '#!/bin/sh\necho mine\n');
    check('a pre-push hook of the project\'s own is never changed or removed; the line to add is given', () => {
      const s = gate.guardState(b);
      assert.strictEqual(s.state, 'other');
      assert(s.line && s.line.includes('gate.js'));
      assert.strictEqual(gate.turnOn(b).ok, false);
      assert.strictEqual(gate.turnOff(b).ok, false);
      assert.strictEqual(fs.readFileSync(hook(b), 'utf8'), '#!/bin/sh\necho mine\n');
    });
    const c = repo('c');
    git(c, 'config', 'core.hooksPath', '.husky');
    check('hooks sent elsewhere (core.hooksPath, as Husky does): not added, the line to add is given', () => {
      const s = gate.guardState(c);
      assert.strictEqual(s.state, 'unsupported');
      assert(s.line);
      assert.strictEqual(gate.turnOn(c).ok, false);
      assert(!fs.existsSync(hook(c)));
    });

    // A real push through the hook, to a bare repository beside it.
    const remote = path.join(tmp, 'remote.git');
    execFileSync('git', ['init', '-q', '--bare', remote], { windowsHide: true });
    const d = repo('d');
    git(d, 'remote', 'add', 'origin', remote);
    gate.turnOn(d);
    const push = () => spawnSync('git', ['-C', d, 'push', 'origin', 'HEAD:main'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    const ok = push();
    check('a ready project is pushed, and the guard says it is ready', () => {
      assert.strictEqual(ok.status, 0, ok.stderr);
      assert(/ready to publish/.test(ok.stderr), ok.stderr);
    });
    fs.writeFileSync(path.join(d, 'pay.js'), 'const k = "' + 'sk_' + 'live_' + 'Q3x9Lm2Vb7Tn4Rk8Wd5Hj6Zp' + '";\n');
    git(d, 'add', '-A'); git(d, 'commit', '-qm', 'two');
    const before = git(remote, 'rev-parse', 'main').trim();
    const stopped = push();
    check('a push holding a live key is stopped: the hook fails, the remote is unchanged, the fault is named', () => {
      assert.notStrictEqual(stopped.status, 0);
      assert.strictEqual(git(remote, 'rev-parse', 'main').trim(), before);
      assert(/NOT READY TO PUBLISH/.test(stopped.stderr) && /SEC-003/.test(stopped.stderr) && /pay\.js:1/.test(stopped.stderr), stopped.stderr);
      assert(/do not use --no-verify/.test(stopped.stderr));
    });
    // The Bridge it was turned on from is gone: the push stops and says how to take the guard off.
    const e = repo('e');
    git(e, 'remote', 'add', 'origin', remote);
    gate.turnOn(e);
    fs.writeFileSync(hook(e), fs.readFileSync(hook(e), 'utf8').replace(/^GATE=.*$/m, "GATE='" + tmp.replace(/\\/g, '/') + "/no-such-bridge/tools/gate.js'"));
    const gone = spawnSync('git', ['-C', e, 'push', 'origin', 'HEAD:other'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    check('a guard whose Bridge is gone stops the push and says how to turn it off', () => {
      assert.notStrictEqual(gone.status, 0);
      assert(/is gone/.test(gone.stderr) && /delete \.git\/hooks\/pre-push/.test(gone.stderr), gone.stderr);
    });
    // A check that crashed or ran out of time knows nothing about what it did not read: the push stops, and says so.
    const g = repo('g');
    git(g, 'remote', 'add', 'origin', remote);
    gate.turnOn(g);
    const cutPush = spawnSync('git', ['-C', g, 'push', 'origin', 'HEAD:cut'], { encoding: 'utf8', windowsHide: true, timeout: 120000, env: { ...process.env, BRIDGE_TEST_AUDIT_SLOW: 'code=crash' } });
    check('a part of the audit that crashed stops the push, and the report says what was not checked', () => {
      assert.notStrictEqual(cutPush.status, 0, cutPush.stderr);
      assert(/did not finish/.test(cutPush.stderr) && /The code check crashed/.test(cutPush.stderr), cutPush.stderr);
      assert(!/ready to publish \(/.test(cutPush.stderr), cutPush.stderr);
    });
    // The line the window gives for a project's own hook, added by hand as a person would: it runs as written (node
    // usually sits under "C:/Program Files", so each part must be quoted for sh).
    const f = repo('f');
    git(f, 'remote', 'add', 'origin', remote);
    fs.writeFileSync(hook(f), '#!/bin/sh\necho mine >&2\n');
    const line = gate.guardState(f).line;
    fs.writeFileSync(hook(f), '#!/bin/sh\necho mine >&2\n' + line + ' || exit 1\n');
    const byHand = spawnSync('git', ['-C', f, 'push', 'origin', 'HEAD:byhand'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    check('the line to add by hand runs from a project\'s own hook', () => {
      assert.strictEqual(byHand.status, 0, byHand.stderr);
      assert(/mine/.test(byHand.stderr) && /ready to publish/.test(byHand.stderr), byHand.stderr);
    });
  }

  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10 });
  console.log(failures ? failures + ' FAILED' : 'all passed');
  process.exit(failures ? 1 : 0);
})();
