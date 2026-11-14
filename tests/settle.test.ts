import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/lib/db';
import { createPlayer } from '@/lib/services/players';
import { getOpenRound, savePrediction } from '@/lib/services/rounds';
import { settleRound } from '@/lib/services/settle';
import { getRoundResult } from '@/lib/services/results';
import { displayDate, scoreRound, type RoundItem } from '@/lib/scoring';
import { mockAdapter } from '@/lib/sources/mock';

const D = '2026-11-15';
const D2 = '2026-11-16';
const CREATED = new Date('2026-11-14T10:00:00Z'); // first_round = D
const CREATED_LATE = new Date('2026-11-15T10:00:00Z'); // first_round = D2
const EARLY = new Date('2026-11-15T18:30:00Z'); // 19:30 Zagreb
const SETTLE = new Date('2026-11-15T19:30:00Z'); // 20:30 Zagreb
const SETTLE2 = new Date('2026-11-16T19:30:00Z');

let db: Db;
let cityId: number;
beforeEach(async () => {
  db = await createTestDb();
  cityId = Number((await db.query('select id from cities order by id limit 1'))[0].id);
}, 60_000);

async function mkPlayer(nickname: string, at = CREATED): Promise<string> {
  const r = await createPlayer(db, at, { nickname, cityId });
  if (!r.ok) throw new Error(r.error);
  return r.player.id;
}

interface QSpec { kind: 'number' | 'yesno'; actual?: number | null; sourceKey?: string; min?: number; max?: number; step?: number; scale?: number }
async function mkRound(date: string, specs: QSpec[], status = 'ready'): Promise<string[]> {
  await db.query(`insert into rounds (target_date, status) values ($1, $2) on conflict do nothing`, [date, status]);
  const ids: string[] = [];
  let pos = 1;
  for (const s of specs) {
    const number = s.kind === 'number';
    const params = number
      ? { id: 'q' + pos, kind: 'number', min: s.min ?? 0, max: s.max ?? 100, step: s.step ?? 1 }
      : { id: 'q' + pos, kind: 'yesno', threshold: 0 };
    const [q] = await db.query<{ id: string }>(
      `insert into questions (round_date, position, kind, category, source_key, source_params, text_hr, text_en, min, max, step, unit, scale, status, actual_value)
       values ($1,$2,$3,'misc',$4,$5,'hr','en',$6,$7,$8,$9,$10,'approved',$11) returning id`,
      [
        date, pos++, s.kind, s.sourceKey ?? 'mock', params,
        number ? s.min ?? 0 : null, number ? s.max ?? 100 : null, number ? s.step ?? 1 : null, number ? 'u' : null,
        number ? s.scale ?? 20 : null, s.actual ?? null,
      ],
    );
    ids.push(q.id);
  }
  return ids;
}

async function predict(playerId: string, date: string, qid: string, value: number, staked = false) {
  await db.query(
    `insert into predictions (player_id, question_id, round_date, value, staked) values ($1,$2,$3,$4,$5)`,
    [playerId, qid, date, value, staked],
  );
}

async function dump() {
  return {
    players: await db.query('select id, nickname, offset_points, first_round from players order by id'),
    settlements: await db.query('select * from settlements order by round_date, player_id'),
    rounds: await db.query('select * from rounds order by target_date'),
    questions: await db.query('select * from questions order by round_date, position'),
  };
}

/** Round D with hand-computable numbers. Returns ids and players. */
async function scenario() {
  const q = await mkRound(D, [
    { kind: 'number', actual: 50, min: 0, max: 100, step: 1, scale: 20 },
    { kind: 'number', actual: 20, min: 0, max: 40, step: 1, scale: 10 },
    { kind: 'yesno', actual: 1 },
    { kind: 'yesno', actual: 0 },
  ]);
  const A = await mkPlayer('Ana');
  const B = await mkPlayer('Bruno');
  const C = await mkPlayer('Cvita');
  const Dm = await mkPlayer('Dino');
  const E = await mkPlayer('Eva', CREATED_LATE);
  // A: all answered, stake right on Q1 -> 60 + 10 + 15 - 10 = 75
  await predict(A, D, q[0], 50, true); await predict(A, D, q[1], 25); await predict(A, D, q[2], 1); await predict(A, D, q[3], 1);
  // B: partial, stake wrong on Q3 -> -10 + (-10*2) = -30
  await predict(B, D, q[1], 40); await predict(B, D, q[2], 0, true);
  // C: stake right on yes/no Q3 -> 10 + 30 + 30 + 15 = 85
  await predict(C, D, q[0], 60); await predict(C, D, q[1], 20); await predict(C, D, q[2], 1, true); await predict(C, D, q[3], 0);
  // Dino: nothing -> missed, -1. Eva joined after the round: no settlement.
  return { q, A, B, C, Dm, E };
}

