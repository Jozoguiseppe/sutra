import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/lib/db';
import { createPlayer, getPlayerByToken, hashToken } from '@/lib/services/players';
import { getOpenRound, getPendingRound, savePrediction } from '@/lib/services/rounds';
import { generateProposals } from '@/lib/services/questions';
import { mockAdapter } from '@/lib/sources/mock';
import { getAdapter } from '@/lib/sources';

const NOW = new Date('2026-11-14T10:00:00Z'); // 11:00 Zagreb, open round = 2026-11-15
const AFTER_LOCK = new Date('2026-11-14T23:30:00Z'); // 00:30 Zagreb on 2026-11-15
const D = '2026-11-15';

let db: Db;
let cityId: number;
beforeEach(async () => {
  db = await createTestDb();
  cityId = Number((await db.query('select id from cities order by id limit 1'))[0].id);
});

async function mk(nickname = 'Marko', at = NOW) {
  const r = await createPlayer(db, at, { nickname, cityId });
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('players', () => {
  it('validates nickname', async () => {
    const f = async (nickname: string) => {
      const r = await createPlayer(db, NOW, { nickname, cityId });
      return r.ok ? 'ok' : r.error;
    };
    expect(await f('ab')).toBe('nickname_short');
    expect(await f('  a ')).toBe('nickname_short');
    expect(await f('x'.repeat(21))).toBe('nickname_long');
    expect(await f('bad!name')).toBe('nickname_invalid');
    expect(await f('Ana_Maria-2 x')).toBe('ok');
    const bad = await createPlayer(db, NOW, { nickname: 'Valid', cityId: 999999 });
    expect(bad).toEqual({ ok: false, error: 'city_invalid' });
  });

  it('enforces case-insensitive uniqueness', async () => {
    await mk('Čokolada');
    const r = await createPlayer(db, NOW, { nickname: 'čOKOLADA', cityId });
    expect(r).toEqual({ ok: false, error: 'nickname_taken' });
  });

  it('looks up by token and stores only a hash', async () => {
    const { player, token } = await mk('Ivo');
    expect(player.firstRound).toBe(D);
    const found = await getPlayerByToken(db, token);
    expect(found?.id).toBe(player.id);
    expect(await getPlayerByToken(db, 'nope')).toBeNull();
    expect(await getPlayerByToken(db, undefined)).toBeNull();
    const row = (await db.query('select token_hash from players where id=$1', [player.id]))[0];
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).not.toBe(token);
  });
});

describe('getOpenRound', () => {
  it('auto-generates and approves 4 questions, stable on second call', async () => {
    const a = await getOpenRound(db, NOW);
    expect(a.targetDate).toBe(D);
    expect(a.lockAt).toBe('2026-11-14T23:00:00.000Z');
    expect(a.questions).toHaveLength(4);
    expect(a.questions.map((q) => q.position)).toEqual([1, 2, 3, 4]);
    expect(a.questions.filter((q) => q.kind === 'number')).toHaveLength(2);
    expect(a.questions.filter((q) => q.kind === 'yesno')).toHaveLength(2);
    expect(a.predictions).toEqual([]);
    const b = await getOpenRound(db, NOW);
    expect(b.questions).toEqual(a.questions);
    expect((await db.query('select count(*)::int as n from questions where round_date=$1', [D]))[0].n).toBe(8);
    expect((await db.query(`select count(*)::int as n from questions where round_date=$1 and status='approved'`, [D]))[0].n).toBe(4);
    expect((await db.query('select status from rounds where target_date=$1', [D]))[0].status).toBe('ready');
  });

  it('never leaks actual_value or scale', async () => {
    const r = await getOpenRound(db, NOW);
    for (const q of r.questions) {
      expect(Object.keys(q).sort()).toEqual(['category', 'id', 'kind', 'max', 'min', 'position', 'step', 'text', 'textEn', 'unit']);
    }
    expect(JSON.stringify(r)).not.toMatch(/actual|scale/);
    const yn = r.questions.find((q) => q.kind === 'yesno')!;
    expect([yn.min, yn.max, yn.step, yn.unit]).toEqual([null, null, null, null]);
  });
});

