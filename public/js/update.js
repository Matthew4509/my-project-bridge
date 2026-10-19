// About › Updates: Check for updates, Update from a zip…, Install (or Install anyway on a warning), and the old copies
// kept beside this one (Switch to, Remove). The Bridge does the checking; this only asks and shows.
'use strict';

let updState = null;
async function loadUpdate() {
  try { updState = await api('/api/update'); renderUpdate(); } catch (e) { info(e.message, true); }
}
const updDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : ' on ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
function updLastLine(l) {
  if (!l.ok) return 'The change to My Project Bridge ' + l.to + updDate(l.when) + ' did not go in: ' + l.why + '. ' + l.from + ' was started again, as it was.';
  return (l.back ? 'Went back from ' + l.from + ' to ' : 'Updated from ' + l.from + ' to ') + l.to + updDate(l.when) + '.';
}
function renderUpdate() {
  const s = updState;
  if (!s) return;
  $('upd-note').textContent = 'This is My Project Bridge ' + s.version + '. '
    + (s.route === 'git' ? 'This copy is a git clone: Check for updates asks the Bridge\'s GitHub address for its signed release tags. '
      : 'Check for updates asks GitHub once, only when you press it, and sends nothing about you. ')
    + 'An update is installed only when it is signed by the Bridge\'s maker; a zip you pick yourself without that signature gets a warning first.';
  const extra = [];
  if (s.last && s.last.to) extra.push(h('span', { class: s.last.ok ? 'upd-line' : 'warn-line' }, s.last.ok ? null : icon(0xE7BA), ' ', updLastLine(s.last)));
  for (const o of s.old) extra.push(h('span', { class: 'upd-line' }, 'My Project Bridge ' + o.version + ' is kept beside this one. ',
    h('button', { type: 'button', class: 'linkbtn', onclick: () => updSwitch(o) }, 'Switch to ' + o.version), ' · ',
    h('button', { type: 'button', class: 'linkbtn', onclick: () => updRemove(o) }, 'Remove it…')));
  if (s.gitBack) extra.push(h('span', { class: 'upd-line' }, 'Updated through git from ' + s.last.from + '. ',
    h('button', { type: 'button', class: 'linkbtn', onclick: updGitBack }, 'Go back to ' + s.last.from)));
  $('upd-extra').replaceChildren(...extra);
}

// A button that says what it is doing while the Bridge works.
async function updBusy(btn, label, fn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = was; }
}
// The Bridge's own words for what a test copy would have done (they start "test copy: ...").
const updDry = s => s.charAt(0).toUpperCase() + s.slice(1) + '.';
const updCancel = () => h('button', { class: 'btn', type: 'button', onclick: () => { api('/api/update/cancel', {}).catch(() => {}); closeDialog(); } }, 'Cancel');

// The update is opened and checked: Install (signed), or a red warning with Install anyway (a zip picked by hand).
function updInstallDialog(p) {
  const err = h('div', { class: 'err', role: 'alert' });
  const go = anyway => async e => {
    const btn = e.currentTarget;
    err.textContent = '';
    btn.disabled = true;
    try {
      const r = await updBusy(btn, 'Testing it…', () => api('/api/update/install', { version: p.version, anyway }));
      if (!r.ok) { err.textContent = r.error; return; }
      closeDialog();
      if (r.dryRun) { info(updDry(r.dryRun)); return loadUpdate(); }
      info('Installing My Project Bridge ' + r.version + ': the Bridge restarts now, and this window reloads by itself in a few seconds.');
    } catch (x) { err.textContent = x.message; }
  };
  const what = h('p', { class: 'muted' }, 'Install starts it once as a test. Then the Bridge closes, the new version takes its place with your settings, project list and data, and it starts again; this window reloads by itself. Your local copies stop with the Bridge. The version you have now stays beside it, so you can switch back.');
  if (!p.code) {
    return dialog('Install My Project Bridge ' + p.version + '?', [
      h('p', null, icon(0xE73E), ' Signed by the Bridge\'s maker: checked.'), what, err],
    [h('button', { class: 'btn accent', type: 'button', onclick: go(false) }, 'Install'), updCancel()]);
  }
  // Cancel is the default here (Enter presses it); Install anyway has to be chosen.
  dialog('This zip is not signed by the Bridge\'s maker', [
    h('div', { class: 'upd-warn', role: 'alert' }, h('b', null, icon(0xE7BA), ' Warning: '), p.warning),
    h('p', null, 'It holds My Project Bridge ' + p.version + '. Install it only if you trust where it came from, for example a zip you made yourself.'),
    what, err],
  [h('button', { class: 'btn accent', type: 'button', onclick: () => { api('/api/update/cancel', {}).catch(() => {}); closeDialog(); } }, 'Cancel'),
    h('button', { class: 'btn danger', type: 'button', onclick: go(true) }, 'Install anyway')]);
}

