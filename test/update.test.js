// Signed updates: the signature parts (lib/release.js), signing in the bake (tools/sign-release.js), opening and
// checking a zip (lib/update.js), the test start of a new copy, the folder swap and its roll-back
// (lib/update-swap.js), the git route (lib/update-git.js) and the About routes through a test copy on port 8489.
// Everything happens in a temp folder with a throwaway key: a copy of this Bridge stands in for the old and new
// versions, a little server on this PC stands in for GitHub, and a bare repository for the git address. Nothing is
// asked of the internet, and nothing outside the temp folder is started, moved or changed.
// Run: node test/update.test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync, spawn } = require('child_process');

const HERE = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-update-test-'));
process.env.BRIDGE_DATA = path.join(TMP, 'proc-data');
process.env.BRIDGE_DRYRUN = '1';
delete process.env.BRIDGE_RELEASE_API;
delete process.env.BRIDGE_RELEASE_GIT;
const release = require('../lib/release');
const update = require('../lib/update');
const updateGit = require('../lib/update-git');
const swap = require('../lib/update-swap');
const signing = require('../tools/sign-release');

const PORT = 8489;
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
};
const KEY = pair(), OTHER = pair();
const SHA = 'ab'.repeat(32);
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// ---- a copy of this Bridge (what ships, roughly) with its own version and the throwaway key ----
function copyBridge(to, version, pub = KEY.pub) {
  const copy = rel => {
    const from = path.join(HERE, rel), dest = path.join(to, rel);
    if (fs.statSync(from).isDirectory()) { for (const n of fs.readdirSync(from)) copy(path.join(rel, n)); return; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
  };
  for (const rel of ['server.js', 'start-bridge.cmd', 'index.html', 'README.md', 'LICENSE', 'lib', 'public']) copy(rel);
  fs.writeFileSync(path.join(to, 'projects.json'), '{"note":"empty"}\n');
  const cfgFile = path.join(to, 'lib', 'config.js');
  fs.writeFileSync(cfgFile, fs.readFileSync(cfgFile, 'utf8').replace(/const VERSION = '[^']+';/, "const VERSION = '" + version + "';"));
  const rel = path.join(to, 'lib', 'release.js');
  fs.writeFileSync(rel, fs.readFileSync(rel, 'utf8').replace(/const RELEASE_KEY = '[^']*';/, "const RELEASE_KEY = '" + pub + "';"));
  return to;
}
// A zip as the bake makes it: one folder "my-project-bridge" inside.
function bakeZip(version, out, tweak) {
  const stage = fs.mkdtempSync(path.join(TMP, 'stage-'));
  const app = copyBridge(path.join(stage, 'my-project-bridge'), version);
  if (tweak) tweak(app);
  execFileSync(TAR, ['-a', '-c', '-f', out, '-C', stage, 'my-project-bridge']);
  fs.rmSync(stage, { recursive: true, force: true });
  return out;
}
const signFile = (zip, version, pem = KEY.pem) => fs.writeFileSync(zip + '.sig', JSON.stringify(release.signRelease(pem, version, sha256(zip))));
// A zip written by hand (stored entries): for names and sizes the bake would never write.
function handZip(files) {
  const parts = [], cds = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), data = Buffer.from(f.data || '');
    const body = f.deflate ? zlib.deflateRawSync(data) : data;
    const size = f.size == null ? data.length : f.size;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(f.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x800, 8); cd.writeUInt16LE(f.deflate ? 8 : 0, 10);
    cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(size, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42);
    parts.push(lh, name, body); cds.push(cd, name);
    off += 30 + name.length + body.length;
  }
  const cdBuf = Buffer.concat(cds), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

// The "old" Bridge every check updates: a copy at 0.1.98 in its own parent folder (new copies are opened beside it).
const PARENT = path.join(TMP, 'projects');
const APP = copyBridge(path.join(PARENT, 'bridge-app'), '0.1.98');
const DATA = path.join(APP, 'data');
fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(DATA, 'settings.json'), JSON.stringify({ workingFolders: [PARENT], welcomed: true }));
const W = extra => update.where({ app: APP, data: DATA, version: '0.1.98', key: KEY.pub, ...extra });
const ZIPS = path.join(TMP, 'zips');
fs.mkdirSync(ZIPS);
const Z99 = bakeZip('0.1.99', path.join(ZIPS, 'my-project-bridge-0.1.99.zip'));
signFile(Z99, '0.1.99');
const besideParent = () => fs.readdirSync(PARENT).filter(n => n.startsWith('.bridge-app.new-'));

async function main() {
  // ---------- lib/release.js ----------
  await check('a zip signed with the key passes; another zip, version or key does not', () => {
    const sig = release.signRelease(KEY.pem, '0.1.99', SHA);
    assert.equal(release.zipCheck(sig, '0.1.99', SHA, KEY.pub).code, '');
    assert.equal(release.zipCheck(sig, '0.1.99', 'cd'.repeat(32), KEY.pub).code, 'changed');
    assert.equal(release.zipCheck(sig, '0.2.0', SHA, KEY.pub).code, 'version');
    assert.equal(release.zipCheck(null, '0.1.99', SHA, KEY.pub).code, 'none');
    assert.equal(release.zipCheck({ version: '0.1.99' }, '0.1.99', SHA, KEY.pub).code, 'format');
    assert.equal(release.zipCheck(sig, '0.1.99', SHA, '').code, 'nokey');
    // A whole signature from another key: told apart as a new key, not as a broken file.
    assert.equal(release.zipCheck(release.signRelease(OTHER.pem, '0.1.99', SHA), '0.1.99', SHA, KEY.pub).code, 'newkey');
    // Another key's signature that names OUR key (or none) is just bad.
    assert.equal(release.zipCheck({ ...release.signRelease(OTHER.pem, '0.1.99', SHA), key: KEY.pub }, '0.1.99', SHA, KEY.pub).code, 'bad');
    // A signature moved onto another version's text does not pass, even with the version field changed to match.
    assert.equal(release.zipCheck({ ...sig, version: '0.2.0' }, '0.2.0', SHA, KEY.pub).code, 'bad');
    assert.equal(release.zipCheck({ ...sig, signature: 'not base64 at all!' }, '0.1.99', SHA, KEY.pub).code, 'bad');
    assert.equal(release.signedText('0.1.99', SHA.toUpperCase()), 'My Project Bridge release 0.1.99\nsha256 ' + SHA + '\n');
    assert.equal(release.sigWhy(sig, '0.1.99', SHA, KEY.pub), '');
  });
  await check('a git release: the signed commit and tree, read back out of the tag message', () => {
    const c = '1'.repeat(40), t = '2'.repeat(40);
    const s = release.signTag(KEY.pem, '0.1.99', c, t);
    const msg = release.tagMessage(s);
    assert.match(msg, /^My Project Bridge 0\.1\.99\n\nbridge-release \{/);
    const back = release.tagSigOf('object ' + c + '\ntype commit\ntag v0.1.99\ntagger x\n\n' + msg);
    assert.equal(release.tagCheck(back, '0.1.99', c, t, KEY.pub).code, '');
    assert.equal(release.tagCheck(back, '0.1.99', '3'.repeat(40), t, KEY.pub).code, 'changed');
    assert.equal(release.tagCheck(back, '0.1.99', c, '3'.repeat(40), KEY.pub).code, 'changed');
    assert.equal(release.tagCheck({ ...back, commit: '3'.repeat(40) }, '0.1.99', '3'.repeat(40), t, KEY.pub).code, 'bad');
    assert.equal(release.tagCheck(release.tagSigOf('no mark here'), '0.1.99', c, t, KEY.pub).code, 'none');
  });
  await check('versions: newer part by part; the newest release from GitHub, only from GitHub', () => {
    assert.ok(release.newer('0.1.10', '0.1.9') && !release.newer('0.1.9', '0.1.10') && !release.newer('0.1.9', '0.1.9') && !release.newer('x', '0.1.0'));
    const asset = (name, url = 'https://github.com/o/r/releases/download/v0.1.99/' + name) => ({ name, browser_download_url: url, size: 900000 });
    const ok = release.latestOf({ tag_name: 'v0.1.99', body: 'One.\r\n\r\nTwo.', assets: [asset('my-project-bridge-0.1.99.zip'), asset('my-project-bridge-0.1.99.zip.sig')] });
    assert.equal(ok.version, '0.1.99'); assert.equal(ok.notes, 'One. Two.'); assert.equal(ok.zip.bytes, 900000);
    assert.match(release.latestOf({ tag_name: 'latest' }), /does not name a version/);
    assert.match(release.latestOf({ tag_name: 'v0.1.99', assets: [asset('my-project-bridge-0.1.99.zip')] }), /signature .* is not attached/);
    assert.match(release.latestOf({ tag_name: 'v0.1.99', assets: [asset('my-project-bridge-0.1.99.zip', 'https://example.com/z.zip'), asset('my-project-bridge-0.1.99.zip.sig')] }), /not attached/);
    assert.equal(typeof release.latestOf({ tag_name: 'v0.1.99', assets: [asset('my-project-bridge-0.1.99.zip', 'http://127.0.0.1:9/a'), asset('my-project-bridge-0.1.99.zip.sig', 'http://127.0.0.1:9/b')] }, 'http://127.0.0.1:9/'), 'object');
    assert.ok(/^[\w-]+\/my-project-bridge$/.test(release.REPO) && release.GIT_URL === 'https://github.com/' + release.REPO + '.git');
    assert.ok(release.API_URL.startsWith('https://api.github.com/repos/') && release.GIT_URL.startsWith('https://github.com/'));
  });

  // ---------- signing in the bake ----------
  await check('the bake makes the key once, writes its public half, signs, and refuses a lost or wrong key', () => {
    const d = fs.mkdtempSync(path.join(TMP, 'sign-'));
    const keyFile = path.join(d, 'private', 'release-key.pem'), rel = path.join(d, 'release.js');
    fs.writeFileSync(rel, fs.readFileSync(path.join(HERE, 'lib', 'release.js'), 'utf8').replace(/const RELEASE_KEY = '[^']*';/, "const RELEASE_KEY = '';"));
    const a = signing.ensureKey({ file: keyFile, releaseJs: rel });
    assert.ok(a.made && /Made the release key/.test(a.said) && fs.existsSync(keyFile));
    const pub = /const RELEASE_KEY = '([^']+)';/.exec(fs.readFileSync(rel, 'utf8'))[1];
    assert.equal(pub, release.publicOf(a.pem));
    const b = signing.ensureKey({ file: keyFile, releaseJs: rel });
    assert.ok(!b.made && !b.said && b.pem === a.pem);
    // Signed and checked against the half in release.js.
    const zip = path.join(d, 'z.zip'); fs.writeFileSync(zip, 'zip bytes');
    assert.match(signing.signZip(zip, '0.1.99', a.pem, rel), /Signed/);
    assert.equal(release.zipCheck(JSON.parse(fs.readFileSync(zip + '.sig', 'utf8')), '0.1.99', sha256(zip), pub).code, '');
    assert.throws(() => signing.signZip(zip, '0.1.99', OTHER.pem, rel), /not signed/);
    // Another key at the path, or no key while the Bridge carries one: stopped with the way out.
    fs.writeFileSync(keyFile, OTHER.pem);
    assert.match(signing.ensureKey({ file: keyFile, releaseJs: rel }).error, /not the one the Bridge carries/);
    fs.rmSync(keyFile);
    assert.match(signing.ensureKey({ file: keyFile, releaseJs: rel }).error, /--new-key/);
    const c = signing.ensureKey({ file: keyFile, releaseJs: rel, newKey: true });
    assert.ok(c.made && /const RELEASE_KEY = '/.test(fs.readFileSync(rel, 'utf8')) && release.publicOf(c.pem) !== pub);
  });
  await check('the git tag message: signed for the commit you are on, refused while files are changed', () => {
    const d = fs.mkdtempSync(path.join(TMP, 'tagrepo-'));
    copyBridge(d, '0.1.99');
    const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    g('init', '-q', '-b', 'main'); g('config', 'user.name', 'Test'); g('config', 'user.email', 'test@example.invalid'); g('config', 'core.autocrlf', 'false');
    g('add', '-A'); g('commit', '-q', '-m', 'v');
    const r = signing.writeTag('0.1.99', KEY.pem, { dir: d, releaseJs: path.join(d, 'lib', 'release.js') });
    assert.ok(r.file, r.why);
    const s = release.tagSigOf('\n' + fs.readFileSync(r.file, 'utf8'));
    assert.equal(release.tagCheck(s, '0.1.99', g('rev-parse', 'HEAD'), g('rev-parse', 'HEAD^{tree}'), KEY.pub).code, '');
    fs.appendFileSync(path.join(d, 'README.md'), '\nchanged\n');
    assert.match(signing.writeTag('0.1.99', KEY.pem, { dir: d, releaseJs: path.join(d, 'lib', 'release.js') }).why, /not committed/);
    g('checkout', '--', 'README.md');
    assert.match(signing.writeTag('0.2.0', KEY.pem, { dir: d, releaseJs: path.join(d, 'lib', 'release.js') }).why, /says version 0\.1\.99/);
  });

  // ---------- opening a zip ----------
  await check('a signed, newer, whole zip is opened beside the Bridge and waits for Install', async () => {
    const r = await update.fromFile(Z99, W());
    assert.ok(r.ok, r.error);
    assert.deepEqual([r.pending.version, r.pending.signed, r.pending.code], ['0.1.99', true, '']);
    assert.ok(update.pending.dir.startsWith(PARENT) && fs.existsSync(path.join(update.pending.dir, 'server.js')));
    assert.equal(path.basename(path.dirname(update.pending.dir)).slice(0, 16), '.bridge-app.new-');
    update.dropPending();
    assert.deepEqual(besideParent(), []);
  });
  await check('a zip picked by hand without a good signature: opened, with the warning that names what is wrong', async () => {
    const z = path.join(ZIPS, 'unsigned', 'my-project-bridge-0.1.99.zip');
    fs.mkdirSync(path.dirname(z)); fs.copyFileSync(Z99, z);
    let r = await update.fromFile(z, W());
    assert.equal(r.pending.code, 'none'); assert.match(r.pending.warning, /no signature beside it.*may not be from/);
    fs.writeFileSync(z + '.sig', JSON.stringify(release.signRelease(OTHER.pem, '0.1.99', sha256(z))));
    r = await update.fromFile(z, W());
    assert.equal(r.pending.code, 'newkey'); assert.match(r.pending.warning, /key this Bridge does not know/);
    fs.writeFileSync(z + '.sig', JSON.stringify(release.signRelease(KEY.pem, '0.1.99', SHA)));
    r = await update.fromFile(z, W());
    assert.equal(r.pending.code, 'changed'); assert.match(r.pending.warning, /changed after it was signed/);
    fs.writeFileSync(z + '.sig', 'not json');
    r = await update.fromFile(z, W());
    assert.equal(r.pending.code, 'format');
    update.dropPending();
  });
  await check('zips that are not a newer whole Bridge are refused, and nothing is left beside it', async () => {
    const same = bakeZip('0.1.98', path.join(ZIPS, 'same.zip'));
    assert.match((await update.fromFile(same, W())).error, /this one is 0\.1\.98 already/);
    const withData = bakeZip('0.1.99', path.join(ZIPS, 'data.zip'), app => { fs.mkdirSync(path.join(app, 'data')); fs.writeFileSync(path.join(app, 'data', 'settings.json'), '{}'); });
    assert.match((await update.fromFile(withData, W())).error, /carries a data folder/);
    const part = bakeZip('0.1.99', path.join(ZIPS, 'part.zip'), app => fs.rmSync(path.join(app, 'lib', 'app.js')));
    assert.match((await update.fromFile(part, W())).error, /not a whole My Project Bridge \(lib\/app\.js/);
    const notZip = path.join(ZIPS, 'note.zip'); fs.writeFileSync(notZip, 'hello');
    assert.match((await update.fromFile(notZip, W())).error, /could not be read as a zip/);
    assert.match((await update.fromFile(path.join(ZIPS, 'nothing-here.zip'), W())).error, /no file at/);
    assert.match((await update.fromFile(ZIPS, W())).error, /not a zip file/);
    assert.match((await update.fromFile('', W())).error, /Browse/);
    assert.deepEqual(besideParent(), []);
  });
  await check('a zip whose names climb out, sit at the top, or unpack to more than they say is never written', async () => {
    const z = (name, files) => { const f = path.join(ZIPS, name); fs.writeFileSync(f, handZip(files)); return f; };
    for (const bad of ['b/../../escaped.txt', '../escaped.txt', 'b/c:evil.txt', 'b\\..\\escaped.txt', '/abs.txt', 'b/con.txt', 'b/x./y.txt']) {
      const r = await update.fromFile(z('climb.zip', [{ name: 'b/server.js', data: 'x' }, { name: bad, data: 'x' }]), W());
      assert.match(r.error, /could land outside its folder/, bad);
    }
    assert.ok(!fs.existsSync(path.join(PARENT, 'escaped.txt')) && !fs.existsSync(path.join(TMP, 'escaped.txt')));
    assert.match((await update.fromFile(z('two.zip', [{ name: 'a/server.js', data: 'x' }, { name: 'b/server.js', data: 'x' }]), W())).error, /one folder/);
    assert.match((await update.fromFile(z('flat.zip', [{ name: 'server.js', data: 'x' }]), W())).error, /one folder/);
    // Declared 10 bytes, unpacks to 5 MB: stopped at what it declared.
    assert.match((await update.fromFile(z('bomb.zip', [{ name: 'b/big.txt', data: Buffer.alloc(5 << 20), deflate: true, size: 10 }]), W())).error, /could not be opened/);
    assert.match((await update.fromFile(z('huge.zip', [{ name: 'b/a.txt', data: '', size: 60 << 20 }, { name: 'b/b.txt', data: '', size: 60 << 20 }]), W())).error, /would unpack to 120 MB/);
    assert.deepEqual(besideParent(), []);
  });

  // ---------- GitHub (a stand-in on this PC) ----------
  const files = new Map(), gh = { status: 200, tag: 'v0.1.99', hits: 0 };
  const server = http.createServer((q, res) => {
    gh.hits++;
    const base = 'http://127.0.0.1:' + server.address().port;
    if (q.url === '/releases/latest') {
      if (gh.status !== 200) { res.writeHead(gh.status); return res.end('{}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ tag_name: gh.tag, published_at: '2026-01-02T00:00:00Z', body: 'What changed.', assets: [...files.keys()].map(n => ({ name: n, size: files.get(n).length, browser_download_url: base + '/dl/' + n })) }));
    }
    const f = files.get(decodeURIComponent(q.url.replace('/dl/', '')));
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200); res.end(f);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const API = 'http://127.0.0.1:' + server.address().port;
  const offer = (zip, sig) => { files.clear(); files.set('my-project-bridge-0.1.99.zip', fs.readFileSync(zip)); if (sig !== null) files.set('my-project-bridge-0.1.99.zip.sig', sig || fs.readFileSync(zip + '.sig')); };

  await check('Check for updates: GitHub\'s newest release, newer or not; a private repository says how to update meanwhile', async () => {
    offer(Z99);
    const r = await update.check(W({ api: API }));
    assert.deepEqual([r.ok, r.version, r.newer, r.mine, r.notes], [true, '0.1.99', true, '0.1.98', 'What changed.']);
    assert.equal((await update.check(W({ api: API, version: '0.1.99' }))).newer, false);
    gh.status = 404;
    assert.match((await update.check(W({ api: API }))).error, /could not be found.*Update from a zip/);
    gh.status = 200;
    files.delete('my-project-bridge-0.1.99.zip.sig');
    assert.match((await update.check(W({ api: API }))).error, /signature .* is not attached/);
  });
  await check('a download is checked before it is opened: a good signature waits for Install, any other is refused outright', async () => {
    offer(Z99);
    let r = await update.download('0.1.99', W({ api: API }));
    assert.ok(r.ok && r.pending.signed && r.pending.source === 'github', r.error);
    update.dropPending();
    offer(Z99, JSON.stringify(release.signRelease(KEY.pem, '0.1.99', SHA)));
    r = await update.download('0.1.99', W({ api: API }));
    assert.match(r.error, /downloaded but not opened: the zip is not the one that was signed.*nothing was installed/);
    offer(Z99, JSON.stringify(release.signRelease(OTHER.pem, '0.1.99', sha256(Z99))));
    r = await update.download('0.1.99', W({ api: API }));
    assert.match(r.error, /signed with a key this Bridge does not know.*by hand once.*Install anyway/);
    offer(Z99);
    assert.match((await update.download('0.1.97', W({ api: API }))).error, /GitHub now has My Project Bridge 0\.1\.99/);
    assert.ok(!update.pending);
    assert.deepEqual(besideParent(), []);
  });

  // ---------- the test start and Install ----------
  await check('Install starts the new copy once as a test copy first: a good one passes, a broken one stops everything', async () => {
    await update.fromFile(Z99, W());
    const p = update.pending;
    assert.equal(await update.selfTest(p.dir, '0.1.99', W()), '');
    assert.match(await update.selfTest(p.dir, '0.2.0', W()), /says it is 0\.1\.99, not 0\.2\.0/);
    fs.writeFileSync(path.join(p.dir, 'server.js'), 'throw new Error("broken on purpose")');
    const why = await update.selfTest(p.dir, '0.1.99', W(), 15000);
    assert.match(why, /stopped as soon as it started.*broken on purpose|stopped as soon as it started/);
    const r = await update.installZip(p, false, W(), () => { throw new Error('must not exit'); });
    assert.match(r.error, /was not installed: started as a test copy, it stopped/);
    update.dropPending();
  });
  await check('the test start reads your settings without live addresses, added projects or this Bridge\'s BRIDGE_ settings', async () => {
    // A stand-in new copy that writes down what it was handed, then answers like a Bridge.
    const dir = fs.mkdtempSync(path.join(TMP, 'stub-')), seen = path.join(TMP, 'stub-seen.json');
    fs.writeFileSync(path.join(dir, 'server.js'), [
      "const fs = require('fs'), path = require('path'), http = require('http');",
      "const d = process.env.BRIDGE_DATA, port = +process.argv.find(a => a.startsWith('--port=')).slice(7);",
      "fs.writeFileSync(" + JSON.stringify(seen) + ", JSON.stringify({ settings: JSON.parse(fs.readFileSync(path.join(d, 'settings.json'), 'utf8')), env: Object.keys(process.env).filter(k => /^BRIDGE_/i.test(k)).sort(), root: process.env.BRIDGE_ROOT }));",
      "fs.writeFileSync(path.join(d, 'run.json'), JSON.stringify({ key: 'k' }));",
      "http.createServer((q, r) => { if (q.url === '/api/quit') { r.end('{}'); return setTimeout(() => process.exit(0), 50); }",
      "  r.end(q.url === '/' ? '<meta name=\"bridge-key\" content=\"k\">' : q.url === '/api/stats' ? JSON.stringify({ version: '0.1.99' }) : 'x'); }).listen(port, '127.0.0.1');",
    ].join('\n'));
    const data = fs.mkdtempSync(path.join(TMP, 'stub-data-'));
    fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ workingFolders: [PARENT], extraProjects: [APP], liveUrls: { 'c:\\x': 'https://shop.example/' }, theme: 'dark' }));
    process.env.BRIDGE_RELEASE_API = 'http://127.0.0.1:9/'; process.env.BRIDGE_LINK_KEY = 'HKCU\\Software\\Nothing';
    try { assert.equal(await update.selfTest(dir, '0.1.99', W({ data })), ''); }
    finally { delete process.env.BRIDGE_RELEASE_API; delete process.env.BRIDGE_LINK_KEY; }
    const s = JSON.parse(fs.readFileSync(seen, 'utf8'));
    assert.deepEqual([s.settings.theme, s.settings.extraProjects, s.settings.liveUrls, s.settings.workingFolders], ['dark', [], {}, [s.root]]);
    assert.deepEqual(s.env, ['BRIDGE_DATA', 'BRIDGE_OPEN', 'BRIDGE_ROOT']);
  });
  await check('Install on a warning needs Install anyway; a test copy then stops short of the swap', async () => {
    const z = path.join(ZIPS, 'unsigned', 'my-project-bridge-0.1.99.zip');
    fs.rmSync(z + '.sig', { force: true });
    await update.fromFile(z, W());
    const exit = () => { throw new Error('must not exit'); };
    assert.match((await update.installZip(update.pending, false, W(), exit)).error, /not signed by the Bridge's maker.*Install anyway/);
    const r = await update.installZip(update.pending, true, W(), exit);
    assert.ok(r.ok && /passed its test start/.test(r.dryRun), JSON.stringify(r));
    // A download is never installed without its signature, whatever the page sends.
    update.pending.source = 'github';
    assert.match((await update.installZip(update.pending, true, W(), exit)).error, /never installed without its signature/);
    update.dropPending();
    assert.ok(fs.existsSync(path.join(APP, 'server.js')) && !fs.readdirSync(PARENT).some(n => n.includes('.old-')));
  });

  // ---------- the swap ----------
  const swapSetup = () => {
    const parent = fs.mkdtempSync(path.join(TMP, 'swap-'));
    const app = path.join(parent, 'app'), incoming = path.join(parent, '.app.new-x');
    fs.mkdirSync(path.join(app, 'data', 'update'), { recursive: true });
    fs.mkdirSync(path.join(app, '.git')); fs.writeFileSync(path.join(app, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(app, 'server.js'), 'old');
    fs.writeFileSync(path.join(app, 'README.md'), 'old readme');
    fs.writeFileSync(path.join(app, 'projects.json'), '{"mine":true}');
    fs.writeFileSync(path.join(app, 'data', 'settings.json'), '{"welcomed":true}');
    fs.writeFileSync(path.join(app, 'MY-NOTES.md'), 'notes');
    // A file only the old version shipped: it stays with that version, not carried as if it were yours.
    fs.writeFileSync(path.join(app, 'OLD-ONLY.cmd'), 'old version file');
    fs.writeFileSync(path.join(app, 'release.json'), JSON.stringify({ version: '0.1.98', top: ['server.js', 'README.md', 'OLD-ONLY.cmd', 'projects.json', 'release.json'] }));
    fs.mkdirSync(path.join(incoming, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(incoming, 'server.js'), 'new');
    fs.writeFileSync(path.join(incoming, 'README.md'), 'new readme');
    fs.writeFileSync(path.join(incoming, 'projects.json'), '{"note":"empty"}');
    return { parent, app, incoming, old: path.join(parent, '.app.old-0.1.98'), last: path.join(app, 'data', 'update', 'last.json') };
  };
  const plan = (s, extra) => { const f = path.join(s.parent, 'plan.json'); fs.writeFileSync(f, JSON.stringify({ wait: [], mode: 'swap', app: s.app, incoming: s.incoming, old: s.old, from: '0.1.98', to: '0.1.99', last: s.last, start: null, ...extra })); return f; };
  await check('the swap: the new copy in the same place, your data, list, notes and .git moved across, the old copy kept', async () => {
    const s = swapSetup();
    const r = await swap.main(plan(s));
    assert.ok(r.ok, r.why);
    const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
    assert.equal(read(s.app, 'server.js'), 'new'); assert.equal(read(s.app, 'README.md'), 'new readme');
    assert.equal(read(s.app, 'projects.json'), '{"mine":true}'); assert.equal(read(s.app, 'data', 'settings.json'), '{"welcomed":true}');
    assert.equal(read(s.app, 'MY-NOTES.md'), 'notes'); assert.ok(fs.existsSync(path.join(s.app, '.git', 'HEAD')));
    assert.equal(read(s.old, 'server.js'), 'old'); assert.ok(!fs.existsSync(s.incoming) && !fs.existsSync(path.join(s.old, 'data')));
    assert.ok(fs.existsSync(path.join(s.old, 'OLD-ONLY.cmd')) && !fs.existsSync(path.join(s.app, 'OLD-ONLY.cmd')), 'the old version keeps what it shipped');
    assert.ok(fs.existsSync(path.join(s.old, 'release.json')) && !fs.existsSync(path.join(s.app, 'release.json')));
    const last = JSON.parse(read(s.last));
    assert.deepEqual([last.ok, last.from, last.to, last.old], [true, '0.1.98', '0.1.99', '.app.old-0.1.98']);
  });
  await check('the swap rolls back when the folder is held open, and says why; the old copy is started again', async () => {
    const s = swapSetup();
    // A program whose working folder is the Bridge's (a terminal left open there): Windows will not move the folder.
    const holder = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { cwd: s.app, stdio: 'ignore' });
    await sleep(500);
    const marker = path.join(s.parent, 'started.txt');
    try {
      const r = await swap.main(plan(s, { tries: 2, start: { exe: process.execPath, args: ['-e', 'require("fs").writeFileSync(' + JSON.stringify(marker) + ', process.cwd())'], cwd: s.app } }));
      assert.ok(!r.ok && /a program still had the Bridge's folder open/.test(r.why), r.why);
      assert.equal(fs.readFileSync(path.join(s.app, 'server.js'), 'utf8'), 'old');
      assert.ok(fs.existsSync(path.join(s.incoming, 'server.js')) && !fs.existsSync(s.old));
      assert.equal(JSON.parse(fs.readFileSync(s.last, 'utf8')).ok, false);
      for (let i = 0; i < 25 && !fs.existsSync(marker); i++) await sleep(200);
      assert.ok(fs.existsSync(marker), 'the old Bridge was started again');
    } finally { holder.kill(); await sleep(300); }
  });
  await check('the swap rolls back when the new copy cannot be moved in: the old folder is put back in place', async () => {
    const s = swapSetup();
    // The old folder moves aside fine; the new one is held open, so it cannot take the old one's place.
    const holder = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { cwd: s.incoming, stdio: 'ignore' });
    await sleep(500);
    try {
      const r = await swap.main(plan(s, { tries: 2 }));
      assert.ok(!r.ok && /the new copy could not be moved into place/.test(r.why), r.why);
      assert.equal(fs.readFileSync(path.join(s.app, 'server.js'), 'utf8'), 'old');
      assert.ok(fs.existsSync(path.join(s.app, 'data', 'settings.json')) && !fs.existsSync(s.old));
    } finally { holder.kill(); await sleep(300); }
  });
  await check('opened updates left beside the Bridge are tidied away, except one another running Bridge is waiting on', async () => {
    const sleeper = spawn(process.execPath, ['-e', 'setTimeout(()=>{},20000)'], { stdio: 'ignore' });
    const dead = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
    await new Promise(r => dead.on('exit', r));
    const live = path.join(PARENT, '.bridge-app.new-' + sleeper.pid + '-aaaa'), gone = path.join(PARENT, '.bridge-app.new-' + dead.pid + '-bbbb'), old = path.join(PARENT, '.bridge-app.new-cccc');
    for (const d of [live, gone, old]) fs.mkdirSync(d);
    try {
      update.tidy(W());
      assert.deepEqual([fs.existsSync(live), fs.existsSync(gone), fs.existsSync(old)], [true, false, false]);
    } finally { sleeper.kill(); fs.rmSync(live, { recursive: true, force: true }); }
  });
  await check('restart only (git): nothing moved, the Bridge started again once the old one ended', async () => {
    const s = swapSetup();
    const sleeper = spawn(process.execPath, ['-e', 'setTimeout(()=>{},1500)'], { stdio: 'ignore' });
    const marker = path.join(s.parent, 'restarted.txt'), t0 = Date.now();
    const r = await swap.main(plan(s, { mode: 'restart', wait: [sleeper.pid], route: 'git', start: { exe: process.execPath, args: ['-e', 'require("fs").writeFileSync(' + JSON.stringify(marker) + ', "x")'], cwd: s.parent } }));
    assert.ok(r.ok && Date.now() - t0 >= 1000, 'waited for the old process');
    for (let i = 0; i < 25 && !fs.existsSync(marker); i++) await sleep(200);
    assert.ok(fs.existsSync(marker) && fs.readFileSync(path.join(s.app, 'server.js'), 'utf8') === 'old');
  });

  // ---------- old copies ----------
  await check('old copies beside the Bridge: listed newest first, Switch and Remove ask nothing of a test copy, data blocks Remove', async () => {
    const o1 = copyBridge(path.join(PARENT, '.bridge-app.old-0.1.97'), '0.1.97'), o2 = copyBridge(path.join(PARENT, '.bridge-app.old-0.1.9'), '0.1.9');
    for (const o of [o1, o2]) fs.rmSync(path.join(o, 'projects.json')); // it moved to the version in use
    fs.mkdirSync(path.join(PARENT, '.bridge-app.old-junk'));
    assert.deepEqual(update.oldCopies(W()).map(o => o.version), ['0.1.97', '0.1.9']);
    const exit = () => { throw new Error('must not exit'); };
    assert.match(update.switchTo('.bridge-app.old-0.1.97', W(), exit).dryRun, /swap in \.bridge-app\.old-0\.1\.97/);
    assert.match(update.switchTo('..\\elsewhere', W(), exit).error, /not beside this one/);
    assert.match((await update.removeOld('.bridge-app.old-0.1.9', W())).dryRun, /Recycle Bin/);
    fs.writeFileSync(path.join(o2, 'projects.json'), '{}');
    fs.mkdirSync(path.join(o1, 'data'));
    assert.match((await update.removeOld('.bridge-app.old-0.1.97', W())).error, /still holds data/);
    fs.rmSync(o1, { recursive: true }); fs.rmSync(o2, { recursive: true }); fs.rmSync(path.join(PARENT, '.bridge-app.old-junk'), { recursive: true });
  });

  // ---------- the git route ----------
  await check('git: only a signed tag at the fixed address, for that exact commit, on a clean clone, as a fast-forward', async () => {
    const g = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const origin = path.join(TMP, 'origin.git'), work = path.join(TMP, 'work'), clone = path.join(TMP, 'clones', 'bridge-clone');
    g(TMP, 'init', '-q', '--bare', '-b', 'main', origin);
    copyBridge(work, '0.1.98');
    const ident = d => { g(d, 'config', 'user.name', 'Test'); g(d, 'config', 'user.email', 'test@example.invalid'); g(d, 'config', 'core.autocrlf', 'false'); };
    g(work, 'init', '-q', '-b', 'main'); ident(work);
    g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', '0.1.98'); g(work, 'push', '-q', origin, 'main');
    fs.mkdirSync(path.dirname(clone));
    g(TMP, 'clone', '-q', '-c', 'core.autocrlf=false', origin, clone); ident(clone);
    fs.mkdirSync(path.join(clone, 'data'));
    fs.writeFileSync(path.join(clone, 'data', 'settings.json'), JSON.stringify({ workingFolders: [] }));
    // 0.1.99, signed; then 0.1.100 tagged without a signature (a plain annotated tag).
    const cfgFile = path.join(work, 'lib', 'config.js');
    fs.writeFileSync(cfgFile, fs.readFileSync(cfgFile, 'utf8').replace("'0.1.98'", "'0.1.99'"));
    g(work, 'commit', '-q', '-am', '0.1.99');
    const msg = path.join(TMP, 'tag.txt');
    fs.writeFileSync(msg, release.tagMessage(release.signTag(KEY.pem, '0.1.99', g(work, 'rev-parse', 'HEAD'), g(work, 'rev-parse', 'HEAD^{tree}'))));
    g(work, 'tag', '-a', 'v0.1.99', '-F', msg);
    g(work, 'push', '-q', origin, 'main', 'v0.1.99');
    process.env.BRIDGE_RELEASE_GIT = origin;
    const GW = extra => update.where({ app: clone, data: path.join(clone, 'data'), version: '0.1.98', key: KEY.pub, ...extra });
    try {
      assert.ok(updateGit.isClone(clone) && !updateGit.isClone(APP));
      const c = await updateGit.check(GW());
      assert.deepEqual([c.ok, c.version, c.newer], [true, '0.1.99', true]);
      // Changed files here: refused, never overwritten.
      fs.appendFileSync(path.join(clone, 'README.md'), '\nedited here\n');
      assert.match((await updateGit.get('0.1.99', GW())).error, /were changed here \(README\.md\)/);
      g(clone, 'checkout', '--', 'README.md');
      // Another key, or a key this Bridge does not carry: refused.
      assert.match((await updateGit.get('0.1.99', GW({ key: OTHER.pub }))).error, /signed with a key this Bridge does not know/);
      const r = await updateGit.get('0.1.99', GW());
      assert.ok(r.ok && r.pending.route === 'git' && r.pending.signed, r.error);
      const p = update.pending;
      assert.equal(g(clone, 'rev-parse', 'HEAD'), p.from, 'nothing moved yet');
      // The test copy stops short; a real one moves forward to the exact signed commit and hands over a restart.
      assert.match((await updateGit.install(p, GW(), () => { throw new Error('must not exit'); })).dryRun, /move this clone forward/);
      let exited = false;
      const done = await updateGit.install(p, GW({ dry: false, start: null, wait: [] }), () => { exited = true; });
      assert.ok(done.ok && done.restarting && exited, done.error);
      assert.equal(g(clone, 'rev-parse', 'HEAD'), p.commit);
      const lastFile = path.join(clone, 'data', 'update', 'last.json');
      for (let i = 0; i < 50 && !fs.existsSync(lastFile); i++) await sleep(100);
      const last = JSON.parse(fs.readFileSync(lastFile, 'utf8'));
      assert.deepEqual([last.route, last.ok, last.from, last.to, last.fromCommit, last.toCommit], ['git', true, '0.1.98', '0.1.99', p.from, p.commit]);
      // Go back: the clone moved back to where it was.
      const back = await updateGit.goBack(GW({ dry: false, start: null, wait: [] }), () => {});
      assert.ok(back.ok, back.error);
      assert.equal(g(clone, 'rev-parse', 'HEAD'), p.from);
      const isBack = () => { try { return JSON.parse(fs.readFileSync(lastFile, 'utf8')).back === true; } catch { return false; } };
      for (let i = 0; i < 50 && !isBack(); i++) await sleep(100);
      assert.ok(isBack(), 'the restart after going back was recorded');
      assert.match((await updateGit.goBack(GW({ dry: false, start: null, wait: [] }), () => {})).error, /no git update to go back from/);
      // An edited last.json naming an option instead of a commit is not handed to git.
      fs.writeFileSync(lastFile, JSON.stringify({ route: 'git', ok: true, from: '0.1.98', to: '0.1.99', fromCommit: '--hard', toCommit: g(clone, 'rev-parse', 'HEAD') }));
      assert.match((await updateGit.goBack(GW({ dry: false, start: null, wait: [] }), () => { throw new Error('must not exit'); })).error, /no git update to go back from/);
      assert.equal(g(clone, 'rev-parse', 'HEAD'), p.from);
      // A tag moved onto another commit (same message), a plain tag, an unsigned one: none taken.
      fs.appendFileSync(path.join(work, 'README.md'), '\nsomething else\n');
      g(work, 'commit', '-q', '-am', 'other');
      g(work, 'tag', '-f', '-a', 'v0.1.99', '-F', msg);
      g(work, 'push', '-q', '-f', origin, 'main', 'v0.1.99');
      assert.match((await updateGit.get('0.1.99', GW())).error, /another commit than the one that was signed/);
      fs.writeFileSync(cfgFile, fs.readFileSync(cfgFile, 'utf8').replace("'0.1.99'", "'0.1.100'"));
      g(work, 'commit', '-q', '-am', '0.1.100');
      g(work, 'tag', 'v0.1.100'); g(work, 'push', '-q', origin, 'main', 'v0.1.100');
      assert.equal((await updateGit.check(GW())).version, '0.1.100');
      assert.match((await updateGit.get('0.1.100', GW())).error, /plain tag/);
      g(work, 'tag', '-d', 'v0.1.100'); g(work, 'tag', '-a', 'v0.1.100', '-m', 'no signature'); g(work, 'push', '-q', '-f', origin, 'v0.1.100');
      assert.match((await updateGit.get('0.1.100', GW())).error, /carries no signature/);
      // Commits of its own: not a fast-forward, refused.
      fs.writeFileSync(path.join(work, 'x.txt'), 'x'); g(work, 'add', 'x.txt'); g(work, 'commit', '-q', '-m', 'x');
      fs.writeFileSync(msg, release.tagMessage(release.signTag(KEY.pem, '0.1.100', g(work, 'rev-parse', 'HEAD'), g(work, 'rev-parse', 'HEAD^{tree}'))));
      g(work, 'tag', '-f', '-a', 'v0.1.100', '-F', msg); g(work, 'push', '-q', '-f', origin, 'main', 'v0.1.100');
      fs.writeFileSync(path.join(clone, 'mine.txt'), 'mine'); g(clone, 'add', 'mine.txt'); g(clone, 'commit', '-q', '-m', 'mine');
      assert.match((await updateGit.get('0.1.100', GW())).error, /commits of its own/);
      assert.ok(!g(clone, 'for-each-ref', 'refs/bridge-update/'), 'no fetched refs left behind');
    } finally { delete process.env.BRIDGE_RELEASE_GIT; update.dropPending(); }
  });

  await check('git: a release that starts tracking a file this clone ignores never replaces yours; nothing moves', async () => {
    const g = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const origin = path.join(TMP, 'origin2.git'), work = path.join(TMP, 'work2'), clone = path.join(TMP, 'clones2', 'bridge-clone');
    g(TMP, 'init', '-q', '--bare', '-b', 'main', origin);
    copyBridge(work, '0.1.98');
    const ident = d => { g(d, 'config', 'user.name', 'Test'); g(d, 'config', 'user.email', 'test@example.invalid'); g(d, 'config', 'core.autocrlf', 'false'); };
    g(work, 'init', '-q', '-b', 'main'); ident(work); g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', '0.1.98'); g(work, 'push', '-q', origin, 'main');
    fs.mkdirSync(path.dirname(clone));
    g(TMP, 'clone', '-q', '-c', 'core.autocrlf=false', origin, clone); ident(clone);
    fs.mkdirSync(path.join(clone, 'data'));
    fs.appendFileSync(path.join(clone, '.git', 'info', 'exclude'), '\nlocal-only.json\n');
    fs.writeFileSync(path.join(clone, 'local-only.json'), '{"mine":true}');
    const cfgFile = path.join(work, 'lib', 'config.js');
    fs.writeFileSync(cfgFile, fs.readFileSync(cfgFile, 'utf8').replace("'0.1.98'", "'0.1.99'"));
    fs.writeFileSync(path.join(work, 'local-only.json'), '{"theirs":true}');
    g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', '0.1.99');
    const msg = path.join(TMP, 'tag2.txt');
    fs.writeFileSync(msg, release.tagMessage(release.signTag(KEY.pem, '0.1.99', g(work, 'rev-parse', 'HEAD'), g(work, 'rev-parse', 'HEAD^{tree}'))));
    g(work, 'tag', '-a', 'v0.1.99', '-F', msg); g(work, 'push', '-q', origin, 'main', 'v0.1.99');
    process.env.BRIDGE_RELEASE_GIT = origin;
    try {
      const GW = extra => update.where({ app: clone, data: path.join(clone, 'data'), version: '0.1.98', key: KEY.pub, ...extra });
      const r = await updateGit.get('0.1.99', GW());
      assert.ok(r.ok, r.error);
      const head = g(clone, 'rev-parse', 'HEAD');
      const done = await updateGit.install(update.pending, GW({ dry: false, start: null, wait: [] }), () => { throw new Error('must not exit'); });
      assert.match(done.error || '', /did not go in.*Nothing was changed/);
      assert.equal(fs.readFileSync(path.join(clone, 'local-only.json'), 'utf8'), '{"mine":true}');
      assert.equal(g(clone, 'rev-parse', 'HEAD'), head);
    } finally { delete process.env.BRIDGE_RELEASE_GIT; update.dropPending(); }
  });

  // ---------- the routes, through a test copy of the Bridge on port 8489 ----------
  await check('About routes on a test copy: status, Check, Download and check, Update from a zip, Install anyway, the demo', async () => {
    offer(Z99);
    const data = path.join(TMP, 'srv-data'), root = path.join(TMP, 'srv-root');
    fs.mkdirSync(data); fs.mkdirSync(root);
    const srv = spawn(process.execPath, ['server.js', '--dry-run', '--port=' + PORT], { cwd: APP, env: { ...process.env, BRIDGE_DATA: data, BRIDGE_ROOT: root, BRIDGE_RELEASE_API: API, BRIDGE_DRYRUN: '' }, stdio: 'ignore' });
    try {
      let run = null;
      for (let i = 0; i < 50 && !run; i++) { await sleep(200); try { run = JSON.parse(fs.readFileSync(path.join(data, 'run.json'), 'utf8')); } catch {} }
      assert.ok(run, 'the test copy started');
      const call = async (p, body) => {
        const r = await fetch('http://127.0.0.1:' + PORT + p, { method: body ? 'POST' : 'GET', headers: { 'X-Bridge-Key': run.key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return r.json();
      };
      const s = await call('/api/update');
      assert.deepEqual([s.version, s.route, s.hasKey, s.dry, s.pending], ['0.1.98', 'zip', true, true, null]);
      const c = await call('/api/update/check', {});
      assert.deepEqual([c.ok, c.version, c.newer], [true, '0.1.99', true]);
      const d = await call('/api/update/get', { version: '0.1.99' });
      assert.ok(d.ok && d.pending.signed, d.error);
      // Quit while Install is in its test start: refused with the reason, and Install finishes.
      const installing = call('/api/update/install', { version: '0.1.99' });
      await sleep(300);
      const q = await call('/api/quit', {});
      assert.ok(q.ok === false && /update step is running \(installing\)/.test(q.error), JSON.stringify(q));
      const i = await installing;
      assert.match(i.dryRun || i.error, /passed its test start/);
      assert.match((await call('/api/update/install', { version: '0.1.50' })).error, /no longer waiting/);
      const z = path.join(ZIPS, 'unsigned', 'my-project-bridge-0.1.99.zip');
      const u = await call('/api/update/zip', { path: z });
      assert.equal(u.pending.code, 'none');
      assert.match((await call('/api/update/install', { version: '0.1.99' })).error, /Install anyway/);
      assert.match((await call('/api/update/install', { version: '0.1.99', anyway: true })).dryRun, /passed its test start/);
      assert.match((await call('/api/update/pick', {})).dryRun, /file picker/);
      assert.equal((await call('/api/update/cancel', {})).ok, true);
      assert.equal((await call('/api/update')).pending, null);
      // The key check guards these routes like every other.
      const noKey = await fetch('http://127.0.0.1:' + PORT + '/api/update/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(noKey.status, 403);
      await call('/api/quit', {});
    } finally { await sleep(500); try { srv.kill(); } catch {} }
    assert.deepEqual(besideParent(), [], 'no opened copy left beside the Bridge');
  });

  server.close();
}

main().catch(e => { failures++; console.log('FAIL ' + (e && e.stack || e)); }).finally(() => {
  update.dropPending();
  fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  console.log(failures ? failures + ' failed' : 'all passed');
  process.exitCode = failures ? 1 : 0;
});
