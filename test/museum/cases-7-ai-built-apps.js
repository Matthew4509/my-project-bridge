// Museum: the common faults of apps built quickly, often with an AI helper: admin keys in the browser, secrets behind a
// public prefix, data routes and tables open to anyone, prices taken from the visitor, unsigned payment events, leftover
// debug routes, logged tokens, CORS open with credentials. Each good copy is the honest way to write the same thing, and
// the quiet cases are honest shapes that must never be flagged.
// Key-shaped text is put together when a copy is written, so this file holds no line that looks like a real key.
// Every name and address is made up.
'use strict';

const j = (...parts) => parts.join('');
const part = o => Buffer.from(JSON.stringify(o)).toString('base64url');
// A signed token of the shape Supabase hands out, with a made-up project and signature.
const supabaseToken = role => [part({ alg: 'HS256', typ: 'JWT' }), part({ iss: 'supabase', ref: 'madeupproject', role, iat: 1700000000 }), 'madeUpSignatureNotARealOne_0123456789'].join('.');
const SK_TEST = () => j('sk_', 'test_', 'Q3x9Lm2Vb7Tn4Rk8Wd5Hj6Zp');
const PK_TEST = () => j('pk_', 'test_', 'Q3x9Lm2Vb7Tn4Rk8Wd5Hj6Zp');
const R = (id, rule, title, at, bad, good) => ({ id, bucket: 'R', phase: 'H1', faults: 1, examples: ['ai-built'], rule: '^' + rule + '$', title, at, bad, good });
const X = (id, rule, title, at, bad, good) => ({ id, bucket: 'X', phase: 'H1', faults: 1, examples: ['ai-built'], rule: '^' + rule + '$', title, at, bad, good });
const Q = (id, rule, title, files) => ({ id, quiet: true, phase: 'H1', examples: ['ai-built'], rule, title, files });

const ORDERS_ROUTE = `import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(req: Request) {
  const { id } = await req.json();
  await prisma.order.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
`;
const AUTHED_ORDERS_ROUTE = `import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';

export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  const { id } = await req.json();
  await prisma.order.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
`;

