// Bakes the shareable zip: _releases/my-project-bridge-<version>.zip, one folder "my-project-bridge" inside.
//   node tools/bake.js            (--check: the privacy check only, no zip; --again: replace an existing zip of this
//                                 version, only when it was never shared; --new-key: the release key is lost, make a
//                                 new one)
// Every zip is signed (tools/sign-release.js): the first bake makes the release key, saves its private half outside
// the repository and writes its public half into lib/release.js; a private key anywhere in what ships stops the bake.
// Only the files in SHIP go in (an allow list: anything new stays out until it is added here), projects.json goes in
// EMPTY (the real one holds this PC's project names), and data/, test copies, and working notes never go in.
// Before zipping, every shipped file goes through the disclosure pass's matcher: private details read from THIS PC at
// bake time and from your list in data/, the names of the project folders next to the Bridge, an AI or prompt trail,
// and local paths; plus dated notes. None of the values are written in this file or printed. Any hit stops the bake.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeMatcher, autoDetails, readPrivateList } = require('../lib/disclosure');
const signing = require('./sign-release');

const HERE = path.resolve(__dirname, '..');
const VERSION = /const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(HERE, 'lib', 'config.js'), 'utf8'))[1];
// Every .js/.ps1 under lib/ (platform/ and routes/ included) and the page's own files under public/ (index.html,
// .css, .js and the icon: a stray file dropped there stays out) ship; anything else must be named here.
const under = (dir, ok) => fs.readdirSync(path.join(HERE, dir), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? under(dir + '/' + e.name, ok) : ok(e.name) ? [dir + '/' + e.name] : []);
// .gitignore ships too: unzipped inside a git repository, the Bridge's data/ (private details in plain text) must not
// be offered for a commit.
const SHIP = ['server.js', 'index.html', 'start-bridge.cmd', 'install.cmd', 'uninstall.cmd', 'start-demo.cmd', 'README.md', 'USER-GUIDE.md', 'DEVELOPERS.md', 'LICENSE', 'projects.example.json', '.gitignore',
  'test/audit.test.js', 'test/damaged.test.js', 'test/live.test.js', 'test/gitstate.test.js', 'test/sensors.test.js', 'test/tokens.test.js', 'test/setup.test.js', 'test/disclosure.test.js', 'test/judged.test.js', 'test/server.test.js', 'test/snapshot.test.js', 'test/robust.test.js', 'test/roots.test.js', 'test/museum.test.js', 'test/rules-more.test.js', 'test/cross.test.js', 'test/live-more.test.js', 'test/review.test.js', 'test/severity.test.js', 'test/update.test.js', 'test/demo.test.js', 'test/page.test.js', 'test/backup.test.js', 'test/start-line.test.js', 'tools/sign-release.js', 'tools/disclose.js', 'tools/calibrate.js', 'tools/make-icon.js', 'tools/bench.js', 'tools/benchmark.js', 'tools/setup.js',
  'demo/demo.js', 'demo/site.js', 'demo/live-sites.js',
  ...under('lib', f => /\.(js|ps1)$/.test(f)), ...under('test/museum', f => /\.(js|json)$/.test(f)), ...under('public', f => /^(index\.html|bridge\.ico|[\w-]+\.(css|js))$/.test(f))];
const EMPTY_PROJECTS = {
  note: 'The Bridge\'s own list of names, descriptions and live addresses, keyed by project folder name. Nothing here is written into any project\'s folder. See USER-GUIDE.md, "Names and descriptions".',
};

// The release key first: made on the first bake, its public half goes into lib/release.js, which then ships.
const CHECK_ONLY = process.argv.includes('--check');
const key = CHECK_ONLY ? null : signing.ensureKey({ newKey: process.argv.includes('--new-key') });
if (key && key.error) { console.error('Bake stopped: ' + key.error); process.exit(1); }
if (key && key.said) console.log(key.said);

const out = path.join(HERE, '_releases');
const stage = path.join(out, 'stage-' + VERSION);
const root = path.join(stage, 'my-project-bridge');
const zip = path.join(out, 'my-project-bridge-' + VERSION + '.zip');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
for (const rel of SHIP) {
  const to = path.join(root, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(HERE, rel), to);
}
fs.writeFileSync(path.join(root, 'projects.json'), JSON.stringify(EMPTY_PROJECTS, null, 2) + '\n');
// What this version itself put at the top of its folder: an update or Switch never carries these into another
// version as if they were yours (lib/update-swap.js).
const top = [...new Set(SHIP.map(f => f.split('/')[0]))].sort();
fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify({ name: 'My Project Bridge', version: VERSION, top: [...top, 'release.json'] }, null, 1) + '\n');