describe('savePrediction', () => {
  async function setup() {
    const { player } = await mk();
    const round = await getOpenRound(db, NOW, player.id);
    const num = round.questions.filter((q) => q.kind === 'number');
    const yn = round.questions.filter((q) => q.kind === 'yesno');
    return { player, round, num, yn };
  }

  it('happy path', async () => {
    const { player, num, yn } = await setup();
    const r1 = await savePrediction(db, NOW, player.id, { questionId: num[0].id, value: num[0].min!, staked: false });
    expect(r1).toMatchObject({ ok: true });
    const r2 = await savePrediction(db, NOW, player.id, { questionId: yn[0].id, value: 1, staked: true });
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.predictions).toHaveLength(2);
    expect(r2.predictions.find((p) => p.questionId === yn[0].id)).toEqual({ questionId: yn[0].id, value: 1, staked: true });
    // replace
    const r3 = await savePrediction(db, NOW, player.id, { questionId: yn[0].id, value: 0, staked: true });
    if (!r3.ok) throw new Error(r3.error);
    expect(r3.predictions).toHaveLength(2);
    const open = await getOpenRound(db, NOW, player.id);
    expect(open.predictions).toHaveLength(2);
  });

  it('validates range and step', async () => {
    const { player, num } = await setup();
    const q = num[0];
    const save = async (value: number) => (await savePrediction(db, NOW, player.id, { questionId: q.id, value, staked: false })).ok;
    expect(await save(q.min!)).toBe(true);
    expect(await save(q.max!)).toBe(true);
    expect(await save(q.min! + q.step!)).toBe(true);
    expect(await save(q.min! - q.step!)).toBe(false);
    expect(await save(q.max! + q.step!)).toBe(false);
    expect(await save(q.min! + q.step! / 2)).toBe(false);
    expect(await save(NaN)).toBe(false);
    const res = await savePrediction(db, NOW, player.id, { questionId: q.id, value: q.max! + 1000, staked: false });
    expect(res).toEqual({ ok: false, error: 'invalid_value' });
  });

  it('validates yes/no', async () => {
    const { player, yn } = await setup();
    for (const v of [0, 1]) expect((await savePrediction(db, NOW, player.id, { questionId: yn[0].id, value: v, staked: false })).ok).toBe(true);
    for (const v of [2, -1, 0.5]) {
      expect(await savePrediction(db, NOW, player.id, { questionId: yn[0].id, value: v, staked: false })).toEqual({ ok: false, error: 'invalid_value' });
    }
  });

  it('keeps exactly one stake when moving it', async () => {
    const { player, round } = await setup();
    const [a, b, c] = round.questions;
    const val = (q: typeof a) => (q.kind === 'yesno' ? 1 : q.min!);
    await savePrediction(db, NOW, player.id, { questionId: a.id, value: val(a), staked: true });
    await savePrediction(db, NOW, player.id, { questionId: b.id, value: val(b), staked: false });
    const r = await savePrediction(db, NOW, player.id, { questionId: c.id, value: val(c), staked: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.predictions.filter((p) => p.staked).map((p) => p.questionId)).toEqual([c.id]);
    // unstaking the staked one leaves zero
    const r2 = await savePrediction(db, NOW, player.id, { questionId: c.id, value: val(c), staked: false });
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.predictions.filter((p) => p.staked)).toHaveLength(0);
    const n = (await db.query('select count(*)::int as n from predictions where player_id=$1 and staked', [player.id]))[0].n;
    expect(n).toBe(0);
  });

  it('rejects after lock, unknown questions, and non-open rounds', async () => {
    const { player, round } = await setup();
    const q = round.questions.find((x) => x.kind === 'yesno')!;
    expect(await savePrediction(db, AFTER_LOCK, player.id, { questionId: q.id, value: 1, staked: false })).toEqual({ ok: false, error: 'locked' });
    expect(await savePrediction(db, NOW, player.id, { questionId: '00000000-0000-4000-8000-000000000000', value: 1, staked: false })).toEqual({ ok: false, error: 'question_not_found' });
    expect(await savePrediction(db, NOW, player.id, { questionId: 'garbage', value: 1, staked: false })).toEqual({ ok: false, error: 'question_not_found' });
    // an approved question of an older (non-open) round
    await db.query('insert into rounds (target_date) values ($1)', ['2026-11-10']);
    const old = await db.query<{ id: string }>(
      `insert into questions (round_date, position, kind, category, source_key, text_hr, text_en, status)
       values ('2026-11-10', 1, 'yesno', 'misc', 'mock', 'x', 'x', 'approved') returning id`,
    );
    expect(await savePrediction(db, NOW, player.id, { questionId: old[0].id, value: 1, staked: false })).toEqual({ ok: false, error: 'locked' });
    // unapproved spare is not savable
    const spare = await db.query<{ id: string }>('select id from questions where round_date=$1 and position=5', [D]);
    expect(await savePrediction(db, NOW, player.id, { questionId: spare[0].id, value: 1, staked: false })).toEqual({ ok: false, error: 'question_not_found' });
  });
});

