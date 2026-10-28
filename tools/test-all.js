// Every test/*.test.js, one after another, then one line each and a total. `npm test` runs it.
//   node tools/test-all.js            all of them
//   node tools/test-all.js --quick    without setup.test.js (runs install.cmd and uninstall.cmd against throwaway
//                                     keys, about a minute) and snapshot.test.js (needs Microsoft Edge)
//   node tools/test-all.js backup ... only the tests whose names hold one of these words
// Exit code 1 when any test failed.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = path.join(__dirname, '..');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const words = args.filter(a => !a.startsWith('--'));
const SLOW = ['setup.test.js', 'snapshot.test.js'];

const tests = fs.readdirSync(path.join(HERE, 'test')).filter(f => f.endsWith('.test.js'))
  .filter(f => !quick || !SLOW.includes(f))
  .filter(f => !words.length || words.some(w => f.includes(w)));
if (!tests.length) { console.log('No test matches ' + words.join(', ') + '.'); process.exit(1); }

const failed = [];
for (const f of tests) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join('test', f)], { cwd: HERE, encoding: 'utf8', timeout: 10 * 60000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0;
  console.log((ok ? 'ok   ' : 'FAIL ') + f.padEnd(26) + Math.round((Date.now() - t0) / 1000) + ' s');
  if (!ok) {
    failed.push(f);
    const lines = out.split(/\r?\n/).filter(l => /^FAIL|Error|assert/i.test(l)).slice(0, 8);
    for (const l of lines.length ? lines : out.split(/\r?\n/).slice(-8)) console.log('       ' + l);
  }
}
console.log('');
console.log(failed.length ? failed.length + ' of ' + tests.length + ' failed: ' + failed.join(', ') : 'All ' + tests.length + ' passed.');
process.exitCode = failed.length ? 1 : 0;
