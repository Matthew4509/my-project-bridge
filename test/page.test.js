// The page points from the four-apps audit: the bar, the Running list and the orbit count the same
// sites (MPB-2); the orbit hides when empty and folds off the Projects page (MPB-3 / X-13); the List view keeps
// names whole (MPB-1); controls are at least 24 px tall (MPB-4). Reads public/ only; the browser walk is in the
// handoff. Run: node test/page.test.js   (no packages)
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUB = path.join(__dirname, '..', 'public');
const read = f => fs.readFileSync(path.join(PUB, f), 'utf8');
const CSS = read('app.css'), HTML = read('index.html');
const STATUS = read('js/status.js'), PANELS = read('js/panels.js'), ORBIT = read('js/orbit.js'), PAGES = read('js/pages.js');
let failures = 0;
const check = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + ': ' + e.message); } };
const rule = sel => { const m = CSS.match(new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); assert(m, 'no rule for ' + sel); return m[2]; };

// runningSplit, taken from status.js and run here against made-up rows.
const src = STATUS.match(/function runningSplit\(\) \{[\s\S]*?\n\}/);
const split = rows => new Function('rows', src[0] + '\nreturn runningSplit();')(rows);
const mine = { running: { port: 1 } }, other = { running: null, portInUse: 2 }, idle = { running: null };

check('one count for the bar, the Running list and the orbit: "2 started here · 1 other"', () => {
  assert(src, 'status.js has runningSplit');
  assert.strictEqual(split([mine, mine, other, idle]).words, '2 started here · 1 other');
  assert.strictEqual(split([mine, mine, other]).n, 3);
  assert.strictEqual(split([mine, idle]).words, '1 running');
  assert.strictEqual(split([other]).words, '1 started by another program');
  assert.strictEqual(split([idle]).n, 0);
  assert(/const run = runningSplit\(\);/.test(STATUS) && /run\.words/.test(STATUS), 'the bar uses it');
  assert(/const \{ mine, other, n, words \} = runningSplit\(\);/.test(PANELS), 'the Running list uses it');
  assert(/runningSplit\(\)/.test(ORBIT) && /in orbit' \+ \(run\.other\.length && run\.n === n \? ' \(' \+ run\.words \+ '\)'/.test(ORBIT), 'the orbit uses it, only while it adds up');
  assert(!/rows\.filter\(r => r\.running\)\.length/.test(STATUS), 'the bar no longer counts only its own');
});

check('the orbit starts hidden, hides when empty (after the last explosion) and folds off the Projects page', () => {
  assert(/<div class="orbit" id="orbit" aria-label="Sites in orbit" hidden>/.test(HTML), 'hidden until something runs');
  assert(!/orbit-empty|No sites in orbit/.test(HTML + ORBIT), 'no "No sites in orbit" banner');
  assert(/if \(n \|\| dying\.size\) o\.hidden = false;/.test(ORBIT), 'shown while a site is up or exploding');
  assert(/setTimeout\(\(\) => \{ if \(!orbitEls\.size && !dying\.size\) o\.hidden = true; \}, 700\)/.test(ORBIT), 'hidden after the last explosion');
  assert(/\$\('orbit'\)\.classList\.toggle\('fold', base !== 'projects'\); renderOrbit\(\);/.test(PAGES), 'show() folds it off Projects');
  assert(/height:34px/.test(rule('.orbit.fold')), 'the strip is 34 px');
  assert(/display:none/.test(rule('.orbit.fold .sky,.orbit.fold .station')), 'no satellites in the strip');
  assert(/<button type="button" class="orbit-go" id="orbit-go">Show on Projects<\/button>/.test(HTML), 'a real button back to Projects');
  assert(/if \(\$\('orbit'\)\.classList\.contains\('fold'\)\) return show\('projects'\);/.test(ORBIT), 'a click on the strip goes to Projects, never shoots');
  for (const f of ['fire', 'burst']) assert(new RegExp('function ' + f + '\\([^)]*\\) \\{\\n  if \\(folded\\(\\)\\) return;').test(ORBIT), f + ' draws nothing while folded');
  assert(/folded\(\) \|\| calm\(\)/.test(ORBIT), 'no missiles while folded');
});

check('List view: the name keeps its width, the marks wrap under it; one column from 1300 px down', () => {
  assert(/flex-wrap:wrap/.test(rule('.row .title')), 'the title line wraps');
  assert(/flex:0 1 auto;max-width:100%/.test(rule('.row .title span.nm')), 'the name is cut only when longer than the whole column');
  assert(/@media \(max-width:1300px\)\{\n  \/\* The fixed columns/.test(CSS), 'the one-column row starts at 1300 px');
});

check('controls at least 24 px: nav items do not shrink, row marks, badges, link buttons, satellite ↗, the search field', () => {
  assert(/flex:none/.test(rule('.nav-item')) && /height:40px/.test(rule('.nav-item')), 'nav items keep 40 px');
  assert(/height:24px/.test(rule('.badge')));
  for (const sel of ['.audit-link', '.live', '.linkbtn']) assert(/min-height:24px/.test(rule(sel)), sel);
  assert(/min-width:24px;min-height:24px/.test(rule('.infobar button')), 'the message bar\'s buttons');
  assert(/width:24px;height:24px/.test(CSS.match(/\.sat-open\{[^}]*\}/)[0]), 'the satellite ↗');
  assert(/align-self:stretch/.test(rule('.search input')), 'the search field fills its box');
});

check('a window takes focus on a field it can type in, else its main button, never a hidden copy block (X-11)', () => {
  const DIALOGS = read('js/dialogs.js');
  assert(/d\.showModal\(\);/.test(DIALOGS), 'a modal window: Tab stays inside from the start');
  assert(/\.find\(x => !x\.readOnly && !x\.disabled && x\.getClientRects\(\)\.length\) \|\| \$\('dlg-foot'\)\.querySelector\('\.accent'\);\r?\n  if \(f\) f\.focus\(\);/.test(DIALOGS),
    'Welcome\'s copy block (a hidden, read-only textarea) is skipped, so Done takes the focus, not the first tick box');
});

console.log(failures ? failures + ' FAILED' : 'all passed');
process.exit(failures ? 1 : 0);
