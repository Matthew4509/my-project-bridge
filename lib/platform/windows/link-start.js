// Run by the my-project-bridge://start link (index.html's Load Bridge button), as
//   "<node.exe>" "<folder>\lib\platform\windows\link-start.js" "%1"
// The link's address arrives as an argument and is never read. This starts start-bridge.cmd with the fixed word
// "quiet": the Bridge starts without opening its window, and starting it again while it runs does nothing.
'use strict';
const path = require('path');
const { spawn } = require('child_process');

const folder = path.resolve(__dirname, '..', '..', '..');
const cmd = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
// The full path: cmd.exe does not always look in the current folder (NoDefaultCurrentDirectoryInExePath).
spawn(cmd, ['/d', '/c', path.join(folder, 'start-bridge.cmd'), 'quiet'], { cwd: folder, detached: true, stdio: 'ignore', windowsHide: true }).unref();
