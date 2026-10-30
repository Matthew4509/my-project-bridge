// The page points from the four-apps audit: the bar, the Running list and the orbit count the same
// sites (MPB-2); the orbit hides when empty and folds off the Projects page (MPB-3 / X-13); the List view keeps
// names whole (MPB-1); controls are at least 24 px tall (MPB-4). Reads public/ only; the browser walk is in the
// handoff. Run: node test/page.test.js   (no packages)
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const PUB = path.join(__dirname, '..', 'public');
// As \n: Git for Windows checks files out with \r\n (core.autocrlf), and the patterns below are written with \n.
const read = f => fs.readFileSync(path.join(PUB, f), 'utf8').replace(/\r\n/g, '\n');
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
  assert(/\.find\(x => !x\.readOnly && !x\.disabled && x\.getClientRects\(\)\.length\) \|\| \$\('dlg-foot'\)\.querySelector\('\.accent'\);\n  if \(f\) f\.focus\(\);/.test(DIALOGS),
    'Welcome\'s copy block (a hidden, read-only textarea) is skipped, so Done takes the focus, not the first tick box');
});

// auditLabel and showAudit, taken from their files and run here with made-up audits.
const CORE = read('js/core.js'), ACTIONS = read('js/actions.js');
const labelSrc = CORE.match(/function auditLabel\(a\) \{[\s\S]*?\n\}/);
const label = a => new Function('fmtWhen', labelSrc[0] + '\nreturn auditLabel;')(() => 'today')(a);
check('the audit label: amber and a shape of its own when not everything was read', () => {
  assert.deepStrictEqual(label({ counts: {}, partly: true }), { cls: 'a-warn', text: '◐ Passed, partly checked', when: 'today' });
  assert.deepStrictEqual(label({ counts: { Low: 3 }, partly: true }), { cls: 'a-warn', text: '◐ Passed, partly checked', when: 'today' });
  assert.deepStrictEqual(label({ counts: { Medium: 2 }, partly: true }), { cls: 'a-warn', text: '■ 2 Medium, partly checked', when: 'today' });
  assert.strictEqual(label({ counts: { High: 1 }, partly: true }).text, '▲ 1 High');
  assert.strictEqual(label({ counts: { Critical: 1 }, partly: true }).cls, 'a-bad');
});
check('the audit label: a part that did not finish never says Passed', () => {
  assert.deepStrictEqual(label({ counts: {}, partly: true, cut: ['The code check crashed'] }), { cls: 'a-warn', text: '◐ Check did not finish', when: 'today' });
  assert.deepStrictEqual(label({ counts: { Medium: 2 }, partly: true, cut: ['The code check crashed'] }), { cls: 'a-warn', text: '■ 2 Medium, check did not finish', when: 'today' });
  assert.strictEqual(label({ counts: { High: 1 }, partly: true, cut: ['The code check crashed'] }).text, '▲ 1 High');
});
check('the audit label: an audit that read no file never says Passed', () => {
  assert.deepStrictEqual(label({ counts: {}, partly: true, filesScanned: 0 }), { cls: 'a-warn', text: '◐ No code was read', when: 'today' });
  assert.strictEqual(label({ counts: {}, partly: true, filesScanned: 3 }).text, '◐ Passed, partly checked');
  assert.strictEqual(label({ counts: {}, filesScanned: 0 }).text, '✓ Passed');
});
check('the audit label: an old saved audit with no partly field shows as it did', () => {
  assert.deepStrictEqual(label({ counts: {} }), { cls: 'a-ok', text: '✓ Passed', when: 'today' });
  assert.deepStrictEqual(label({ counts: { Medium: 2 } }), { cls: 'a-warn', text: '■ 2 Medium', when: 'today' });
  assert.deepStrictEqual(label({ counts: {}, partly: false }), { cls: 'a-ok', text: '✓ Passed', when: 'today' });
});

const showSrc = ACTIONS.match(/const SEV = \{[\s\S]*?\nfunction showAudit\(r, a, lead\) \{[\s\S]*?\n\}\n/);
const fakeH = (tag, attrs, ...kids) => ({ tag, attrs: attrs || {}, kids: kids.flat() });
const allOf = n => n == null || n === false ? [] : Array.isArray(n) ? n.flatMap(allOf) : typeof n === 'object' ? [n, ...allOf(n.kids)] : [];
const textOf = n => n == null || n === false ? '' : Array.isArray(n) ? n.map(textOf).join(' ') : typeof n === 'object' ? textOf(n.kids) : String(n);
function audit(a) {
  let shown = null;
  new Function('h', 'dialog', 'hostOf', 'oneLine', 'closeDialog', 'info', 'navigator', 'judgeDialog', 'reviewDialog', 'importDialog', 'unjudge', showSrc[0] + '\nreturn { showAudit, faultsText };')(
    fakeH, (title, kids) => { shown = kids; }, x => x, x => String(x), () => {}, () => {}, {}, () => {}, () => {}, () => {}, () => {}).showAudit({ name: 'Made up', folder: 'made-up' }, { rules: 10, filesScanned: 3, seconds: 1, findings: [], counts: {}, ranAt: '2000-01-01', ...a });
  return { text: textOf(shown), nodes: allOf(shown) };
}
const oklike = nodes => nodes.filter(n => String(n.attrs.class || '').split(' ').includes('a-ok'));
const NOT = ['Code files over 800 KB: 1', 'pdf files (the pass cannot read inside them): 2'];
check('the audit window: a partly checked pass says what was not read, amber, with no green Passed', () => {
  const { text, nodes } = audit({ partly: true, notRead: NOT, cut: [] });
  for (const n of NOT) assert(text.includes(n), text);
  assert(/not everything was read/i.test(text), text);
  assert(!/✓ Passed/.test(text) && !/Passed every rule/.test(text) && !oklike(nodes).length, text);
  assert(nodes.some(n => String(n.attrs.class).includes('a-warn') && /◐/.test(textOf(n))), 'an amber row with its own shape');
});
check('the audit window: with faults and gaps it still lists the gaps', () => {
  const { text } = audit({ partly: true, notRead: NOT, cut: [], counts: { High: 1 }, findings: [{ rule: 'X-1', sev: 'High', title: 't', area: 'a', where: 'w', fix: 'f' }] });
  assert(/Fix the Critical and High/.test(text) && text.includes(NOT[0]), text);
});
check('the audit window: an old saved audit, and one read whole, show the green Passed as before', () => {
  for (const a of [{}, { partly: false, notRead: [], cut: [] }]) {
    const { text, nodes } = audit(a);
    assert(/✓ Passed/.test(text) && /Passed every rule/.test(text) && oklike(nodes).length === 1 && !/◐/.test(text), text);
  }
});
check('the audit summary the list reads carries partly', () => {
  assert(/function auditSummary\(a\) \{[^\n]*partly: a\.partly === true/.test(fs.readFileSync(path.join(__dirname, '..', 'lib', 'audit-store.js'), 'utf8')));
});
check('the copied fault list says what was not read', () => {
  const src = showSrc[0];
  assert(/function faultsText[\s\S]*?a\.notRead/.test(src), 'faultsText names notRead');
});

console.log(failures ? failures + ' FAILED' : 'all passed');
process.exit(failures ? 1 : 0);
