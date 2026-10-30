// The project's … menu › Publish guard: a git pre-push hook that checks the project with the Bridge's audit before
// every push and stops the push while it says "fix first" (lib/gate.js). Turned on and off here, per project; and
// Ready to publish? runs the same check now and shows it as an audit.
'use strict';

async function gateDialog(r) {
  let s;
  try { s = await api('/api/gate?id=' + encodeURIComponent(r.id)); } catch (e) { return info(e.message, true); }
  const err = h('div', { class: 'err', role: 'alert' });
  const said = {
    on: ['a-ok', 'On: every push of ' + r.name + ' is checked first.'],
    off: ['a-warn', 'Off: pushes of ' + r.name + ' are not checked.'],
    other: ['a-warn', 'Not added: ' + s.why],
    unsupported: ['a-warn', 'Not added: ' + s.why],
    'no-git': ['a-low', s.why],
  }[s.state] || ['a-low', s.state];
  const set = on => async () => {
    err.textContent = '';
    try {
      const x = await api('/api/gate/' + (on ? 'on' : 'off'), { id: r.id });
      if (x.dryRun) { err.textContent = 'Dry run: ' + x.dryRun + '.'; return; }
      if (!x.ok) { err.textContent = x.error; return; }
      info(on ? 'Publish guard on for ' + r.name + ': every push is checked first.' : 'Publish guard off for ' + r.name + '.');
      gateDialog(r);
    } catch (e) { err.textContent = e.message; }
  };
  const lineBox = s.line ? h('textarea', { class: 'prompt-text judge-text', rows: '2', readonly: 'readonly', 'aria-label': 'Line for your pre-push hook', spellcheck: 'false' }, s.line) : null;
  const buttons = [h('button', { class: 'btn accent', type: 'button', onclick: () => gateCheck(r) }, 'Ready to publish?')];
  if (s.state === 'off') buttons.push(h('button', { class: 'btn', type: 'button', onclick: set(true) }, 'Turn on'));
  if (s.state === 'on') buttons.push(h('button', { class: 'btn', type: 'button', onclick: set(false) }, 'Turn off'));
  buttons.push(cancelBtn('Close'));
  dialog('Publish guard: ' + r.name, [
    h('p', null, 'Checks ' + r.name + ' with the Bridge\'s audit before every git push, from any tool (Claude Code, GitHub Desktop, a terminal), and stops the push while the audit says "fix first". Waiting to fix is better than publishing a fault.'),
    h('p', null, h('b', { class: said[0] }, said[1])),
    lineBox,
    h('p', { class: 'muted' }, 'Turning it on writes one file in this project, .git/hooks/pre-push (git never uploads it). It is the only file the Bridge writes in a project, and Turn off removes it again. A finding you set aside as not a fault no longer stops a push. To push anyway, knowing what it holds: git push --no-verify.'),
    err], buttons, 'wide');
}

async function gateCheck(r) {
  dialog('Checking ' + r.name + '…', [h('p', { class: 'muted' }, 'The same check a push gets: the project\'s files, its AI agent files and what publishing would give away (no live site).')], []);
  try {
    const d = await api('/api/gate/check', { id: r.id });
    showAudit(r, d.audit, d.ready ? 'Ready to publish: no Critical or High finding.' : 'Not ready to publish: fix the Critical and High findings first. With the publish guard on, a push is stopped until then.');
  } catch (e) { dialog('Check failed', [h('p', null, e.message)], [h('button', { class: 'btn accent', type: 'button', onclick: closeDialog }, 'Close')]); }
}
