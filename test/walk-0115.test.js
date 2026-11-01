// Faults a read-only walk reproduced, each with the honest shape beside it: keys in files that look like programs, a
// run of slashes against the home folder, key shapes of newer services, passwords and signing secrets in code, and the
// money routes and webhooks the API rules read.
// Run: node test/walk-0115.test.js   (no packages; git on PATH).
// Every key is made up and put together at run time, so no line here looks like the real thing.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { runAudit } = require('../lib/audit');
const { makeMatcher } = require('../lib/disclosure');
const { makeZip } = require('./museum/kit');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-walk-'));
const j = (...parts) => parts.join('');
const MIX = 'q7Xv2Lm9Rt4Kp8Ws3Hn6Jd1Gb5Cz0Fy';
const rnd = n => MIX.repeat(Math.ceil(n / MIX.length)).slice(0, n);
let failures = 0, n = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + ': ' + e.message); } };
const audit = async files => {
  const dir = path.join(tmp, 'p' + (++n));
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  return { dir, a: await runAudit(dir, null, { disclosure: { details: [], others: [], own: [] } }) };
};
const list = a => JSON.stringify(a.findings.filter(f => !/^DISC-/.test(f.rule)).map(f => f.sev + ' ' + f.rule + ' ' + f.where));
const fires = (name, rule, sev, files) => check(name, async () => {
  const { a } = await audit(files);
  assert(a.findings.some(f => f.rule === rule && f.sev === sev), 'wanted ' + sev + ' ' + rule + ', got ' + list(a));
});
const quiet = (name, rule, files) => check(name, async () => {
  const { a } = await audit(files);
  assert(!a.findings.some(f => new RegExp(rule).test(f.rule)), 'wanted no ' + rule + ', got ' + list(a));
});

const LIVE = j('sk_', 'live_') + rnd(24);
const HUB = j('gh', 'p_') + rnd(36);