describe('getPendingRound', () => {
  it('returns today\'s round with my predictions', async () => {
    const { player } = await mk();
    const open = await getOpenRound(db, NOW, player.id);
    const q = open.questions.find((x) => x.kind === 'yesno')!;
    await savePrediction(db, NOW, player.id, { questionId: q.id, value: 1, staked: true });

    expect((await getPendingRound(db, NOW, player.id)).targetDate).toBeNull();

    const p = await getPendingRound(db, AFTER_LOCK, player.id);
    expect(p.targetDate).toBe(D);
    expect(p.settled).toBe(false);
    expect(p.settleAt).toBe('2026-11-15T19:00:00.000Z');
    expect(p.questions.map((x) => x.id)).toEqual(open.questions.map((x) => x.id));
    expect(p.predictions).toEqual([{ questionId: q.id, value: 1, staked: true }]);
    expect((await getPendingRound(db, AFTER_LOCK)).predictions).toEqual([]);
  });
});

describe('generateProposals', () => {
  it('is idempotent and inserts 8 varied proposals', async () => {
    const t = '2026-11-20';
    expect(await generateProposals(db, NOW, t)).toEqual({ created: true });
    expect(await generateProposals(db, NOW, t)).toEqual({ created: false });
    const rows = await db.query<any>('select * from questions where round_date=$1 order by position', [t]);
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.every((r) => r.status === 'proposed')).toBe(true);
    const first4 = rows.slice(0, 4);
    expect(first4.filter((r) => r.kind === 'number')).toHaveLength(2);
    expect(first4.filter((r) => r.kind === 'yesno')).toHaveLength(2);
    expect(new Set(first4.map((r) => r.category)).size).toBeGreaterThanOrEqual(3);
    expect(first4.filter((r) => r.kind === 'number').every((r) => r.scale > 0 && r.min < r.max && r.step > 0)).toBe(true);
    expect((await db.query('select count(*)::int as n from rounds where target_date=$1', [t]))[0].n).toBe(1);
  });

  it('is deterministic per date', async () => {
    const other = await createTestDb();
    await generateProposals(db, NOW, '2026-12-01');
    await generateProposals(other, NOW, '2026-12-01');
    const q = (d: Db) => d.query('select text_hr from questions where round_date=$1 order by position', ['2026-12-01']);
    expect(await q(db)).toEqual(await q(other));
  });
});

describe('mock adapter', () => {
  it('proposes >= 6 drafts and resolves deterministically inside bounds', async () => {
    const drafts = await mockAdapter.propose('2026-11-20', () => 0.5);
    expect(drafts.length).toBeGreaterThanOrEqual(6);
    expect(getAdapter('mock')).toBe(mockAdapter);
    for (const d of drafts) {
      const a = await mockAdapter.resolve('2026-11-20', d.source_params);
      const b = await mockAdapter.resolve('2026-11-20', d.source_params);
      expect(a).toBe(b);
      if (d.kind === 'yesno') expect([0, 1]).toContain(a);
      else {
        expect(a!).toBeGreaterThanOrEqual(d.min!);
        expect(a!).toBeLessThanOrEqual(d.max!);
        const k = (a! - d.min!) / d.step!;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
      }
    }
  });
});
