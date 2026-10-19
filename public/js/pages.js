// Pages and navigation, the first-start Welcome, and the About shortcuts.
'use strict';

// ---- pages ----
// A page can carry one more part after a slash: #prompts/<category> opens that category.
function show(page) {
  let [base, sub] = String(page).split('/');
  if (!document.getElementById('page-' + base)) { base = 'projects'; sub = ''; }
  page = sub ? base + '/' + sub : base;
  for (const s of document.querySelectorAll('.page')) s.hidden = s.id !== 'page-' + base;
  for (const b of document.querySelectorAll('.nav-item')) b.setAttribute('aria-current', b.dataset.page === base ? 'page' : 'false');
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  closeMenu();
  if (base === 'folders') loadFolders();
  if (base === 'audits') renderAudits();
  if (base === 'prompts') { let cat = ''; try { cat = sub ? decodeURIComponent(sub) : ''; } catch {} loadPrompts(cat); } // a mistyped %-escape opens the tiles
  if (base === 'about') { loadShortcuts(); loadSetup(); loadGitProgram(); }
}

// ---- First start: one click, and the Bridge runs itself from then on (starting a server by hand is where many
// people get stuck). Both choices start ticked; asked once, and About can change them later. ----
let welcomeShown = false;
function welcomeDialog() {
  welcomeShown = true;
  const tick = (id, label, note) => h('label', { style: 'display:flex;gap:10px;align-items:flex-start;margin:10px 0' },
    h('input', { type: 'checkbox', id, checked: true, style: 'margin-top:3px' }), h('span', null, h('b', null, label), h('br'), h('span', { class: 'muted', style: 'font-size:13px' }, note)));
  // Making a shortcut can take several seconds on a busy PC: the buttons say so and take no second click meanwhile.
  const busy = h('p', { class: 'muted', role: 'status', style: 'font-size:13px;min-height:1.4em' });
  let working = false;
  const answer = async (yes) => {
    if (working) return;
    const body = yes ? { startup: $('w-startup').checked, desktop: $('w-desktop').checked } : {};
    working = true;
    for (const el of $('dlg').querySelectorAll('button, input')) el.disabled = true;
    if (body.startup || body.desktop) { done.textContent = 'Setting up…'; busy.textContent = 'Making the shortcuts. This can take a few seconds when the PC is busy.'; }
    try {
      const r = await api('/api/welcome', body);
      closeDialog();
      if (!r.ok) return info(r.error, true);
      const dry = r.results.filter(x => x.dryRun).map(x => x.dryRun);
      if (dry.length) info('Test copy, nothing changed: ' + dry.join('; ') + '.');
      else if (body.startup || body.desktop) info('Done. ' + [body.startup && 'The Bridge will start by itself when you sign in to Windows.', body.desktop && 'Its shortcut is on your desktop.'].filter(Boolean).join(' '));
      else info('No problem. You can turn these on any time on the About page.');
    } catch (e) { closeDialog(); info(e.message, true); }
  };
  const done = h('button', { class: 'btn accent', type: 'button', onclick: () => answer(true) }, 'Done');
  dialog('Welcome to My Project Bridge', [
    h('p', null, 'Your projects, local copies and audits, on this PC only.'),
    h('p', { class: 'muted' }, 'So you never have to start it by hand:'),
    tick('w-startup', 'Start the Bridge when I sign in to Windows', 'It runs quietly in the background; open it from the desktop shortcut, index.html or a bookmark.'),
    tick('w-desktop', 'Put a My Project Bridge shortcut on my desktop', 'Double-click it any time to open the Bridge.'),
    h('p', { class: 'muted', style: 'font-size:13px' }, 'You can change both later on the About page.'),
    h('div', { style: 'border-top:1px solid var(--line2);margin-top:14px;padding-top:12px' },
      h('b', null, 'Teach your AI to save a start line'),
      h('p', { class: 'muted', style: 'font-size:13px;margin:4px 0 10px' }, 'The Bridge runs each project from a "start" line in its project.json. Paste this prompt once into Claude, ChatGPT or the AI you use, and it will write that line for your projects and keep it up to date. It is also on the Prompts page.'),
      copyBlock('Copy the prompt', startLinePrompt, 'Start-line prompt copied. Paste it into the AI you use.')),
    busy],
    [done, h('button', { class: 'btn', type: 'button', onclick: () => answer(false) }, 'Not now')]);
}

// ---- About: desktop shortcut and Start with Windows ----
let shortcuts = null;
async function loadShortcuts() {
  try { shortcuts = await api('/api/shortcuts', {}); renderShortcuts(); } catch (e) { info(e.message, true); }
}
function renderShortcuts() {
  const d = shortcuts.desktop;
  $('sc-desktop-show').hidden = $('sc-desktop-new').hidden = !d.exists;
  $('sc-desktop-note').textContent = d.exists ? 'On your desktop as "My Project Bridge" (' + d.path + '). Show me finds it for you.' : 'Start the Bridge from an icon on your desktop.';
  for (const where of ['desktop', 'startup']) {
    const s = shortcuts[where], b = $('sc-' + where);
    b.disabled = false;
    b.textContent = s.exists ? (where === 'desktop' ? 'Remove shortcut' : 'Turn off') : (where === 'desktop' ? 'Add shortcut' : 'Turn on');
    b.classList.toggle('accent', !s.exists);
  }
}
for (const where of ['desktop', 'startup']) $('sc-' + where).addEventListener('click', async () => {
  if (!shortcuts) return;
  const on = !shortcuts[where].exists, b = $('sc-' + where);
  b.disabled = true;
  try {
    const r = await api('/api/shortcut', { where, on });
    if (!r.ok) info(r.error, true);
    else if (r.dryRun) info('Test copy, not changed: ' + r.dryRun + '.');
    else info(where === 'desktop' ? (on ? 'Shortcut "My Project Bridge" added to your desktop.' : 'Desktop shortcut removed.') : (on ? 'The Bridge will start when you sign in to Windows.' : 'The Bridge will no longer start with Windows.'));
  } catch (e) { info(e.message, true); }
  await loadShortcuts();
});
$('sc-desktop-show').addEventListener('click', async () => {
  try { const r = await api('/api/shortcut-show', { where: 'desktop' }); if (!r.ok) info(r.error, true); else if (r.dryRun) info('Test copy, not opened: ' + r.dryRun + '.'); else info('Explorer is open with the shortcut selected: ' + r.path); }
  catch (e) { info(e.message, true); }
});
$('sc-desktop-new').addEventListener('click', async () => {
  try { const r = await api('/api/shortcut', { where: 'desktop', on: true }); if (!r.ok) info(r.error, true); else if (r.dryRun) info('Test copy, not changed: ' + r.dryRun + '.'); else info('A new "My Project Bridge" shortcut is on your desktop: ' + r.path); }
  catch (e) { info(e.message, true); }
  await loadShortcuts();
});
for (const b of document.querySelectorAll('.nav-item')) b.addEventListener('click', () => show(b.dataset.page));
// The name at the top is the way home: Projects, scrolled to the top, even when Projects is already showing.
document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); show('projects'); document.querySelector('main').scrollTop = 0; });
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