module.exports = [
  // ---- service-role and admin credentials in front-end code ----
  R('ai-service-role-in-component', 'KEY-001', 'A client component makes a Supabase client with the service-role key',
    'AdminPanel.tsx',
    { 'components/AdminPanel.tsx': `'use client';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
export function AdminPanel() { return null; }
` },
    { 'components/AdminPanel.tsx': `'use client';
import { createBrowserClient } from '@supabase/ssr';

const db = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export function AdminPanel() { return null; }
` }),
  R('ai-service-role-token-literal', 'KEY-002', 'A service-role token is written into a browser file; the anon token in its place is public by design',
    'src/lib/supabase.js',
    { 'src/lib/supabase.js': () => `import { createClient } from '@supabase/supabase-js';
export const db = createClient('https://madeup.supabase.test', '${supabaseToken('service_role')}');
` },
    { 'src/lib/supabase.js': () => `import { createClient } from '@supabase/supabase-js';
export const db = createClient('https://madeup.supabase.test', '${supabaseToken('anon')}');
` }),
  R('ai-firebase-admin-in-browser', 'KEY-003', 'Browser code imports firebase-admin',
    'src/components/Stats.jsx',
    { 'src/components/Stats.jsx': `import admin from 'firebase-admin';
export function Stats() { return admin.apps.length; }
` },
    { 'src/components/Stats.jsx': `import { getApp } from 'firebase/app';
export function Stats() { return getApp().name; }
` }),
  R('ai-service-account-import', 'KEY-004', 'A service account file is imported by browser code, so its private key ships to every visitor',
    'src/firebase.js',
    { 'src/firebase.js': `import key from './serviceAccountKey.json';
const VITE_NOTE = import.meta.env.VITE_APP_NAME;
export const project = key.project_id + VITE_NOTE;
` },
    { 'src/firebase.js': `import config from './firebase-web-config.json';
const VITE_NOTE = import.meta.env.VITE_APP_NAME;
export const project = config.projectId + VITE_NOTE;
` }),
  R('ai-service-account-served', 'KEY-005', 'A service account key file sits in the public folder',
    'public/firebase-key.json',
    { 'public/firebase-key.json': () => `{
  "type": "service_account",
  "project_id": "madeup-project",
  "private_key": "${'made-up-text-not-a-key-'.repeat(4)}",
  "client_email": "robot@madeup-project.test"
}
` },
    { 'public/firebase-key.json': `{
  "projectId": "madeup-project",
  "appId": "1:2:web:3",
  "authDomain": "madeup-project.test"
}
` }),
  Q('quiet-ai-service-role-on-server', '^(KEY|ENV)-', 'The service-role key used only in server code, and an anon key in the browser',
    { 'lib/server/supabase-admin.ts': `import { createClient } from '@supabase/supabase-js';
export const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
`, 'app/api/stats/route.ts': `import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
export async function GET() { return Response.json(await admin.from('stats').select('*')); }
`, 'supabase/functions/daily/index.ts': `const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(url, key);
`, 'server/db.js': `const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
module.exports = db;
`, 'components/Home.tsx': () => `'use client';
const anon = '${supabaseToken('anon')}';
export function Home() { return anon.length; }
`, '.env.local': `SUPABASE_SERVICE_ROLE_KEY=made-up-server-side-value
NEXT_PUBLIC_SUPABASE_ANON_KEY=made-up-public-value
` }),

  // ---- secrets behind a public prefix ----
  R('ai-public-prefix-secret-env', 'ENV-001', 'A .env file names a secret with a public prefix', '.env.local',
    { '.env.local': `NEXT_PUBLIC_SITE_URL=https://shop.test
NEXT_PUBLIC_STRIPE_SECRET_KEY=made-up-value-not-a-key
` },
    { '.env.local': `NEXT_PUBLIC_SITE_URL=https://shop.test
STRIPE_SECRET_KEY=made-up-value-not-a-key
` }),
  R('ai-public-prefix-key-value', 'ENV-001', 'A .env variable with a neutral name holds a Stripe secret key', '.env',
    { '.env': () => `VITE_PAY_KEY=${SK_TEST()}
` },
    { '.env': () => `VITE_PAY_KEY=${PK_TEST()}
` }),
  R('ai-public-prefix-in-code', 'ENV-002', 'Browser code reads an OpenAI key through VITE_', 'src/api/chat.js',
    { 'src/api/chat.js': `const key = import.meta.env.VITE_OPENAI_API_KEY;
export const ask = q => fetch('https://llm.test/v1', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: q });
` },
    { 'src/api/chat.js': `const base = import.meta.env.VITE_API_URL;
export const ask = q => fetch(base + '/chat', { method: 'POST', body: q });
` }),
  R('ai-vite-define-key', 'ENV-003', 'vite.config copies an API key into the browser code', 'vite.config.ts',
    { 'vite.config.ts': `export default defineConfig(() => ({
  define: {
    'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
  },
}));
` },
    { 'vite.config.ts': `export default defineConfig(() => ({
  define: {
    'process.env.APP_VERSION': JSON.stringify(version),
  },
}));
` }),
  Q('quiet-ai-public-values', '^(KEY|ENV)-', 'Values that are public by design, behind a public prefix',
    { '.env': () => `NEXT_PUBLIC_SITE_URL=https://shop.test
NEXT_PUBLIC_SUPABASE_URL=https://madeup.supabase.test
NEXT_PUBLIC_SUPABASE_ANON_KEY=made-up-public-value
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${PK_TEST()}
VITE_API_URL=https://api.shop.test
VITE_PRIVATE_BETA=true
NEXT_PUBLIC_PASSWORD_MIN_LENGTH=8
NEXT_PUBLIC_SECRET_SANTA_URL=https://santa.test
EXPO_PUBLIC_MAPBOX_TOKEN=made-up-public-value
` , 'src/config.js': `export const api = import.meta.env.VITE_API_URL;
export const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const site = process.env.NEXT_PUBLIC_SITE_URL;
`, '.env.example': `NEXT_PUBLIC_OPENAI_API_KEY=your_key_here
` }),

  // ---- data routes with no session check ----
  X('ai-route-open-delete', 'API-001', 'A Next.js route deletes an order with no session check', 'app/api/orders/route.ts',
    { 'app/api/orders/route.ts': ORDERS_ROUTE }, { 'app/api/orders/route.ts': AUTHED_ORDERS_ROUTE }),
  X('ai-route-open-users-list', 'API-001', 'A pages/api route returns every user; the good copy checks through a helper it imports', 'pages/api/users.ts',
    { 'pages/api/users.ts': `import { prisma } from '../../lib/db';
export default async function handler(req, res) {
  const users = await prisma.user.findMany();
  res.json(users);
}
` },
    { 'pages/api/users.ts': `import { prisma } from '../../lib/db';
import { requireUser } from '../../lib/guards';
export default async function handler(req, res) {
  const me = await requireUser(req, res);
  const users = await prisma.user.findMany({ where: { id: me.id } });
  res.json(users);
}
` }),
  X('ai-route-open-express', 'API-001', 'One Express route is left out of the check the others have', 'server/app.js',
    { 'server/app.js': `const express = require('express');
const app = express();
app.get('/api/me', requireUser, async (req, res) => {
  res.json(await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]));
});
app.get('/api/customers', async (req, res) => {
  const rows = await pool.query('SELECT * FROM customers');
  res.json(rows);
});
` },
    { 'server/app.js': `const express = require('express');
const app = express();
app.get('/api/me', requireUser, async (req, res) => {
  res.json(await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]));
});
app.get('/api/customers', requireUser, async (req, res) => {
  const rows = await pool.query('SELECT * FROM customers');
  res.json(rows);
});
` }),
  X('ai-route-open-read', 'API-002', 'A route returns rows of an unknown table with no session check: Medium, it may be public', 'app/api/widgets/route.ts',
    { 'app/api/widgets/route.ts': `import { prisma } from '@/lib/db';
export async function GET() {
  return Response.json(await prisma.widget.findMany());
}
` },
    { 'app/api/widgets/route.ts': `import { prisma } from '@/lib/db';
import { auth } from '@/auth';
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: 'Please sign in first.' }, { status: 401 });
  return Response.json(await prisma.widget.findMany({ where: { ownerId: session.user.id } }));
}
` }),
  X('ai-route-middleware-skips-api', 'API-001', 'The middleware that checks sessions has a matcher that leaves out /api', 'app/api/orders/route.ts',
    { 'app/api/orders/route.ts': ORDERS_ROUTE, 'middleware.ts': `import { withAuth } from 'next-auth/middleware';
export default withAuth({});
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
` },
    { 'app/api/orders/route.ts': ORDERS_ROUTE, 'middleware.ts': `import { withAuth } from 'next-auth/middleware';
export default withAuth({});
export const config = { matcher: ['/api/:path*', '/dashboard/:path*'] };
` }),
  X('ai-route-middleware-other-paths', 'API-001', 'The matcher only names other pages, so this route is not covered', 'app/api/orders/route.ts',
    { 'app/api/orders/route.ts': ORDERS_ROUTE, 'middleware.ts': `import { auth } from './auth';
export default auth;
export const config = { matcher: ['/dashboard/:path*'] };
` },
    { 'app/api/orders/route.ts': ORDERS_ROUTE, 'middleware.ts': `import { auth } from './auth';
export default auth;
export const config = { matcher: ['/((?!_next/static|favicon.ico).*)'] };
` }),
  Q('quiet-ai-public-routes', '^(API|DEBUG)-', 'Public read-only routes and a check made through a wrapper',
    { 'app/api/health/route.ts': `import { prisma } from '@/lib/db';
export async function GET() { await prisma.user.count(); return Response.json({ ok: true }); }
`, 'app/api/blog/route.ts': `import { prisma } from '@/lib/db';
export async function GET() { return Response.json(await prisma.post.findMany({ where: { published: true } })); }
`, 'app/api/contact/route.ts': `import { prisma } from '@/lib/db';
export async function POST(req) { await prisma.enquiry.create({ data: await req.json() }); return Response.json({ ok: true }); }
`, 'app/api/notes/route.ts': `import { withAuth } from '@/lib/with-auth';
import { prisma } from '@/lib/db';
export const GET = withAuth(async user => Response.json(await prisma.note.findMany({ where: { userId: user.id } })));
`, 'app/api/mine/route.ts': `import { createClient } from '@/lib/supabase/server';
export async function GET() {
  const supabase = await createClient();
  return Response.json(await supabase.from('notes').select('*'));
}
`, 'app/api/test/route.ts': `export async function GET() { return Response.json({ hello: 'world' }); }
` }),

  // ---- Supabase tables without row-level security ----
  X('ai-table-no-rls', 'RLS-001', 'A Supabase migration creates a table and never enables row-level security', 'supabase/migrations/001_init.sql',
    { 'supabase/migrations/001_init.sql': `create table public.notes (id uuid primary key, user_id uuid, body text);
` },
    { 'supabase/migrations/001_init.sql': `create table public.notes (id uuid primary key, user_id uuid, body text);
`, 'supabase/migrations/002_lock.sql': `alter table public.notes enable row level security;
create policy "own notes" on public.notes for all using (auth.uid() = user_id);
` }),
  X('ai-table-no-rls-one-of-two', 'RLS-001', 'Row-level security on one table does not cover the other', 'supabase/migrations/001_init.sql',
    { 'supabase/migrations/001_init.sql': `-- enable row level security on everything later
create table notes (id uuid primary key);
create table payments (id uuid primary key);
alter table notes enable row level security;
` },
    { 'supabase/migrations/001_init.sql': `create table notes (id uuid primary key);
create table payments (id uuid primary key);
alter table notes enable row level security;
alter table payments enable row level security;
` }),

  // ---- payment amounts from the request, webhooks with no signature ----
  R('ai-pay-amount-from-body', 'PAY-006', 'A payment intent takes its amount from the request', 'api/pay.js',
    { 'api/pay.js': `export default async function pay(req, res) {
  const intent = await stripe.paymentIntents.create({
    amount: req.body.amount,
    currency: 'usd',
  });
  res.json({ secret: intent.client_secret });
}
` },
    { 'api/pay.js': `export default async function pay(req, res) {
  const item = await findItem(req.body.itemId);
  const intent = await stripe.paymentIntents.create({
    amount: item.priceCents,
    currency: 'usd',
  });
  res.json({ secret: intent.client_secret });
}
` }),
  R('ai-pay-unit-amount-from-json', 'PAY-006', 'A checkout session takes unit_amount from the posted JSON; the good copy looks it up by id', 'app/api/checkout/route.ts',
    { 'app/api/checkout/route.ts': `export async function POST(req) {
  const body = await req.json();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ quantity: 1, price_data: { currency: 'usd', product_data: { name: body.name }, unit_amount: body.price } }],
  });
  return Response.json({ url: session.url });
}
` },
    { 'app/api/checkout/route.ts': `export async function POST(req) {
  const { itemId } = await req.json();
  const item = await findItem(itemId);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ quantity: 1, price_data: { currency: 'usd', product_data: { name: item.name }, unit_amount: item.price } }],
  });
  return Response.json({ url: session.url });
}
` }),
  R('ai-pay-cart-prices-from-client', 'PAY-006', 'The cart comes from the browser with its prices, and those prices are charged', 'app/api/cart/route.ts',
    { 'app/api/cart/route.ts': `export async function POST(req) {
  const { items } = await req.json();
  const session = await stripe.checkout.sessions.create({
    line_items: items.map(item => ({
      quantity: item.qty,
      price_data: { currency: 'usd', unit_amount: item.price },
    })),
  });
  return Response.json({ url: session.url });
}
` },
    { 'app/api/cart/route.ts': `export async function POST(req) {
  const { items } = await req.json();
  const session = await stripe.checkout.sessions.create({
    line_items: items.map(item => ({
      quantity: item.qty,
      price_data: { currency: 'usd', unit_amount: PRICE_LIST[item.id] },
    })),
  });
  return Response.json({ url: session.url });
}
` }),
  X('ai-webhook-no-signature', 'PAY-007', 'A Stripe webhook acts on the posted event with no signature check; the good copy checks in a helper', 'app/api/stripe/webhook/route.ts',
    { 'app/api/stripe/webhook/route.ts': `export async function POST(req) {
  const event = await req.json();
  if (event.type === 'checkout.session.completed') await fulfil(event.data.object);
  return Response.json({ received: true });
}
` },
    { 'app/api/stripe/webhook/route.ts': `import { readSignedEvent } from '@/lib/pay-events';
export async function POST(req) {
  const event = await readSignedEvent(req);
  if (event.type === 'checkout.session.completed') await fulfil(event.data.object);
  return Response.json({ received: true });
}
`, 'lib/pay-events.ts': `export async function readSignedEvent(req) {
  const raw = await req.text();
  return stripe.webhooks.constructEvent(raw, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
}
` }),
  X('ai-webhook-no-signature-lemon', 'PAY-007', 'A Lemon Squeezy webhook in an Express server, with no signature check', 'server/index.js',
    { 'server/index.js': `const express = require('express');
const app = express();
app.post('/webhooks/lemonsqueezy', express.json(), async (req, res) => {
  if (req.body.meta.event_name === 'order_created') await grant(req.body.data);
  res.sendStatus(200);
});
` },
    { 'server/index.js': `const express = require('express');
const crypto = require('crypto');
const app = express();
app.post('/webhooks/lemonsqueezy', express.raw({ type: '*/*' }), async (req, res) => {
  const mine = crypto.createHmac('sha256', process.env.LEMON_SECRET).update(req.body).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(req.get('x-signature') || ''))) return res.sendStatus(400);
  await grant(JSON.parse(req.body).data);
  res.sendStatus(200);
});
` }),

  // ---- leftovers: debug routes, logged tokens, open CORS ----
  X('ai-debug-seed-route', 'DEBUG-002', 'A seed route can be called by anyone in production', 'app/api/seed/route.ts',
    { 'app/api/seed/route.ts': `import { prisma } from '@/lib/db';
export async function GET() {
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { email: 'admin@shop.test', role: 'admin' } });
  return Response.json({ seeded: true });
}
` },
    { 'app/api/seed/route.ts': `import { prisma } from '@/lib/db';
export async function GET() {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { email: 'admin@shop.test', role: 'admin' } });
  return Response.json({ seeded: true });
}
` }),
  X('ai-debug-env-dump', 'DEBUG-002', 'A debug route answers with the server\'s settings', 'pages/api/debug.js',
    { 'pages/api/debug.js': `export default function handler(req, res) {
  res.json({ env: process.env });
}
` },
    { 'pages/api/debug.js': `import { getServerSession } from 'next-auth';
export default async function handler(req, res) {
  const session = await getServerSession(req, res);
  if (!session) return res.status(401).end();
  res.json({ env: process.env });
}
` }),
  X('ai-admin-reset-route', 'DEBUG-002', 'An Express /admin/reset route with no check', 'server/admin.js',
    { 'server/admin.js': `const express = require('express');
const app = express();
app.post('/admin/reset', async (req, res) => {
  await resetAll();
  res.json({ ok: true });
});
` },
    { 'server/admin.js': `const express = require('express');
const app = express();
app.post('/admin/reset', requireAdmin, async (req, res) => {
  await resetAll();
  res.json({ ok: true });
});
` }),
  R('ai-token-logged', 'LOG-001', 'A sign-in token is written to the log', 'lib/refresh.js',
    { 'lib/refresh.js': `export async function refresh(user) {
  const accessToken = await renew(user);
  console.log('new token', accessToken);
  return accessToken;
}
` },
    { 'lib/refresh.js': `export async function refresh(user) {
  const accessToken = await renew(user);
  console.log('token refreshed');
  return accessToken;
}
` }),
  R('ai-password-logged', 'LOG-001', 'A typed password is written to the log', 'routes/login.js',
    { 'routes/login.js': 'export function login(req, res) {\n  const { email, password } = req.body;\n  console.log(`login ${email} ${password}`);\n  res.end();\n}\n' },
    { 'routes/login.js': 'export function login(req, res) {\n  const { email, password } = req.body;\n  console.log(`login ${email} ${password.length}`);\n  res.end();\n}\n' }),
  R('ai-cors-open-credentials', 'CORS-003', 'cors() answers every site with credentials on', 'server/main.js',
    { 'server/main.js': `const cors = require('cors');
app.use(cors({
  origin: true,
  credentials: true,
}));
` },
    { 'server/main.js': `const cors = require('cors');
app.use(cors({
  origin: 'https://app.test',
  credentials: true,
}));
` }),
  R('ai-cors-star-fastapi', 'CORS-003', 'FastAPI CORS middleware with every origin and credentials on', 'main.py',
    { 'main.py': `from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
)
` },
    { 'main.py': `from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.test"],
    allow_credentials=True,
)
` }),
];