describe('settleRound', () => {
  it('scores players in different situations and skips players who joined later', async () => {
    const { A, B, C, Dm, E } = await scenario();
    const r = await settleRound(db, SETTLE, D);
    expect(r).toEqual({ settled: true, players: 4, voided: 0 });

    const s = await db.query<any>('select * from settlements where round_date = $1', [D]);
    const by = Object.fromEntries(s.map((x) => [x.player_id, x]));
    expect(Object.keys(by)).toHaveLength(4);
    expect(by[A]).toMatchObject({ delta: 75, missed: false, offset_after: 75 });
    expect(by[B]).toMatchObject({ delta: -30, missed: false, offset_after: -30 });
    expect(by[C]).toMatchObject({ delta: 85, missed: false, offset_after: 85 });
    expect(by[Dm]).toMatchObject({ delta: -1, missed: true, offset_after: -1 });
    expect(by[E]).toBeUndefined();

    const off = async (id: string) => Number((await db.query('select offset_points from players where id=$1', [id]))[0].offset_points);
    expect([await off(A), await off(B), await off(C), await off(Dm), await off(E)]).toEqual([75, -30, 85, -1, 0]);

    expect(Array.isArray(by[A].detail)).toBe(true);
    expect(by[A].detail.map((d: any) => d.points)).toEqual([60, 10, 15, -10]);
    expect(by[A].detail[0]).toMatchObject({ staked: true, void: false, answered: true });
    expect(by[B].detail.map((d: any) => d.points)).toEqual([0, -10, -20, 0]);
    expect(by[B].detail[0].answered).toBe(false);

    const round = (await db.query<any>('select status, settled_at from rounds where target_date=$1', [D]))[0];
    expect(round.status).toBe('settled');
    expect(round.settled_at).not.toBeNull();
  });

  it('refuses before 20:00 Zagreb and changes nothing', async () => {
    await scenario();
    const before = await dump();
    expect(await settleRound(db, EARLY, D)).toEqual({ tooEarly: true });
    expect(await dump()).toEqual(before);
  });

  it('returns nothingToSettle for unknown rounds and rounds without approved questions', async () => {
    expect(await settleRound(db, SETTLE, D)).toEqual({ nothingToSettle: true });
    await db.query(`insert into rounds (target_date) values ($1)`, [D]);
    await db.query(
      `insert into questions (round_date, position, kind, category, source_key, text_hr, text_en) values ($1,1,'yesno','misc','mock','h','e')`,
      [D],
    );
    expect(await settleRound(db, SETTLE, D)).toEqual({ nothingToSettle: true });
    expect((await db.query<any>('select status from rounds'))[0].status).toBe('draft');
  });

  it('is idempotent: running twice changes nothing', async () => {
    await scenario();
    expect(await settleRound(db, SETTLE, D)).toMatchObject({ settled: true });
    const after1 = await dump();
    expect(await settleRound(db, SETTLE, D)).toEqual({ alreadySettled: true });
    expect(await settleRound(db, new Date('2026-11-17T12:00:00Z'), D)).toEqual({ alreadySettled: true });
    expect(await dump()).toEqual(after1);
  });

  it('scores once under concurrent calls', async () => {
    const { A } = await scenario();
    const results = await Promise.all([settleRound(db, SETTLE, D), settleRound(db, SETTLE, D), settleRound(db, SETTLE, D)]);
    expect(results.filter((r) => 'settled' in r)).toHaveLength(1);
    expect(results.filter((r) => 'alreadySettled' in r)).toHaveLength(2);
    expect(Number((await db.query('select count(*) as n from settlements'))[0].n)).toBe(4);
    expect(Number((await db.query('select offset_points from players where id=$1', [A]))[0].offset_points)).toBe(75);
  });

  it('is atomic: a failure while writing settlements rolls the claim back', async () => {
    const { A } = await scenario();
    // Pre-existing settlement row makes the insert fail halfway through the transaction.
    await db.query(`insert into settlements (player_id, round_date, delta, missed, offset_after, detail) values ($1,$2,0,false,0,'[]'::jsonb)`, [A, D]);
    await expect(settleRound(db, SETTLE, D)).rejects.toThrow();
    expect((await db.query<any>('select status, settled_at from rounds where target_date=$1', [D]))[0]).toEqual({ status: 'ready', settled_at: null });
    expect(Number((await db.query('select coalesce(sum(offset_points),0) as s from players'))[0].s)).toBe(0);
    expect(Number((await db.query('select count(*) as n from settlements'))[0].n)).toBe(1);
  });

  it('uses already-persisted actual values (crash between resolve and tx) without double scoring', async () => {
    const q = await mkRound(D, [
      { kind: 'number', actual: 50, sourceKey: 'ghost-source' }, // resolved earlier; adapter must not be needed
      { kind: 'yesno', actual: null, sourceKey: 'ghost-source' }, // never resolvable -> void
    ]);
    const A = await mkPlayer('Ana');
    await predict(A, D, q[0], 50); await predict(A, D, q[1], 1, true);
    expect(await settleRound(db, SETTLE, D)).toEqual({ settled: true, players: 1, voided: 1 });
    const s = (await db.query<any>('select delta from settlements'))[0];
    expect(s.delta).toBe(30);
    // re-running (as after a crash) must not add anything
    expect(await settleRound(db, SETTLE, D)).toEqual({ alreadySettled: true });
    expect(Number((await db.query('select offset_points from players'))[0].offset_points)).toBe(30);
  });

  it('voids unresolvable questions: 0 points for everyone, stake has no effect', async () => {
    const q = await mkRound(D, [
      { kind: 'number', actual: 10, min: 0, max: 100, step: 1, scale: 20 },
      { kind: 'number', sourceKey: 'does-not-exist', min: 0, max: 100, step: 1 },
    ]);
    const A = await mkPlayer('Ana');
    const B = await mkPlayer('Bruno');
    await predict(A, D, q[0], 10); await predict(A, D, q[1], 33, true); // stake on the void question
    await predict(B, D, q[0], 10, true); await predict(B, D, q[1], 33);
    expect(await settleRound(db, SETTLE, D)).toEqual({ settled: true, players: 2, voided: 1 });
    const qs = await db.query<any>('select status, actual_value from questions order by position');
    expect(qs[0]).toMatchObject({ status: 'approved', actual_value: 10 });
    expect(qs[1]).toMatchObject({ status: 'void', actual_value: null });
    const s = Object.fromEntries((await db.query<any>('select * from settlements')).map((x) => [x.player_id, x]));
    expect(s[A].delta).toBe(30); // not doubled: stake was wasted on the void question
    expect(s[B].delta).toBe(60); // stake on the valid one still doubles
    expect(s[A].detail[1]).toMatchObject({ points: 0, void: true, staked: true, answered: true });

    const res = (await getRoundResult(db, SETTLE, A, D))!;
    expect(res.questions[1]).toMatchObject({ void: true, actual: null, crowdBeatPct: null, wildest: null });
    expect(res.questions[1].my).toEqual({ value: 33, staked: true, points: 0 });
    expect(res.questions[1].crowd.count).toBe(2);
  });

  it('accumulates offsets over consecutive rounds', async () => {
    const { q, A, B, Dm, E } = await scenario();
    const q2 = await mkRound(D2, [{ kind: 'yesno', actual: 1 }, { kind: 'yesno', actual: 0 }]);
    await predict(A, D2, q2[0], 1); await predict(A, D2, q2[1], 0, true); // 15 + 30 = 45
    await predict(E, D2, q2[0], 0); // -10 ; Eva is eligible from D2
    // B and Dino miss D2
    await settleRound(db, SETTLE, D);
    expect(await settleRound(db, SETTLE2, D2)).toEqual({ settled: true, players: 5, voided: 0 });
    const off = async (id: string) => Number((await db.query('select offset_points from players where id=$1', [id]))[0].offset_points);
    expect(await off(A)).toBe(75 + 45);
    expect(await off(B)).toBe(-30 - 1);
    expect(await off(Dm)).toBe(-2);
    expect(await off(E)).toBe(-10);
    const s2 = Object.fromEntries((await db.query<any>('select * from settlements where round_date=$1', [D2])).map((x) => [x.player_id, x]));
    expect(s2[A]).toMatchObject({ delta: 45, offset_after: 120 });
    expect(s2[B]).toMatchObject({ delta: -1, missed: true, offset_after: -31 });
    expect(s2[E]).toMatchObject({ delta: -10, offset_after: -10 });

    const r2 = (await getRoundResult(db, SETTLE2, A))!;
    expect(r2.targetDate).toBe(D2);
    expect(r2.me).toMatchObject({ offsetBefore: 75, offsetAfter: 120, delta: 45 });
    expect(r2.me!.displayBefore).toEqual(displayDate(D2, 75));
    expect(r2.me!.displayAfter).toEqual(displayDate(D2, 120));
    void q;
  });

  it('full flow with the mock adapter: generated round, predictions via the service, adapter-resolved values', async () => {
    const open = await getOpenRound(db, CREATED);
    expect(open.targetDate).toBe(D);
    const A = await createPlayer(db, CREATED, { nickname: 'Ana', cityId });
    const B = await createPlayer(db, CREATED, { nickname: 'Bruno', cityId });
    if (!A.ok || !B.ok) throw new Error('player');
    const mid = (q: (typeof open.questions)[number]) => (q.kind === 'yesno' ? 1 : Math.round(((q.min! + q.max!) / 2) / q.step!) * q.step!);
    for (const [i, q] of open.questions.entries()) {
      const r = await savePrediction(db, CREATED, A.player.id, { questionId: q.id, value: mid(q), staked: i === 0 });
      expect(r.ok).toBe(true);
    }
    expect(await settleRound(db, SETTLE, D)).toEqual({ settled: true, players: 2, voided: 0 });

    const qs = await db.query<any>('select * from questions where round_date=$1 and position <= 4 order by position', [D]);
    for (const q of qs) expect(q.actual_value).toBe(await mockAdapter.resolve(D, q.source_params));
    const items: RoundItem[] = qs.map((q: any, i: number) => ({
      questionId: q.id, kind: q.kind, guess: mid(open.questions[i]), actual: q.actual_value, scale: q.scale, step: q.step, staked: i === 0,
    }));
    const expected = scoreRound(items);
    const sA = (await db.query<any>('select * from settlements where player_id=$1', [A.player.id]))[0];
    expect(sA.delta).toBe(expected.delta);
    expect(sA.detail).toEqual(expected.perQuestion);
    const sB = (await db.query<any>('select * from settlements where player_id=$1', [B.player.id]))[0];
    expect(sB).toMatchObject({ delta: -1, missed: true });
    // spares (positions 5-8) were never resolved
    expect(Number((await db.query(`select count(*) as n from questions where round_date=$1 and position > 4 and actual_value is not null`, [D]))[0].n)).toBe(0);
  });
});

