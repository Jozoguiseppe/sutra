// Applies pending SQL migrations and the city seed to the database in DATABASE_URL (Neon / any Postgres).
// Usage: npm run db:setup   (reads .env.local, then .env, if present)
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
// Migrations (DDL) should use the direct connection when Neon provides one.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run `neon deploy` (writes .env.local) or fill in .env first.');
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.unsafe('create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await sql.unsafe('select name from _migrations')).map((r) => r.name));
  const dir = path.resolve('supabase', 'migrations');
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) { console.log('skip   ', name); continue; }
    await sql.begin(async (t) => {
      await t.unsafe(fs.readFileSync(path.join(dir, name), 'utf8'));
      await t.unsafe('insert into _migrations (name) values ($1)', [name]);
    });
    console.log('applied', name);
  }
  await sql.unsafe(fs.readFileSync(path.resolve('supabase', 'seed.sql'), 'utf8'));
  const [c] = await sql.unsafe('select (select count(*) from counties)::int as counties, (select count(*) from cities)::int as cities');
  console.log('seeded ', c);
} finally {
  await sql.end();
}
