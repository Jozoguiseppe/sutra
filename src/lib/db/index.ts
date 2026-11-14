import fs from 'node:fs';
import path from 'node:path';
import { seedCities } from './seed';

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

// Postgres type OIDs
const OID = { INT8: 20, JSON: 114, DATE: 1082, NUMERIC: 1700, JSONB: 3802 };

const jsonParse = (s: string) => JSON.parse(s);
const jsonSerialize = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
const identity = (s: string) => s;
const toNumber = (s: string) => Number(s);

/** Plain JS objects (not Date/Array/Buffer) become JSON strings so they work as jsonb params. */
function prepParams(params: unknown[] = []): unknown[] {
  return params.map((p) => {
    if (p && typeof p === 'object' && Object.getPrototypeOf(p) === Object.prototype) return JSON.stringify(p);
    return p === undefined ? null : p;
  });
}

function projectRoot(): string {
  return process.cwd();
}

function migrationFiles(): { name: string; sql: string }[] {
  const dir = path.resolve(projectRoot(), 'supabase', 'migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

// ---------- PGlite ----------

async function makePglite(dataDir?: string): Promise<Db> {
  const { PGlite, types } = await import('@electric-sql/pglite');
  const pg = new PGlite({
    dataDir,
    parsers: {
      [types.DATE]: identity,
      [types.NUMERIC]: toNumber,
      [OID.INT8]: toNumber,
      [OID.JSON]: jsonParse,
      [OID.JSONB]: jsonParse,
    },
    serializers: {
      [OID.JSON]: jsonSerialize,
      [OID.JSONB]: jsonSerialize,
    },
  });
  await pg.waitReady;

  type Runner = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
  const wrap = (r: Runner, inTx: boolean): Db => ({
    async query<T>(sql: string, params?: unknown[]) {
      const res = await r.query(sql, prepParams(params));
      return res.rows as T[];
    },
    async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      // Nested tx inside an open transaction just joins it.
      if (inTx) return fn(wrap(r, true));
      return pg.transaction(async (t) => fn(wrap(t as unknown as Runner, true)));
    },
  });
  const db = wrap(pg as unknown as Runner, false);
  (db as any).__raw = pg;
  return db;
}

async function migratePglite(db: Db): Promise<void> {
  const pg = (db as any).__raw as { exec: (sql: string) => Promise<unknown> };
  await pg.exec(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query<{ name: string }>('select name from _migrations')).map((r) => r.name));
  for (const m of migrationFiles()) {
    if (done.has(m.name)) continue;
    await pg.exec('begin');
    try {
      await pg.exec(m.sql);
      await pg.exec(`insert into _migrations (name) values ('${m.name.replace(/'/g, "''")}')`);
      await pg.exec('commit');
    } catch (e) {
      await pg.exec('rollback');
      throw e;
    }
  }
}

async function openPglite(dataDir?: string): Promise<Db> {
  const db = await makePglite(dataDir);
  await migratePglite(db);
  await seedCities(db);
  return db;
}

// ---------- postgres.js ----------

async function makePostgres(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    types: {
      date: { to: OID.DATE, from: [OID.DATE], serialize: (x: unknown) => String(x), parse: identity },
      numeric: { to: OID.NUMERIC, from: [OID.NUMERIC], serialize: (x: unknown) => String(x), parse: toNumber },
      bigint: { to: OID.INT8, from: [OID.INT8], serialize: (x: unknown) => String(x), parse: toNumber },
      json: { to: OID.JSON, from: [OID.JSON], serialize: jsonSerialize, parse: jsonParse },
      jsonb: { to: OID.JSONB, from: [OID.JSONB], serialize: jsonSerialize, parse: jsonParse },
    },
  });
  type Runner = { unsafe: (q: string, p?: any[]) => PromiseLike<any> };
  const wrap = (r: Runner, inTx: boolean): Db => ({
    async query<T>(q: string, params?: unknown[]) {
      const rows = await r.unsafe(q, prepParams(params) as any[]);
      return Array.from(rows) as T[];
    },
    async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
      if (inTx) return fn(wrap(r, true));
      return (await sql.begin(async (t) => fn(wrap(t as unknown as Runner, true)))) as T;
    },
  });
  return wrap(sql as unknown as Runner, false);
}

// ---------- public API ----------

const G = globalThis as unknown as { __sutraDb?: Promise<Db> };

/** Singleton. DATABASE_URL -> postgres.js (no auto-migrate). Otherwise PGlite in `.pglite/` with migrations + seed. */
export function getDb(): Promise<Db> {
  if (!G.__sutraDb) {
    const url = process.env.DATABASE_URL;
    const p = url ? makePostgres(url) : openPglite(path.resolve(projectRoot(), '.pglite'));
    G.__sutraDb = p;
    p.catch(() => {
      if (G.__sutraDb === p) G.__sutraDb = undefined;
    });
  }
  return G.__sutraDb;
}

/** Fresh in-memory PGlite with migrations and seed applied. */
export async function createTestDb(): Promise<Db> {
  return openPglite(undefined);
}

export { seedCities } from './seed';