// ---- private details: the disclosure pass's own matcher (lib/disclosure.js), so the bake and the audit agree ----
// This PC's details are read now, never stored; the list you keep in the Bridge (data/private-details.json) is added.
const projectsDir = path.dirname(HERE);
const details = [...readPrivateList(path.join(HERE, 'data', 'private-details.json')), ...autoDetails([projectsDir])];
const others = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== path.basename(HERE) && !/^[._-]/.test(e.name)).map(e => e.name); // .claude, _backups: tool folders, not projects
const scan = makeMatcher({ details, others, own: [path.basename(HERE), 'my-project-bridge'] });
const hits = [];
// Spelled in two parts so this file does not match itself.
const PRIVATE_BLOCK = new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----');
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else check(f); } };
function check(f) {
  if (/\.(ico|png)$/i.test(f)) return;
  const at = path.relative(f.startsWith(root) ? root : HERE, f);
  const text = fs.readFileSync(f, 'utf8');
  for (const h of scan(text)) hits.push(scan.redact(at) + ':' + h.line + '  [' + h.rule + (h.labels.size ? ': ' + [...h.labels].join(', ') : '') + ']');
  for (const h of scan.inName(at)) hits.push(scan.redact(at) + '  [' + h.rule + ' in the file name' + (h.labels.size ? ': ' + [...h.labels].join(', ') : '') + ']');
  // Notes from building it: dated remarks (the shipped files carry no dates).
  text.split(/\r?\n/).forEach((l, i) => { if (/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20\d\d\b/i.test(l)) hits.push(at + ':' + (i + 1) + '  [dated note]'); });
  // A private key (the release key above all) never ships: a .pem / .key file, or a key block inside any file.
  if (/\.(pem|key|p12|pfx)$/i.test(f) || PRIVATE_BLOCK.test(text)) hits.push(at + '  [private key]  a private key must never ship');
}
walk(root);
// The git repo publishes more than the zip (tests, tools ...): every tracked file gets the same check.
let tracked = [];
try { tracked = execFileSync('git', ['ls-files'], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(f => f && !SHIP.includes(f)); } catch {}
for (const f of tracked) check(path.join(HERE, f));
// .cmd files must keep Windows line endings
for (const c of SHIP.filter(f => /\.(cmd|ps1)$/.test(f))) if (/[^\r]\n/.test(fs.readFileSync(path.join(root, c), 'latin1'))) hits.push(c + '  [line endings]  needs CRLF');
if (hits.length) {
  fs.rmSync(stage, { recursive: true, force: true });
  console.error('Bake stopped: ' + hits.length + ' possible private detail(s) in the shipped files (labels only, never the values):\n  ' + hits.join('\n  '));
  process.exit(1);
}
// --check: the private-details check on exactly what would ship, without making (or replacing) a zip.
if (CHECK_ONLY) {
  fs.rmSync(stage, { recursive: true, force: true });
  console.log('Check only: ' + SHIP.length + ' files would ship; private-details check: ' + new Set(details.map(d => d.label)).size + ' kinds of detail, ' + others.length + ' project names, 0 hits. No zip made.');
  process.exit(0);
}

// A zip of this version already exists: once shared it is spent (a new bake needs a new version), so it is never
// replaced by accident. --again replaces it when it was never shared.
if (fs.existsSync(zip) && !process.argv.includes('--again')) {
  fs.rmSync(stage, { recursive: true, force: true });
  console.error('Bake stopped: ' + path.relative(HERE, zip) + ' already exists. If it was shared, bump the version in lib/config.js first; if it was never shared, run again with --again to replace it.');
  process.exit(1);
}
fs.rmSync(zip, { force: true });
// Windows' own tar (bsdtar) writes a real zip with forward slashes; Git's GNU tar on the PATH reads "C:" as a host.
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
execFileSync(TAR, ['-a', '-c', '-f', zip, 'my-project-bridge'], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });
const n = execFileSync(TAR, ['-t', '-f', zip], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(x => !x.endsWith('/')).length;
console.log('Baked ' + path.relative(HERE, zip) + ': ' + n + ' files, ' + Math.round(fs.statSync(zip).size / 1024) + ' KB. Private-details check: ' + new Set(details.map(d => d.label)).size + ' kinds of detail, ' + others.length + ' project names, 0 hits.');
// Signed for About › Update from a zip and Check for updates, and the signed tag message for the git route.
try { console.log(signing.signZip(zip, VERSION, key.pem)); }
catch (e) { fs.rmSync(zip + '.sig', { force: true }); console.error('The zip was made but NOT signed: ' + e.message); process.exit(1); }
console.log(signing.nextSteps(VERSION, signing.writeTag(VERSION, key.pem)));
