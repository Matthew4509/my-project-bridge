// node server.js --status | --stop  (for index.html's command tools and scripts). Nothing here starts a Bridge.
// A running Bridge writes <data>/run.json (pid, port, key); --stop uses the key to ask it to Quit, so it stops its
// local copies as well. With --port=N, the run.json of whichever Bridge (real, test copy or demo) is on that port is
// used, so `--stop --port=8487` stops a test copy without also passing --dry-run.
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const cfg = require('./config');

function findRun() {
  const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const own = read(cfg.RUN_FILE);
  const portAsked = process.argv.some(a => /^--port=\d+$/.test(a));
  if (!portAsked || (own && own.port === cfg.PORT)) return own;
  for (const mode of ['real', 'dry', 'demo']) {
    const r = read(path.join(cfg.dataDirFor(mode), 'run.json'));
    if (r && r.port === cfg.PORT) return r;
  }
  return null;
}

function runCli() {
  const stop = process.argv.includes('--stop');
  const run = findRun();
  const port = run ? run.port : cfg.PORT;
  // --status asks for the Bridge's stats with the key from run.json: only THIS Bridge answers 200. Any other program
  // that answers on the port is named as such, not taken for the Bridge.
  const req = http.request({ host: '127.0.0.1', port, path: stop ? '/api/quit' : '/api/stats', method: stop ? 'POST' : 'GET',
    headers: { Host: '127.0.0.1:' + port, 'X-Bridge-Key': run ? run.key : '', 'Content-Type': 'application/json' }, timeout: 3000 }, res => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', c => { if (body.length < 100000) body += c; });
    res.on('end', () => {
      const json = (() => { try { return JSON.parse(body); } catch { return null; } })();
      if (!stop) {
        // 200 alone is not enough: the answer must be the Bridge's own stats (with its version).
        if (res.statusCode === 200 && json && typeof json.version === 'string') { console.log('The Bridge is running: http://127.0.0.1:' + port + '/'); process.exit(0); }
        if (res.statusCode === 403 && json && /older Bridge run/.test(json.error || '')) { console.log('A Bridge is running on port ' + port + ', but not the one this folder started (its key differs). Open http://127.0.0.1:' + port + '/ to see it.'); process.exit(0); }
        console.log('The Bridge is not running: port ' + port + ' is used by another program.');
        process.exit(1);
      }
      if (res.statusCode === 200 && json && json.ok === false && json.error) { console.log('The Bridge did not stop: ' + json.error); process.exit(1); }
      if (res.statusCode === 200) { console.log('The Bridge is stopping (and every local copy it started).'); process.exit(0); }
      console.log('The Bridge is running but did not accept the stop (it may have been started from another folder). Use About > Quit in its window.');
      process.exit(1);
    });
  });
  req.on('error', () => { console.log('The Bridge is not running.' + (stop ? ' Nothing to stop.' : ' Start it with start-bridge.cmd.')); process.exit(stop ? 0 : 1); });
  req.on('timeout', () => req.destroy());
  req.end(stop ? '{}' : undefined);
}

const wanted = () => process.argv.includes('--status') || process.argv.includes('--stop');

module.exports = { runCli, wanted };