describe('getRoundResult', () => {
  it('returns null when nothing is settled / unknown date / invalid date', async () => {
    await scenario();
    expect(await getRoundResult(db, SETTLE, null)).toBeNull();
    expect(await getRoundResult(db, SETTLE, null, D)).toBeNull(); // not settled yet
    await settleRound(db, SETTLE, D);
    expect(await getRoundResult(db, SETTLE, null, '2026-01-01')).toBeNull();
    expect(await getRoundResult(db, SETTLE, null, 'garbage')).toBeNull();
    expect(await getRoundResult(db, SETTLE, null, '2026-13-45')).toBeNull();
  });

  it('matches hand-computed numbers', async () => {
    const { q, A, B, C, Dm, E } = await scenario();
    await settleRound(db, SETTLE, D);

    const a = (await getRoundResult(db, SETTLE, A))!; // default = latest settled
    expect(a.targetDate).toBe(D);
    expect(a.players).toBe(3); // A, B, C answered something
    expect(a.me).toMatchObject({ played: true, missed: false, delta: 75, offsetBefore: 0, offsetAfter: 75, beatPct: 33 });
    expect(a.me!.displayBefore).toEqual({ year: 2026, month: 11, day: 15 });
    expect(a.me!.displayAfter).toEqual(displayDate(D, 75)); // 75 + floor(5625/100) = 131 days ahead

    const [q1, q2, q3, q4] = a.questions;
    expect(a.questions.map((x) => x.id)).toEqual(q);
    expect(q1).toMatchObject({ void: false, actual: 50, kind: 'number' });
    expect(q1.my).toEqual({ value: 50, staked: true, points: 60 });
    expect(q1.crowd).toEqual({ count: 2, avg: 55, yesPct: null });
    expect(q1.crowdBeatPct).toBe(50); // crowd err 5; A err 0, C err 10 -> 1 of 2 larger
    expect(q1.wildest).toEqual({ nickname: 'Cvita', value: 60 });

    expect(q2.crowd.count).toBe(3);
    expect(q2.crowd.avg).toBeCloseTo(85 / 3, 9);
    expect(q2.crowdBeatPct).toBe(33); // crowd err 8.33; only B (20) larger
    expect(q2.wildest).toEqual({ nickname: 'Bruno', value: 40 });
    expect(q2.my!.points).toBe(10);

    expect(q3).toMatchObject({ actual: 1, kind: 'yesno', crowdBeatPct: null, wildest: null });
    expect(q3.crowd).toEqual({ count: 3, avg: null, yesPct: 67 });
    expect(q4.crowd).toEqual({ count: 2, avg: null, yesPct: 50 });
    expect(q4.my).toEqual({ value: 1, staked: false, points: -10 });

    const b = (await getRoundResult(db, SETTLE, B, D))!;
    expect(b.me).toMatchObject({ delta: -30, beatPct: 0, offsetBefore: 0, offsetAfter: -30 });
    expect(b.questions[0].my).toBeNull(); // not answered
    expect(b.questions[2].my).toEqual({ value: 0, staked: true, points: -20 });
    expect(b.me!.displayAfter).toEqual(displayDate(D, -30));

    const c = (await getRoundResult(db, SETTLE, C, D))!;
    expect(c.me).toMatchObject({ delta: 85, beatPct: 67 });

    const m = (await getRoundResult(db, SETTLE, Dm, D))!;
    expect(m.me).toMatchObject({ played: false, missed: true, delta: -1, offsetBefore: 0, offsetAfter: -1 });
    expect(m.questions.every((x) => x.my === null)).toBe(true);

    // late joiner (not eligible) and anonymous: no `me`, same crowd data
    const e = (await getRoundResult(db, SETTLE, E, D))!;
    expect(e.me).toBeNull();
    const anon = (await getRoundResult(db, SETTLE, null, D))!;
    expect(anon.me).toBeNull();
    expect(anon.questions.every((x) => x.my === null)).toBe(true);
    expect(anon.questions.map((x) => x.crowd)).toEqual(e.questions.map((x) => x.crowd));
    expect(anon.players).toBe(3);
  });

  it('wildest is null when nobody answered a number question', async () => {
    const q = await mkRound(D, [{ kind: 'number', actual: 5 }, { kind: 'yesno', actual: 1 }]);
    const A = await mkPlayer('Ana');
    await predict(A, D, q[1], 1);
    await settleRound(db, SETTLE, D);
    const r = (await getRoundResult(db, SETTLE, A))!;
    expect(r.questions[0]).toMatchObject({ wildest: null, crowdBeatPct: null, crowd: { count: 0, avg: null, yesPct: null } });
  });
});
