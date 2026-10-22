// The demo's made-up sites stop with the demo (X-07 of the four-apps audit): demo/live-sites.js serves the live copies
// and the "another program" site and stops itself once the demo Bridge stops answering; the demo only ends a process
// from an old pid file when it is still the demo's helper; the audits run before the starts. Uses free ports and a
// temp folder; never touches data-demo or the demo's fixed ports.
// Run: node test/demo.test.js   (Windows; no packages)
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const { killPidFile, SITES, DEMO_PORTS } = require('../demo/demo');

const NODE = process.execPath;
const LIVE_SITES = path.join(__dirname, '..', 'demo', 'live-sites.js');
const DEMO = fs.readFileSync(path.join(__dirname, '..', 'demo', 'demo.js'), 'utf8');
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + ': ' + e.message); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const portOpen = port => new Promise(r => { const s = net.connect(port, '127.0.0.1'); s.setTimeout(1000, () => { s.destroy(); r(false); }); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
const get = port => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/' }, res => { res.resume(); resolve(res); }).on('error', reject));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitFor = async (test, ms) => { const t0 = Date.now(); while (!(await test()) && Date.now() - t0 < ms) await sleep(200); return test(); };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-demo-test-'));
const kids = [];

async function main() {
  await check('the "other program" site runs in its own self-stopping live-sites.js, never a bare site.js', () => {
    assert(SITES.some(s => s.start === 'other'), 'the demo still has an "other program" site');
    assert(/SITES\.filter\(s => s\.start === 'other'\)\.map\(s => \(\{ port: s\.port, dir: path\.join\(WS, s\.folder\), mode: 'local' \}\)\)/.test(DEMO), 'buildLive writes it as a local site');
    assert(/helper\('other-sites\.json', 'other-site\.pid'\)/.test(DEMO) && /helper\('live-sites\.json', 'live-sites\.pid'\)/.test(DEMO), 'two helpers: shooting the amber one down leaves the live copies up');
    assert(!/spawn\(process\.execPath, \[SITE,/.test(DEMO), 'demo.js no longer starts site.js by itself');
    for (const p of [5301, 5307, 5320, 5321]) assert(DEMO_PORTS.includes(p), 'port ' + p + ' is waited for');
  });

  await check('the audits run before the sites start, and a failed step does not end the demo', () => {
    const audit = DEMO.indexOf("await step('audited '"), start = DEMO.indexOf("await step('started '");
    assert(audit > 0 && start > audit, 'audits first');
    assert(/const step = async \(label, job\) => \{ try \{/.test(DEMO), 'each step is caught');
  });

  await check('live-sites.js: a local site has no HSTS, a live copy does; it stops within 5 s of the Bridge', async () => {
    const bridgePort = await freePort(), localPort = await freePort(), livePort = await freePort(), httpPort = await freePort();
    const bridge = net.createServer(s => s.destroy()).listen(bridgePort, '127.0.0.1');
    const dir = path.join(TMP, 'site');
    fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<!doctype html><title>Made-up</title>');
    const cfgFile = path.join(TMP, 'live-sites.json');
    fs.writeFileSync(cfgFile, JSON.stringify({ sites: [{ port: localPort, dir, mode: 'local' }, { host: 'made-up.example', port: livePort, dir }], httpPort }));
    const otherFile = path.join(TMP, 'other-sites.json'), otherPort = await freePort();
    fs.writeFileSync(otherFile, JSON.stringify({ sites: [{ port: otherPort, dir, mode: 'local' }] })); // no httpPort
    const other = spawn(NODE, [LIVE_SITES, otherFile, String(bridgePort), 'test-key'], { stdio: 'ignore', windowsHide: true });
    kids.push(other);
    const kid = spawn(NODE, [LIVE_SITES, cfgFile, String(bridgePort), 'test-key'], { stdio: 'ignore', windowsHide: true });
    kids.push(kid);
    assert(await waitFor(() => portOpen(localPort), 5000), 'the local site answers');
    const a = await get(localPort), b = await get(livePort);
    assert.strictEqual(a.statusCode, 200);
    assert(!a.headers['strict-transport-security'], 'no HSTS on the localhost site');
    assert(a.headers['content-security-policy'], 'the usual headers stay');
    assert(b.headers['strict-transport-security'], 'the live copy keeps HSTS');
    assert(await waitFor(() => portOpen(otherPort), 5000), 'a helper with no httpPort serves its site too');
    await sleep(2500);
    assert(await portOpen(localPort), 'it stays up while the Bridge answers');
    bridge.close();
    const t0 = Date.now();
    assert(await waitFor(async () => !(await portOpen(localPort)) && !(await portOpen(otherPort)), 6000), 'both helpers are gone after the Bridge stopped');
    assert(Date.now() - t0 < 5000, 'gone within 5 s (took ' + (Date.now() - t0) + ' ms)');
  });

  await check('an old pid file ends only the demo\'s own helper, never what now holds that number', async () => {
    // A stranger: a node process whose command line names no demo script.
    const stranger = spawn(NODE, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', windowsHide: true });
    kids.push(stranger);
    const f1 = path.join(TMP, 'stranger.pid');
    fs.writeFileSync(f1, String(stranger.pid));
    assert.strictEqual(killPidFile(f1, 'live-sites.js'), false);
    assert(alive(stranger.pid), 'the stranger is still running');
    assert(!fs.existsSync(f1), 'the stale pid file is removed');
    // The demo's helper, kept up by a stand-in Bridge that answers (looking up a command line can take seconds).
    const keepPort = await freePort(), keep = net.createServer(s => s.destroy()).listen(keepPort, '127.0.0.1');
    const helper = spawn(NODE, [LIVE_SITES, path.join(TMP, 'other-sites.json'), String(keepPort), 'k'], { stdio: 'ignore', windowsHide: true });
    kids.push(helper);
    await sleep(300);
    const f2 = path.join(TMP, 'helper.pid');
    fs.writeFileSync(f2, String(helper.pid));
    assert.strictEqual(killPidFile(f2, 'live-sites.js'), true, 'the helper is ended');
    assert(await waitFor(() => !alive(helper.pid), 3000), 'the helper is gone');
    keep.close();
    // No file, a junk file: nothing happens.
    assert.strictEqual(killPidFile(path.join(TMP, 'none.pid'), 'live-sites.js'), false);
    const f3 = path.join(TMP, 'junk.pid'); fs.writeFileSync(f3, 'not a number');
    assert.strictEqual(killPidFile(f3, 'live-sites.js'), false);
  });

  for (const k of kids) try { k.kill(); } catch {}
  await sleep(300);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  console.log(failures ? failures + ' FAILED' : 'all passed');
  process.exit(failures ? 1 : 0);
}
main();
