import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type Db } from '@/lib/db';
import { seedCities } from '@/lib/db/seed';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
}, 60_000);

async function mkPlayer(nick = 'Ivo', hash = 'h-' + nick) {
  const [city] = await db.query<{ id: number }>('select id from cities order by id limit 1');
  const [p] = await db.query<{ id: string }>(
    `insert into players (nickname, nickname_lower, city_id, token_hash, first_round)
     values ($1, lower($1), $2, $3, '2026-11-15') returning id`,
    [nick, city.id, hash],
  );
  return p.id;
}

async function mkRound(date = '2026-11-15', n = 2) {
  await db.query(`insert into rounds (target_date) values ($1) on conflict do nothing`, [date]);
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) {
    const [q] = await db.query<{ id: string }>(
      `insert into questions (round_date, position, kind, category, source_key, source_params, text_hr, text_en, min, max, step, unit, scale)
       values ($1, $2, 'number', 'weather', 'mock', $3, 'hr', 'en', 0, 40.5, 0.5, 'C', 10) returning id`,
      [date, i, { city: 'Zagreb', n: i }],
    );
    ids.push(q.id);
  }
  return ids;
}

describe('db', () => {
  it('applies migrations on an empty db and seeds counties', async () => {
    const m = await db.query<{ name: string }>('select name from _migrations');
    expect(m.map((r) => r.name)).toContain('0001_init.sql');
    const [c] = await db.query<{ n: number }>('select count(*) as n from counties');
    expect(c.n).toBe(21);
    const [ci] = await db.query<{ n: number }>('select count(*) as n from cities');
    expect(ci.n).toBeGreaterThan(21);
  });

  it('seeding is idempotent', async () => {
    await seedCities(db);
    const [c] = await db.query<{ n: number }>('select count(*) as n from counties');
    expect(c.n).toBe(21);
  });

  it('round-trips types', async () => {
    const pid = await mkPlayer();
    const [qid] = await mkRound();
    await db.query(`insert into predictions (player_id, question_id, round_date, value) values ($1,$2,$3,$4)`, [
      pid, qid, '2026-11-15', 12.5,
    ]);
    const [q] = await db.query<any>('select * from questions where id = $1', [qid]);
    expect(q.round_date).toBe('2026-11-15');
    expect(q.max).toBe(40.5);
    expect(typeof q.step).toBe('number');
    expect(q.source_params).toEqual({ city: 'Zagreb', n: 1 });
    const [p] = await db.query<any>('select * from predictions where player_id = $1', [pid]);
    expect(p.value).toBe(12.5);
    expect(p.updated_at).toBeInstanceOf(Date);
    expect(p.staked).toBe(false);
    const [pl] = await db.query<any>('select first_round, created_at from players where id = $1', [pid]);
    expect(pl.first_round).toBe('2026-11-15');
    expect(pl.created_at).toBeInstanceOf(Date);
    await db.query(
      `insert into settlements (player_id, round_date, delta, missed, offset_after, detail) values ($1,$2,5,false,5,$3)`,
      [pid, '2026-11-15', { perQuestion: [{ points: 5 }] }],
    );
    const [s] = await db.query<any>('select detail from settlements');
    expect(s.detail.perQuestion[0].points).toBe(5);
  });

  it('allows only one staked prediction per player per round', async () => {
    const pid = await mkPlayer();
    const [q1, q2] = await mkRound();
    const ins = (q: string, staked: boolean) =>
      db.query(`insert into predictions (player_id, question_id, round_date, value, staked) values ($1,$2,'2026-11-15',1,$3)`, [pid, q, staked]);
    await ins(q1, true);
    await expect(ins(q2, true)).rejects.toThrow();
    await ins(q2, false);
  });

  it('tx commits and rolls back on error', async () => {
    await db.tx(async (t) => {
      await t.query(`insert into rounds (target_date) values ('2026-12-01')`);
    });
    await expect(
      db.tx(async (t) => {
        await t.query(`insert into rounds (target_date) values ('2026-12-02')`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await db.query<{ target_date: string }>('select target_date from rounds order by 1');
    expect(rows.map((r) => r.target_date)).toEqual(['2026-12-01']);
  });

  it('enforces nickname_lower uniqueness', async () => {
    await mkPlayer('Marko', 'a');
    const [city] = await db.query<{ id: number }>('select id from cities limit 1');
    await expect(
      db.query(
        `insert into players (nickname, nickname_lower, city_id, token_hash, first_round) values ('MARKO','marko',$1,'b','2026-11-15')`,
        [city.id],
      ),
    ).rejects.toThrow();
  });
});