$('btn-upd-check').addEventListener('click', () => updBusy($('btn-upd-check'), 'Checking…', async () => {
  let r;
  try { r = await api('/api/update/check', {}); } catch (e) { return info(e.message, true); }
  if (r.dryRun) return info(updDry(r.dryRun));
  if (!r.ok) return info(r.error, true);
  if (!r.newer) return info('You have the newest: My Project Bridge ' + r.mine + (r.version !== r.mine ? ' (GitHub\'s newest is ' + r.version + ')' : '') + '.');
  const err = h('div', { class: 'err', role: 'alert' });
  const get = h('button', { class: 'btn accent', type: 'button', onclick: async () => {
    err.textContent = '';
    try {
      const g = await updBusy(get, r.route === 'git' ? 'Fetching…' : 'Downloading…', () => api('/api/update/get', { version: r.version, route: r.route }));
      if (g.dryRun) { closeDialog(); return info(updDry(g.dryRun)); }
      if (!g.ok) { err.textContent = g.error; return; }
      updInstallDialog(g.pending);
    } catch (e) { err.textContent = e.message; }
  } }, r.route === 'git' ? 'Fetch and check' : 'Download and check');
  dialog('My Project Bridge ' + r.version + ' is out', [
    h('p', null, 'This is ' + r.mine + '.' + (r.published ? ' Released' + updDate(r.published) + '.' : '')),
    r.notes ? h('p', { class: 'muted' }, r.notes) : null,
    h('p', { class: 'muted' }, 'Its signature is checked before anything in it is opened; nothing changes until you press Install.'), err],
  [get, cancelBtn()]);
}));

$('btn-upd-zip').addEventListener('click', () => {
  const input = h('input', { type: 'text', placeholder: 'C:\\Users\\you\\Downloads\\my-project-bridge-0.1.0.zip', 'aria-label': 'Zip path', spellcheck: 'false' });
  const err = h('div', { class: 'err', role: 'alert' });
  const browse = h('button', { class: 'btn', type: 'button', onclick: async () => {
    err.textContent = '';
    try {
      const r = await updBusy(browse, 'Opening…', () => api('/api/update/pick', {}));
      if (r.path) input.value = r.path;
      else if (r.error) err.textContent = r.error;
      else if (r.dryRun) err.textContent = 'Test copy: ' + r.dryRun + ' (type a path instead).';
    } catch (e) { err.textContent = e.message; }
    input.focus();
  } }, icon(0xE838), 'Browse…');
  const ok = h('button', { class: 'btn accent', type: 'button', onclick: async () => {
    if (!input.value.trim()) { err.textContent = 'Choose the zip with Browse…, or type its path.'; return input.focus(); }
    err.textContent = '';
    try {
      const r = await updBusy(ok, 'Checking…', () => api('/api/update/zip', { path: input.value.trim() }));
      if (!r.ok) { err.textContent = r.error; return; }
      updInstallDialog(r.pending);
    } catch (e) { err.textContent = e.message; }
  } }, 'Open and check');
  dialog('Update from a zip', [
    h('p', { class: 'muted' }, 'Pick the my-project-bridge-<version>.zip you downloaded. Keep its signature file (the same name ending in .sig) beside it: the Bridge checks it before anything in the zip is used.'),
    h('div', { class: 'field' }, input, browse), err], [ok, cancelBtn()]);
});

function updConfirm(title, lines, label, run) {
  const err = h('div', { class: 'err', role: 'alert' });
  const go = h('button', { class: 'btn accent', type: 'button', onclick: async () => {
    err.textContent = '';
    try {
      const r = await updBusy(go, 'Working…', run);
      if (!r.ok) { err.textContent = r.error; return; }
      closeDialog();
      if (r.dryRun) info(updDry(r.dryRun));
      else if (r.restarting) info('The Bridge restarts as My Project Bridge ' + r.version + '; this window reloads by itself in a few seconds.');
      else if (r.removed) info(r.removed + ' is in the Recycle Bin.');
      loadUpdate();
    } catch (e) { err.textContent = e.message; }
  } }, label);
  dialog(title, [...lines.map(l => h('p', null, l)), err], [go, cancelBtn()]);
}
const updSwitch = o => updConfirm('Switch to My Project Bridge ' + o.version + '?', [
  'The Bridge closes, ' + o.version + ' takes its place with your settings, project list and data, and starts again; this window reloads by itself. Your local copies stop with the Bridge.',
  'This version (' + updState.version + ') is kept beside it, so you can switch back.'], 'Switch to ' + o.version, () => api('/api/update/switch', { folder: o.folder }));
const updRemove = o => updConfirm('Remove My Project Bridge ' + o.version + '?', [
  'The old copy (the folder ' + o.folder + ' beside this one) goes to the Recycle Bin. Your settings and data are not in it: they moved to this version.',
  'After this you cannot switch back to ' + o.version + ' from here.'], 'Remove it', () => api('/api/update/remove-old', { folder: o.folder }));
const updGitBack = () => updConfirm('Go back to My Project Bridge ' + updState.last.from + '?', [
  'Git moves this clone back to the commit it was on before the update, and the Bridge restarts; this window reloads by itself.'],
  'Go back', () => api('/api/update/git-back', {}));
