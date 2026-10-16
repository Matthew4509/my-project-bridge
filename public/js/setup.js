// About › Setup (Run setup again) and Uninstall: the same three things install.cmd sets up — the Load Bridge link,
// the desktop shortcut and Start with Windows — changed from inside the Bridge.
'use strict';

let setupState = null;
const SETUP_ITEMS = [
  ['link', 'Load Bridge link', 'index.html\'s Load Bridge button starts the Bridge (my-project-bridge://start). start-bridge.cmd also sets it up each time it starts.'],
  ['desktop', 'Desktop shortcut', 'Double-click it to open the Bridge.'],
  ['startup', 'Start with Windows', 'Starts the Bridge quietly when you sign in.'],
];
async function loadSetup() {
  try { setupState = await api('/api/setup'); renderSetup(); } catch (e) { info(e.message, true); }
}
function renderSetup() {
  const s = setupState;
  if (!s) return;
  const on = k => !!(s[k] && s[k].exists);
  $('setup-note').textContent = 'Node.js ' + s.node.version + (s.node.ok ? '' : ' (needs ' + s.node.min + ' or newer: run install.cmd)') + ' · '
    + SETUP_ITEMS.map(([k, name]) => name + ' ' + (on(k) ? (k === 'link' && s.link.here === false ? 'points at another folder' : 'on') : 'off')).join(' · ');
}
// Asking Windows about the shortcuts takes a second or two: the button says so meanwhile.
async function freshSetup(btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Checking…';
  try { await loadSetup(); } finally { btn.disabled = false; btn.textContent = label; }
}
const isOn = (s, k) => !!(s[k] && s[k].exists && (k !== 'link' || s.link.here !== false));
$('btn-setup').addEventListener('click', async () => {
  await freshSetup($('btn-setup'));
  const s = setupState;
  if (!s) return;
  const tick = ([k, label, note]) => h('label', { style: 'display:flex;gap:10px;align-items:flex-start;margin:10px 0' },
    h('input', { type: 'checkbox', id: 'su-' + k, checked: k === 'link' || !!(s[k] && s[k].exists), style: 'margin-top:3px' }),
    h('span', null, h('b', null, label), h('br'), h('span', { class: 'muted', style: 'font-size:13px' }, note)));
  const err = h('div', { class: 'err', role: 'alert' });
  const ok = h('button', { class: 'btn accent', type: 'button', onclick: async () => {
    const body = {}; // only what changes, so the reply names exactly what was done
    for (const [k] of SETUP_ITEMS) if ($('su-' + k).checked !== isOn(s, k)) body[k] = $('su-' + k).checked;
    if (!Object.keys(body).length) { closeDialog(); return info('Nothing to change: everything is already as ticked.'); }
    ok.disabled = true;
    try {
      const r = await api('/api/setup', body);
      if (!r.ok) { err.textContent = r.error; ok.disabled = false; return; }
      closeDialog();
      setupState = r.status; renderSetup();
      const dry = r.results.filter(x => x.dryRun).map(x => x.dryRun);
      info(dry.length ? 'Test copy, nothing changed: ' + dry.join('; ') + '.' : 'Setup done: ' + SETUP_ITEMS.filter(([k]) => k in body).map(([k, name]) => name + (body[k] ? ' on' : ' off')).join(', ') + '.');
      loadShortcuts();
    } catch (e) { err.textContent = e.message; ok.disabled = false; }
  } }, 'Apply');
  dialog('Run setup again', [
    h('p', null, 'Node.js ' + s.node.version + (s.node.ok ? ': fine.' : ': too old. Close the Bridge and double-click install.cmd, which can update it.')),
    h('p', { class: 'muted' }, 'Ticked = set up, unticked = taken away. This changes only shortcuts and the link, for your Windows user; your projects and settings are not touched.'),
    ...SETUP_ITEMS.map(tick), err,
    h('p', { class: 'muted', style: 'font-size:13px' }, 'The Bridge\'s folder: ' + s.folder + '. If you moved it, Apply points the shortcuts and the link at the new place.')],
    [ok, cancelBtn()]);
});

$('btn-uninstall').addEventListener('click', async () => {
  await freshSetup($('btn-uninstall'));
  const folder = setupState ? setupState.folder : 'the Bridge\'s folder';
  const go = h('button', { class: 'btn accent danger', type: 'button', onclick: async () => {
    go.disabled = true;
    try {
      const r = await api('/api/uninstall', {});
      if (!r.ok) { closeDialog(); return info(r.error, true); }
      const dry = r.results.filter(x => x.dryRun).map(x => x.dryRun);
      dialog('My Project Bridge is uninstalled', [
        dry.length ? h('p', null, 'Test copy, nothing on Windows changed: ' + dry.join('; ') + '.') : h('p', null, 'The desktop shortcut, Start with Windows and the Load Bridge link are gone, and the Bridge has stopped.'),
        h('p', null, 'Its files are still in ', h('b', null, r.folder), '. Delete that folder to remove it completely; its data folder holds your settings, audits and prompts, so keep a copy of anything you want.'),
        h('p', { class: 'muted', style: 'font-size:13px' }, 'Changed your mind? Double-click install.cmd in that folder.')],
        [h('button', { class: 'btn accent', type: 'button', onclick: () => window.close() }, 'Close the window')]);
    } catch (e) { closeDialog(); info(e.message, true); }
  } }, 'Uninstall');
  dialog('Uninstall My Project Bridge?', [
    h('p', null, 'This stops the Bridge and every local copy it started, and removes its desktop shortcut, Start with Windows and the Load Bridge link.'),
    h('p', null, 'Nothing is deleted: the Bridge\'s files stay in ', h('b', null, folder), ', and the next step tells you how to remove them.')],
    [go, cancelBtn()]);
});