async function main() {
  // ---- keys in files that look like programs ----
  const nul = String.fromCharCode(0);
  await fires('a key before a NUL byte in a settings file', 'SEC-003', 'Critical', { 'a.env': 'K=' + LIVE + '\n' + nul + 'tail\n' });
  await fires('a key after a leading NUL in a text file', 'SEC-003', 'Critical', { 'a.txt': nul + '\nK=' + HUB + '\n' });
  await fires('a key beside a NUL in a code file', 'SEC-003', 'Critical', { 'a.js': '// ' + nul + '\nconst k = "' + LIVE + '";\n' });
  await fires('a key in a data file', 'SEC-003', 'Critical', { 'a.dat': Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(' ' + HUB + ' '), Buffer.from([0])]) });
  await fires('a key in a pickle', 'SEC-003', 'Critical', { 'a.pkl': Buffer.concat([Buffer.from([0x80, 4, 0]), Buffer.from(LIVE), Buffer.from([0x94])]) });
  await fires('a key in a .bin file', 'SEC-003', 'Critical', { 'a.bin': Buffer.concat([Buffer.from([0]), Buffer.from(' ' + LIVE + ' ')]) });
  await fires('a key inside a .jar', 'SEC-003', 'Critical', { 'lib/a.jar': makeZip([{ name: 'conf/app.properties', data: 'k=' + LIVE + '\n' }]) });
  await quiet('a binary with no key says nothing about keys', '^SEC-', { 'a.dat': Buffer.from([0, 1, 2, 3, 255, 254, 0, 65, 66, 67]) });
  await check('a key removed from a binary-looking file is still found in the history', async () => {
    const dir = path.join(tmp, 'hist');
    fs.mkdirSync(dir);
    const git = (...a) => execFileSync('git', ['-c', 'user.name=x', '-c', 'user.email=x@x.test', '-C', dir, ...a], { stdio: 'pipe' });
    git('init', '-q');
    fs.writeFileSync(path.join(dir, '.gitattributes'), '* -diff\n');
    fs.writeFileSync(path.join(dir, 'a.env'), 'K=' + LIVE + '\n' + nul + 'tail\n');
    git('add', '.'); git('commit', '-qm', 'one');
    fs.writeFileSync(path.join(dir, 'a.env'), 'K=\n');
    git('add', '.'); git('commit', '-qm', 'two');
    const a = await runAudit(dir, null, { disclosure: { details: [], others: [], own: [] } });
    assert(a.findings.some(f => f.rule === 'SEC-012'), 'wanted SEC-012, got ' + list(a));
  });

  // ---- a run of slashes against the home folder ----
  await check('a long run of backslashes or slashes against the home folder is quick', () => {
    const scan = makeMatcher({ details: [{ label: 'your home folder', value: ['C:', 'Users', 'Wren'].join('\\') }, { label: 'your home folder', value: ['', 'c', 'Users', 'Wren'].join('/') }], others: [], own: [] });
    for (const run of ['\\'.repeat(16000), '//'.repeat(8000)]) {
      const t0 = Date.now();
      assert.strictEqual(scan(run).length, 0);
      assert(Date.now() - t0 < 1500, (Date.now() - t0) + ' ms');
    }
    assert.strictEqual(scan('see /' + ['', 'c', 'Users', 'Wren', 'notes'].join('/') + '\n').length, 1, 'a path after two slashes is still found');
    assert.strictEqual(scan('see \\' + ['', 'c', 'Users', 'Wren', 'notes'].join('\\') + '\n').length, 1, 'a path after two backslashes is still found');
  });

  // ---- key shapes of newer services ----
  const shapes = {
    'a project key': [j('sk-', 'proj-') + rnd(18) + '_' + rnd(30) + '-' + rnd(40), 'SEC-002', 'Critical'],
    'a service account key': [j('sk-', 'svcacct-') + rnd(20) + '-' + rnd(40), 'SEC-002', 'Critical'],
    'an OpenRouter key': [j('sk-', 'or-v1-') + 'a1b2c3d4e5f60718'.repeat(4), 'SEC-002', 'Critical'],
    'a Groq key': [j('gs', 'k_') + rnd(52), 'SEC-002', 'Critical'],
    'a Hugging Face key': [j('h', 'f_') + rnd(34), 'SEC-002', 'Critical'],
    'a Replicate key': [j('r', '8_') + rnd(37), 'SEC-002', 'Critical'],
    'an xAI key': [j('xa', 'i-') + rnd(70), 'SEC-002', 'Critical'],
    'a Perplexity key': [j('ppl', 'x-') + rnd(48), 'SEC-002', 'Critical'],
    'a Neon password': [j('np', 'g_') + rnd(12), 'SEC-003', 'Critical'],
    'a Resend key': [j('r', 'e_') + rnd(8) + '_' + rnd(24), 'SEC-005', 'High'],
    'a Vercel storage key': [j('vercel_', 'blob_rw_') + rnd(16) + '_' + rnd(30), 'SEC-005', 'High'],
  };
  for (const [what, [key, rule, sev]] of Object.entries(shapes)) {
    await fires(what + ' in code', rule, sev, { 'lib/client.ts': 'const K = "' + key + '";\n' });
    await fires(what + ' in a settings file', rule, sev, { '.env': 'X=' + key + '\n' });
  }
  await quiet('a long spinner class is no key', '^SEC-00[23]$', { 'a.css': '.sk-circle-fade-dot-animation-delay-one-two-three-four { color: red; }\n' });
  await quiet('a placeholder project key is no key', '^SEC-002$', { 'a.js': 'const K = "' + j('sk-', 'proj-') + 'your-key-goes-here-your-key-goes-here-your";\n' });
  await quiet('a word that starts like a key is no key', '^SEC-00[235]$', { 'a.js': 'const a = "hf_model_name"; const b = "xai-grok-model-name-long"; const c = "re_try_after_the_first_attempt_ends"; const d = "npg_status";\n' });

  // ---- a database password in code ----
  const PW = 'Vx7' + rnd(12);
  await fires('a Mongo address with its password', 'SEC-016', 'High', { 'server.js': "mongoose.connect('mongodb+srv://admin:" + PW + "@cluster0.x.mongodb.net/app');\n" });
  await fires('a Postgres address with its password', 'SEC-016', 'High', { 'db.js': "const p = new Pool({ connectionString: 'postgresql://postgres:" + PW + "@db.x.supabase.co:5432/postgres' });\n" });
  await quiet('an address on this PC is left alone', '^SEC-016$', { 'db.js': "const a = 'postgres://postgres:" + PW + "@localhost:5432/app';\nconst b = 'mongodb://root:" + PW + "@127.0.0.1/app';\n" });
  await quiet('an address built from settings is left alone', '^SEC-016$', { 'db.js': 'const a = `postgres://${USER}:${PASS}@db.x.supabase.co/app`;\nconst b = process.env.DATABASE_URL;\n' });
  await quiet('an example address is left alone', '^SEC-016$', { 'db.js': "const a = 'postgres://user:password@db.example.com/app';\nconst b = 'mongodb+srv://USER:YOUR_PASSWORD@cluster0.mongodb.net';\nconst c = 'mysql://root:changeme@db.host.io/app';\n" });
  await fires('a password in a pool setting', 'SEC-004', 'Medium', { 'db.js': "const p = mysql.createPool({ host: 'db.x.io', user: 'root', password: '" + PW + "' });\n" });

  // ---- a signing secret in code ----
  await fires('a signing secret held in a constant', 'SEC-017', 'High', { 'auth.js': "const JWT_SECRET = '" + rnd(40) + "';\nconst t = jwt.sign(x, JWT_SECRET);\n" });
  await fires('a signing secret given in the call', 'SEC-017', 'High', { 'auth.js': "const t = jwt.verify(x, 'secret');\n" });
  await fires('a weak fallback for a signing secret', 'SEC-017', 'High', { 'auth.js': "const s = process.env.JWT_SECRET || 'secret';\n" });
  await quiet('a signing secret read from settings', '^SEC-017$', { 'auth.js': "const JWT_SECRET = process.env.JWT_SECRET;\nconst t = jwt.sign(x, JWT_SECRET, { expiresIn: '1h' });\nconst u = jwt.verify(x, getKey());\nconst v = jwt.sign(x, key, { algorithm: 'RS256' });\n" });
  await quiet('a test may hold one', '^SEC-017$', { 'test/auth.test.js': "const t = jwt.sign(x, 'secret');\n" });

  // ---- the amount to charge ----
  await fires('Nuxt: the amount from what was posted', 'PAY-006', 'High', { 'server/api/pay.post.ts': "export default defineEventHandler(async event => {\n  const { amount } = await readBody(event);\n  return stripe.paymentIntents.create({ amount, currency: 'eur' });\n});\n" });
  await fires('Nuxt: the amount through a name', 'PAY-006', 'High', { 'server/api/pay.post.ts': "export default defineEventHandler(async event => {\n  const body = await readBody(event);\n  return stripe.paymentIntents.create({ amount: body.amount, currency: 'eur' });\n});\n" });
  await fires('Hono: the amount from a checked body', 'PAY-006', 'High', { 'src/pay.ts': "app.post('/pay', zValidator('json', s), async c => {\n  const { amount } = c.req.valid('json');\n  return c.json(await stripe.paymentIntents.create({ amount, currency: 'eur' }));\n});\n" });
  await quiet('Nuxt: the amount from the server', 'PAY-006', { 'server/api/pay.post.ts': "export default defineEventHandler(async event => {\n  const { id } = await readBody(event);\n  const item = await getItem(id);\n  return stripe.paymentIntents.create({ amount: item.price, currency: 'eur' });\n});\n" });

  // ---- open money routes and other databases ----
  await fires('an open refund route', 'API-001', 'High', { 'server.js': "const app = require('express')();\napp.post('/api/refund', async (req, res) => {\n  res.json(await stripe.refunds.create({ payment_intent: req.body.paymentIntent }));\n});\n" });
  await fires('an open transfer route', 'API-001', 'High', { 'server.js': "const app = require('express')();\napp.post('/api/send', async (req, res) => {\n  res.json(await stripe.transfers.create({ amount: 5, destination: req.body.to }));\n});\n" });
  await fires('an open billing portal route', 'API-001', 'High', { 'server.js': "const app = require('express')();\napp.post('/api/portal', async (req, res) => {\n  res.json(await stripe.billingPortal.sessions.create({ customer: req.body.customerId }));\n});\n" });
  await fires('an open update through knex', 'API-001', 'High', { 'server.js': "const app = require('express')();\napp.post('/api/staff/:id', async (req, res) => {\n  await knex('employees').where({ id: req.params.id }).update(req.body);\n  res.json({ ok: true });\n});\n" });
  await quiet('a refund route with a check', 'API-001', { 'server.js': "const app = require('express')();\napp.post('/api/refund', requireAdmin, async (req, res) => {\n  res.json(await stripe.refunds.create({ payment_intent: req.body.paymentIntent }));\n});\n" });
  await quiet('a checkout route is a public act', 'API-001', { 'server.js': "const app = require('express')();\napp.post('/api/checkout', async (req, res) => {\n  res.json(await stripe.checkout.sessions.create({ mode: 'payment', line_items: ITEMS }));\n});\n" });

  // ---- webhooks: a check held somewhere else, and none at all ----
  const WEBHOOK = "app.post('/stripe/webhook', raw, stripeSig, (req, res) => {\n  if (req.body.type === 'checkout.session.completed') grant(req.body);\n  res.send('ok');\n});\n";
  await quiet('a signature check in imported middleware', 'PAY-007', { 'server.js': "const stripeSig = require('./middleware/stripeSig');\n" + WEBHOOK, 'middleware/stripeSig.js': "module.exports = (req, res, next) => { req.body = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], S); next(); };\n" });
  await fires('imported middleware that checks nothing', 'PAY-007', 'High', { 'server.js': "const stripeSig = require('./middleware/stripeSig');\n" + WEBHOOK, 'middleware/stripeSig.js': 'module.exports = (req, res, next) => next();\n' });
  await fires('a middleware name alone proves nothing', 'PAY-007', 'High', { 'server.js': WEBHOOK });
  await quiet('asking Stripe whether the event is real', 'PAY-007', { 'server.js': "app.post('/stripe/webhook', async (req, res) => {\n  const pi = await stripe.paymentIntents.retrieve(req.body.data.object.id);\n  if (pi.status === 'succeeded') grant(pi);\n  res.send('ok');\n});\n" });
  await quiet('a shared secret compared', 'PAY-007', { 'server.js': "app.post('/stripe/webhook', (req, res) => {\n  if (req.headers['x-webhook-secret'] !== process.env.HOOK_SECRET) return res.sendStatus(401);\n  grant(req.body);\n  res.send('ok');\n});\n" });
  await fires('a shared secret only looked at', 'PAY-007', 'High', { 'server.js': "app.post('/stripe/webhook', (req, res) => {\n  console.log(req.headers['x-webhook-secret']);\n  grant(req.body);\n  res.send('ok');\n});\n" });

  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10 });
  console.log(failures ? failures + ' FAILED' : 'all passed');
  process.exit(failures ? 1 : 0);
}
main();
