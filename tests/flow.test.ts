// End-to-end test of the whole game loop at service level, over several simulated Zagreb days
// (including the DST change of Sunday 2027-03-28, 02:00 CET -> 03:00 CEST).
// It is an independent check: expected values are computed here from mockAdapter.resolve() and the
// formulas written in docs/ARCHITECTURE.md section 3 (scoreRound is deliberately NOT used).
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/lib/db';
import { createPlayer } from '@/lib/services/players';
import { getOpenRound, getPendingRound, savePrediction } from '@/lib/services/rounds';
import { settleRound } from '@/lib/services/settle';
import { getRoundResult } from '@/lib/services/results';
import { cityLeaderboard, createLeague, joinLeague, leagueTable } from '@/lib/services/leaderboard';
import { approveAll, generate, listProposals, reject } from '@/lib/services/admin';
import { displayDate } from '@/lib/scoring';
import { mockAdapter } from '@/lib/sources/mock';

// ---- calendar -------------------------------------------------------------------------------
// Round D is open on D-1 (Zagreb), locks at Zagreb midnight starting D, settles at D 20:00.
const R1 = '2027-03-27'; // Saturday (CET, UTC+1 all day)
const R2 = '2027-03-28'; // Sunday  (midnight CET, 20:00 CEST = 18:00Z)
const R3 = '2027-03-29'; // Monday  (CEST, UTC+2)
const R4 = '2027-03-30'; // future round used for the admin flow
const ROUNDS = [R1, R2, R3];

const at = (iso: string) => new Date(iso);
const D1_MORNING = at('2027-03-26T07:00:00Z'); // 08:00 CET Fri
const D1_2359 = at('2027-03-26T22:59:59Z'); // 23:59:59 CET Fri, round R1 still open
const D1_LOCK = at('2027-03-26T23:00:00Z'); // 00:00:00 CET Sat: locked
const D1_LOCK_1S = at('2027-03-26T23:00:01Z'); // 00:00:01 CET Sat
const D2_MORNING = at('2027-03-27T07:00:00Z'); // 08:00 CET Sat
const R1_TOO_EARLY = at('2027-03-27T18:59:59Z'); // 19:59:59 CET
const R1_SETTLE = at('2027-03-27T19:00:00Z'); // 20:00:00 CET
const D3_MORNING = at('2027-03-28T08:00:00Z'); // 10:00 CEST Sun
const D3_NOON = at('2027-03-28T12:00:00Z');
const R2_TOO_EARLY = at('2027-03-28T17:59:59Z'); // 19:59:59 CEST (with a wrong +1h offset this would be "settled")
const R2_SETTLE = at('2027-03-28T18:00:00Z'); // 20:00:00 CEST
const D3_2359 = at('2027-03-28T21:59:59Z'); // 23:59:59 CEST, R3 still open
const D3_LOCK_1S = at('2027-03-28T22:00:01Z'); // 00:00:01 CEST Mon, R3 locked
const D4_MORNING = at('2027-03-29T08:00:00Z'); // 10:00 CEST Mon
const R3_TOO_EARLY = at('2027-03-29T17:59:59Z');
const R3_SETTLE = at('2027-03-29T18:00:00Z');
const FINAL = at('2027-03-29T18:30:00Z');

// ---- independent implementation of the architecture formulas -------------------------------
type Mode = 'good' | 'mid' | 'bad';
interface Q { id: string; position: number; kind: 'number' | 'yesno'; min: number | null; max: number | null; step: number | null; scale: number | null; actual: number }
interface Pred { value: number; staked: boolean }

function numberPoints(guess: number, actual: number, scale: number, step: number): number {
  const e = Math.abs(guess - actual);
  if (e < step / 2 - 1e-9) return 30;
  const s = Math.min(e / scale, 1);
  return Math.round(30 - 40 * s + 1e-9);
}
function pointsFor(q: Q, p: Pred | undefined): { points: number; answered: boolean } {
  if (!p) return { points: 0, answered: false };
  const base = q.kind === 'yesno' ? (p.value === q.actual ? 15 : -10) : numberPoints(p.value, q.actual, q.scale!, q.step!);
  return { points: p.staked ? base * 2 : base, answered: true };
}
function expectedRound(qs: Q[], mine: Map<number, Pred>) {
  const per = qs.map((q) => ({ questionId: q.id, ...pointsFor(q, mine.get(q.position)) }));
  const missed = mine.size === 0;
  return { per, missed, delta: missed ? -1 : per.reduce((a, x) => a + x.points, 0) };
}
const warp = (x: number) => Math.sign(x) * (Math.abs(x) + Math.floor((x * x) / 100));
void warp;

// ---- shared state (the tests below run in order) --------------------------------------------
let db: Db;
const ids: Record<string, string> = {};
const cityOf: Record<string, number> = {};
const NAMES = ['Ana', 'Bruno', 'Cica', 'Dino'] as const;
type Name = (typeof NAMES)[number];
const qs: Record<string, Q[]> = {};
const rec: Record<string, Record<string, Map<number, Pred>>> = {};
const offs: Record<string, number> = { Ana: 0, Bruno: 0, Cica: 0, Dino: 0 };
const eligible: Record<string, Name[]> = { [R1]: ['Ana', 'Bruno', 'Cica'], [R2]: [...NAMES], [R3]: [...NAMES] };
const deltas: Record<string, Record<string, number>> = {};
let savedRound1: string;

beforeAll(async () => {
  db = await createTestDb();
  const c = await db.query('select id from cities order by id limit 4');
  const cs = c.map((r: any) => Number(r.id));
  cityOf.Ana = cs[0];
  cityOf.Bruno = cs[1];
  cityOf.Cica = cs[2];
  cityOf.Dino = cs[2]; // same city as Cica so the city average is meaningful
  for (const r of ROUNDS) {
    rec[r] = {};
    for (const n of NAMES) rec[r][n] = new Map();
  }
}, 120_000);

async function join(name: Name, now: Date) {
  const r = await createPlayer(db, now, { nickname: name, cityId: cityOf[name] });
  if (!r.ok) throw new Error(r.error);
  ids[name] = r.player.id;
  return r.player;
}

/** Load the 4 questions of a round as seen by the game and compute actual values via the mock adapter. */
async function loadRound(date: string): Promise<Q[]> {
  const rows = await db.query(
    `select id, position, kind, min, max, step, scale, source_params from questions
      where round_date = $1 and status = 'approved' order by position`,
    [date],
  );
  expect(rows.map((r: any) => Number(r.position))).toEqual([1, 2, 3, 4]);
  const out: Q[] = [];
  for (const r of rows as any[]) {
    const actual = await mockAdapter.resolve(date, r.source_params);
    expect(actual).not.toBeNull();
    out.push({
      id: r.id, position: Number(r.position), kind: r.kind,
      min: r.min === null ? null : Number(r.min), max: r.max === null ? null : Number(r.max),
      step: r.step === null ? null : Number(r.step), scale: r.scale === null ? null : Number(r.scale),
      actual: actual as number,
    });
  }
  return out;
}

function guess(q: Q, mode: Mode): number {
  if (q.kind === 'yesno') return mode === 'bad' ? 1 - q.actual : q.actual;
  if (mode === 'good') return q.actual;
  if (mode === 'bad') return Math.abs(q.min! - q.actual) >= Math.abs(q.max! - q.actual) ? q.min! : q.max!;
  const up = q.actual + 2 * q.step!;
  return Number((up <= q.max! + 1e-9 ? up : q.actual - 2 * q.step!).toFixed(6));
}

/** Save through the service and mirror the (documented) stake rule in the local record. */
async function put(name: Name, date: string, pos: number, mode: Mode, staked: boolean, now: Date) {
  const q = qs[date][pos - 1];
  const value = guess(q, mode);
  const r = await savePrediction(db, now, ids[name], { questionId: q.id, value, staked });
  expect(r.ok, `${name} ${date} pos${pos} ${JSON.stringify(r)}`).toBe(true);
  const mine = rec[date][name];
  if (staked) for (const p of mine.values()) p.staked = false;
  mine.set(pos, { value, staked });
  if (r.ok) expect(r.predictions.filter((p) => p.staked).length).toBeLessThanOrEqual(1);
}

function serverPredMap(preds: { questionId: string; value: number; staked: boolean }[], date: string) {
  const m = new Map<number, Pred>();
  for (const p of preds) {
    const q = qs[date].find((x) => x.id === p.questionId)!;
    m.set(q.position, { value: p.value, staked: p.staked });
  }
  return m;
}
async function expectPredictionsMatch(name: Name, date: string, preds: { questionId: string; value: number; staked: boolean }[]) {
  expect(serverPredMap(preds, date)).toEqual(rec[date][name]);
}

function keysDeep(o: unknown, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => keysDeep(x, acc));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { acc.push(k); keysDeep(v, acc); }
  return acc;
}
function expectNoActuals(o: unknown) {
  const bad = keysDeep(o).filter((k) => /actual|scale|source|resolved/i.test(k));
  expect(bad).toEqual([]);
}

async function snapshot() {
  return {
    players: await db.query('select id, offset_points from players order by id'),
    settlements: await db.query('select * from settlements order by round_date, player_id'),
    rounds: await db.query('select * from rounds order by target_date'),
    questions: await db.query('select id, status, actual_value, resolved_at from questions order by round_date, position'),
  };
}

/** Compare every settlement row + player offset with the independently computed expectation. */
async function verifySettled(date: string) {
  const elig = eligible[date];
  const rows = await db.query('select * from settlements where round_date = $1', [date]);
  expect(rows.length).toBe(elig.length);
  deltas[date] = {};
  for (const n of elig) {
    const exp = expectedRound(qs[date], rec[date][n]);
    const row = rows.find((r: any) => r.player_id === ids[n]) as any;
    expect(row, `${n} has settlement ${date}`).toBeTruthy();
    expect(Number(row.delta), `${n} delta ${date}`).toBe(exp.delta);
    expect(row.missed, `${n} missed ${date}`).toBe(exp.missed);
    offs[n] += exp.delta;
    expect(Number(row.offset_after), `${n} offset_after ${date}`).toBe(offs[n]);
    for (const e of exp.per) {
      const d = (row.detail as any[]).find((x) => x.questionId === e.questionId);
      expect(d, `${n} detail ${date}`).toBeTruthy();
      expect(Number(d.points)).toBe(e.points);
      expect(!!d.answered).toBe(e.answered);
    }
    deltas[date][n] = exp.delta;
  }
  for (const n of NAMES) {
    const p = await db.query('select offset_points from players where id = $1', [ids[n]]);
    expect(Number(p[0].offset_points), `${n} offset after ${date}`).toBe(offs[n]);
  }
}

async function verifyResult(date: string) {
  const elig = eligible[date];
  const playedNames = elig.filter((n) => !expectedRound(qs[date], rec[date][n]).missed);
  for (const n of elig) {
    const res = await getRoundResult(db, FINAL, ids[n], date);
    expect(res, `${n} result ${date}`).not.toBeNull();
    const exp = expectedRound(qs[date], rec[date][n]);
    expect(res!.targetDate).toBe(date);
    expect(res!.players).toBe(playedNames.length);
    const me = res!.me!;
    expect(me.delta).toBe(exp.delta);
    expect(me.missed).toBe(exp.missed);
    expect(me.played).toBe(!exp.missed);
    expect(me.offsetAfter - me.offsetBefore).toBe(me.delta);
    const settledRow = (await db.query('select offset_after, delta from settlements where player_id = $1 and round_date = $2', [ids[n], date]))[0];
    expect(me.offsetAfter).toBe(Number(settledRow.offset_after));
    expect(me.offsetBefore).toBe(Number(settledRow.offset_after) - Number(settledRow.delta));
    expect(me.displayBefore).toEqual(displayDate(date, me.offsetBefore));
    expect(me.displayAfter).toEqual(displayDate(date, me.offsetAfter));
    if (!exp.missed) {
      const lower = playedNames.filter((o) => expectedRound(qs[date], rec[date][o]).delta < exp.delta).length;
      expect(me.beatPct).toBe(Math.round((100 * lower) / playedNames.length));
    }

    expect(res!.questions.map((q) => q.position)).toEqual([1, 2, 3, 4]);
    for (const rq of res!.questions) {
      const q = qs[date][rq.position - 1];
      expect(rq.id).toBe(q.id);
      expect(rq.void).toBe(false);
      expect(rq.actual).toBe(q.actual);
      const mine = rec[date][n].get(q.position);
      const e = exp.per[q.position - 1];
      if (!mine) expect(rq.my).toBeNull();
      else {
        expect(rq.my).toEqual({ value: mine.value, staked: mine.staked, points: e.points });
      }
      // crowd statistics over everybody who answered this question
      const vals: { name: Name; value: number }[] = [];
      for (const o of elig) { const p = rec[date][o].get(q.position); if (p) vals.push({ name: o, value: p.value }); }
      expect(rq.crowd.count).toBe(vals.length);
      if (vals.length === 0) {
        expect(rq.crowd.avg).toBeNull();
        expect(rq.crowd.yesPct).toBeNull();
      } else if (q.kind === 'number') {
        const avg = vals.reduce((a, v) => a + v.value, 0) / vals.length;
        expect(rq.crowd.avg).toBeCloseTo(avg, 6);
        expect(rq.crowd.yesPct).toBeNull();
        const worst = [...vals].sort((a, b) =>
          Math.abs(b.value - q.actual) - Math.abs(a.value - q.actual) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))[0];
        expect(rq.wildest).toEqual({ nickname: worst.name, value: worst.value });
      } else {
        expect(rq.crowd.avg).toBeNull();
        expect(rq.crowd.yesPct).toBe(Math.round((100 * vals.reduce((a, v) => a + v.value, 0)) / vals.length));
        expect(rq.wildest).toBeNull();
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
describe('full game loop over several Zagreb days incl. DST change', () => {
  it('day 1 morning: three players join in different cities and read the open round', async () => {
    for (const n of ['Ana', 'Bruno', 'Cica'] as const) {
      const p = await join(n, D1_MORNING);
      expect(p.firstRound).toBe(R1);
      expect(p.offsetPoints).toBe(0);
    }
    expect(new Set([cityOf.Ana, cityOf.Bruno, cityOf.Cica]).size).toBe(3);
    const open = await getOpenRound(db, D1_MORNING, ids.Ana);
    expect(open.targetDate).toBe(R1);
    expect(open.lockAt).toBe('2027-03-26T23:00:00.000Z');
    expect(open.questions.length).toBe(4);
    expect(open.questions.map((q) => q.position)).toEqual([1, 2, 3, 4]);
    expect(open.questions.filter((q) => q.kind === 'number').length).toBe(2);
    expect(open.predictions).toEqual([]);
    expectNoActuals(open);
    for (const n of ['Bruno', 'Cica'] as const) {
      const o = await getOpenRound(db, D1_MORNING, ids[n]);
      expect(o.questions.map((q) => q.id)).toEqual(open.questions.map((q) => q.id));
    }
    qs[R1] = await loadRound(R1);
    expect(qs[R1].map((q) => q.id)).toEqual(open.questions.map((q) => q.id));
  });

  it('day 1: players predict in different ways', async () => {
    // Ana answers all four, first stakes pos 4, then moves the stake to pos 2 (only one stake allowed).
    await put('Ana', R1, 1, 'bad', false, D1_MORNING);
    await put('Ana', R1, 2, 'mid', false, D1_MORNING);
    await put('Ana', R1, 3, 'good', false, D1_MORNING);
    await put('Ana', R1, 4, 'good', true, D1_MORNING);
    await put('Ana', R1, 2, 'mid', true, D1_MORNING);
    // Bruno answers only two questions and stakes one of them.
    await put('Bruno', R1, 1, 'bad', false, D1_MORNING);
    await put('Bruno', R1, 3, 'mid', true, D1_MORNING);
    // Cica answers nothing.
    const oa = await getOpenRound(db, D1_MORNING, ids.Ana);
    await expectPredictionsMatch('Ana', R1, oa.predictions);
    expect(oa.predictions.filter((p) => p.staked).length).toBe(1);
    expect(rec[R1].Ana.get(4)!.staked).toBe(false);
    const ob = await getOpenRound(db, D1_MORNING, ids.Bruno);
    await expectPredictionsMatch('Bruno', R1, ob.predictions);
    expect((await getOpenRound(db, D1_MORNING, ids.Cica)).predictions).toEqual([]);
  });

  it('day 1 23:59:59 round is still open (change allowed); invalid values are still rejected', async () => {
    await put('Ana', R1, 1, 'good', false, D1_2359);
    const bad = await savePrediction(db, D1_2359, ids.Ana, { questionId: qs[R1][2].id, value: 1e9, staked: false }); // out of range for any question
    expect(bad).toEqual({ ok: false, error: 'invalid_value' });
    const open = await getOpenRound(db, D1_2359, ids.Ana);
    expect(open.targetDate).toBe(R1);
    await expectPredictionsMatch('Ana', R1, open.predictions);
    savedRound1 = JSON.stringify([...rec[R1].Ana.entries()]);
  });

  it('day 2 00:00:00/00:00:01 the round is locked: writes refused, predictions unchanged, pending shows them', async () => {
    for (const now of [D1_LOCK, D1_LOCK_1S]) {
      const r = await savePrediction(db, now, ids.Bruno, { questionId: qs[R1][1].id, value: guess(qs[R1][1], 'good'), staked: false });
      expect(r).toEqual({ ok: false, error: 'locked' });
      // even a stake move on an existing prediction is refused
      const s = await savePrediction(db, now, ids.Ana, { questionId: qs[R1][0].id, value: guess(qs[R1][0], 'bad'), staked: true });
      expect(s).toEqual({ ok: false, error: 'locked' });
    }
    expect(JSON.stringify([...rec[R1].Ana.entries()])).toBe(savedRound1);
    for (const n of ['Ana', 'Bruno', 'Cica'] as const) {
      const pend = await getPendingRound(db, D1_LOCK_1S, ids[n]);
      expect(pend.targetDate).toBe(R1);
      expect(pend.settled).toBe(false);
      expect(pend.settleAt).toBe('2027-03-27T19:00:00.000Z');
      expect(pend.questions.map((q) => q.id)).toEqual(qs[R1].map((q) => q.id));
      await expectPredictionsMatch(n, R1, pend.predictions);
      expectNoActuals(pend);
    }
    // the open round is now the next one
    const open = await getOpenRound(db, D1_LOCK_1S, ids.Ana);
    expect(open.targetDate).toBe(R2);
    expect(open.lockAt).toBe('2027-03-27T23:00:00.000Z');
    expectNoActuals(open);
  });

  it('day 2 morning: a fourth player joins; everybody can read round 2 and predict it', async () => {
    const p = await join('Dino', D2_MORNING);
    expect(p.firstRound).toBe(R2);
    const open = await getOpenRound(db, D2_MORNING, ids.Dino);
    expect(open.targetDate).toBe(R2);
    expect(open.questions.length).toBe(4);
    qs[R2] = await loadRound(R2);
    expect(qs[R2].map((q) => q.id)).toEqual(open.questions.map((q) => q.id));
    // Round 1 is pending for Dino but he is not part of it.
    const pend = await getPendingRound(db, D2_MORNING, ids.Dino);
    expect(pend.targetDate).toBe(R1);
    expect(pend.predictions).toEqual([]);
    // Round 2 predictions
    const plan: Record<string, [number, Mode][]> = {
      Ana: [[1, 'mid'], [2, 'good'], [3, 'bad'], [4, 'good']],
      Bruno: [[1, 'bad'], [3, 'good']],
      Cica: [],
      Dino: [[1, 'mid'], [2, 'mid'], [3, 'mid'], [4, 'mid']],
    };
    const stake: Record<string, number | null> = { Ana: 2, Bruno: null, Cica: null, Dino: 2 };
    for (const n of NAMES) for (const [pos, mode] of plan[n]) await put(n, R2, pos, mode, stake[n] === pos, D2_MORNING);
    for (const n of ['Ana', 'Dino'] as const) {
      const o = await getOpenRound(db, D2_MORNING, ids[n]);
      await expectPredictionsMatch(n, R2, o.predictions);
      expectNoActuals(o);
    }
  });

  it('round 1: settle before 20:00 -> tooEarly (nothing changes); at 20:00 -> settled', async () => {
    expect(await getRoundResult(db, R1_TOO_EARLY, ids.Ana, R1)).toBeNull();
    const before = await snapshot();
    expect(await settleRound(db, R1_TOO_EARLY, R1)).toEqual({ tooEarly: true });
    expect(await snapshot()).toEqual(before);
    expect(await getRoundResult(db, R1_TOO_EARLY, ids.Ana)).toBeNull();

    const r = await settleRound(db, R1_SETTLE, R1);
    expect(r).toEqual({ settled: true, players: 3, voided: 0 });
  });

  it('round 1: deltas, stake doubling, missed = -1, late joiner has no settlement', async () => {
    await verifySettled(R1);
    expect(deltas[R1].Cica).toBe(-1);
    const dino = await db.query('select 1 from settlements where player_id = $1 and round_date = $2', [ids.Dino, R1]);
    expect(dino.length).toBe(0);
    expect(offs.Dino).toBe(0);
    // staked doubling really happened for Ana's staked question (pos 2) and Bruno's (pos 3)
    const exp = expectedRound(qs[R1], rec[R1].Ana);
    const q2 = qs[R1][1];
    const unstaked = pointsFor(q2, { ...rec[R1].Ana.get(2)!, staked: false }).points;
    expect(exp.per[1].points).toBe(unstaked * 2);
    // Ana's other answers are not staked
    expect(rec[R1].Ana.get(4)!.staked).toBe(false);
    const row = (await db.query('select detail from settlements where player_id = $1 and round_date = $2', [ids.Ana, R1]))[0];
    expect((row.detail as any[]).filter((d) => d.staked).length).toBe(1);
  });

  it('round 1: settling again changes nothing', async () => {
    const before = await snapshot();
    expect(await settleRound(db, R1_SETTLE, R1)).toEqual({ alreadySettled: true });
    expect(await settleRound(db, at('2027-03-28T10:00:00Z'), R1)).toEqual({ alreadySettled: true });
    expect(await snapshot()).toEqual(before);
  });

  it('round 1: getRoundResult per player is consistent with settlements and crowd stats', async () => {
    await verifyResult(R1);
    // late joiner: no personal result for round 1, but crowd data is there
    const res = await getRoundResult(db, FINAL, ids.Dino, R1);
    expect(res!.me).toBeNull();
    expect(res!.questions.every((q) => q.my === null)).toBe(true);
    // default = latest settled round
    expect((await getRoundResult(db, FINAL, ids.Ana))!.targetDate).toBe(R1);
    // unsettled rounds have no result
    expect(await getRoundResult(db, FINAL, ids.Ana, R2)).toBeNull();
  });

  it('day 3 (DST Sunday): round 2 is locked, pending shows predictions; round 3 is open', async () => {
    const stale = await savePrediction(db, D3_MORNING, ids.Dino, { questionId: qs[R2][0].id, value: guess(qs[R2][0], 'good'), staked: false });
    expect(stale).toEqual({ ok: false, error: 'locked' });
    const pend = await getPendingRound(db, D3_MORNING, ids.Ana);
    expect(pend.targetDate).toBe(R2);
    expect(pend.settled).toBe(false);
    expect(pend.settleAt).toBe('2027-03-28T18:00:00.000Z'); // 20:00 CEST
    await expectPredictionsMatch('Ana', R2, pend.predictions);
    expectNoActuals(pend);

    const open = await getOpenRound(db, D3_MORNING, ids.Ana);
    expect(open.targetDate).toBe(R3);
    expect(open.lockAt).toBe('2027-03-28T22:00:00.000Z'); // Zagreb midnight is UTC+2 now
    expectNoActuals(open);
    qs[R3] = await loadRound(R3);
    const plan: Record<string, [number, Mode][]> = {
      Ana: [[1, 'good'], [2, 'bad'], [3, 'mid'], [4, 'mid']],
      Bruno: [[2, 'good'], [4, 'bad']],
      Cica: [[4, 'good']],
      Dino: [[1, 'bad'], [2, 'bad'], [3, 'good'], [4, 'good']],
    };
    const stake: Record<string, number | null> = { Ana: 3, Bruno: 2, Cica: null, Dino: 4 };
    for (const n of NAMES) for (const [pos, mode] of plan[n]) await put(n, R3, pos, mode, stake[n] === pos, D3_MORNING);
  });

  it('admin flow for a future round: generate, reject a main question, still four, approveAll', async () => {
    const gen = await generate(db, D3_NOON, R4);
    expect(gen.questions.length).toBe(8);
    expect(gen.questions.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(gen.questions.every((q) => q.status === 'proposed')).toBe(true);
    const first = gen.questions[0];
    const spare5 = gen.questions[4];
    const [, q2, q3, q4] = gen.questions;
    // proposals are not visible to players before the round opens
    expect((await getPendingRound(db, D3_NOON, ids.Ana)).targetDate).toBe(R2);

    const rej = await reject(db, D3_NOON, first.id);
    expect(rej).toEqual({ ok: true, targetDate: R4 });
    const rows = await db.query(`select id, position, status from questions where round_date = $1 order by position`, [R4]);
    const live = rows.filter((r: any) => Number(r.position) >= 1 && Number(r.position) <= 4);
    expect(live.map((r: any) => Number(r.position))).toEqual([1, 2, 3, 4]);
    expect(live.every((r: any) => r.status !== 'rejected')).toBe(true);
    expect(live.map((r: any) => r.id)).toEqual([spare5.id, q2.id, q3.id, q4.id]);
    expect(rows.find((r: any) => r.id === first.id).status).toBe('rejected');
    expect(Number(rows.find((r: any) => r.id === first.id).position)).toBeGreaterThan(4);

    const approved = await approveAll(db, R4);
    const main = approved.questions.filter((q) => q.position <= 4);
    expect(main.map((q) => q.id)).toEqual([spare5.id, q2.id, q3.id, q4.id]);
    expect(main.every((q) => q.status === 'approved')).toBe(true);
    expect((await listProposals(db, R4)).questions.find((q) => q.id === first.id)!.status).toBe('rejected');
    // approved set is exactly what players get later (checked on day 4)
  });

  it('round 3 stays open until 23:59:59 CEST (stake can still move), locked at 00:00:01', async () => {
    await put('Ana', R3, 2, 'bad', true, D3_2359); // moves Ana's stake from pos 3 to pos 2
    expect(rec[R3].Ana.get(3)!.staked).toBe(false);
    const o = await getOpenRound(db, D3_2359, ids.Ana);
    await expectPredictionsMatch('Ana', R3, o.predictions);
    const late = await savePrediction(db, D3_LOCK_1S, ids.Ana, { questionId: qs[R3][0].id, value: guess(qs[R3][0], 'bad'), staked: false });
    expect(late).toEqual({ ok: false, error: 'locked' });
    await expectPredictionsMatch('Ana', R3, (await getPendingRound(db, D3_LOCK_1S, ids.Ana)).predictions);
  });

  it('round 2: tooEarly at 19:59:59 CEST, settled at 20:00 CEST (DST-correct), values verified', async () => {
    const before = await snapshot();
    expect(await settleRound(db, R2_TOO_EARLY, R2)).toEqual({ tooEarly: true });
    expect(await snapshot()).toEqual(before);
    expect(await settleRound(db, R2_SETTLE, R2)).toEqual({ settled: true, players: 4, voided: 0 });
    await verifySettled(R2);
    expect(deltas[R2].Cica).toBe(-1);
    expect(offs.Cica).toBe(-2); // two missed rounds accumulate
    expect(offs.Ana).toBe(deltas[R1].Ana + deltas[R2].Ana);
    expect(offs.Dino).toBe(deltas[R2].Dino); // Dino's first settlement
    const pend = await getPendingRound(db, R2_SETTLE, ids.Ana);
    expect(pend.settled).toBe(true);
    const snap = await snapshot();
    expect(await settleRound(db, R2_SETTLE, R2)).toEqual({ alreadySettled: true });
    expect(await snapshot()).toEqual(snap);
    await verifyResult(R2);
    // latest settled result is now round 2, with offsets continuing from round 1
    const ana = (await getRoundResult(db, FINAL, ids.Ana))!;
    expect(ana.targetDate).toBe(R2);
    expect(ana.me!.offsetBefore).toBe(deltas[R1].Ana);
    expect(ana.me!.offsetAfter).toBe(offs.Ana);
  });

  it('day 4: the admin-approved set is what players get when round R4 opens; round 3 settles', async () => {
    const open = await getOpenRound(db, D4_MORNING, ids.Bruno);
    expect(open.targetDate).toBe(R4);
    const approved = (await listProposals(db, R4)).questions.filter((q) => q.position <= 4 && q.status === 'approved');
    expect(open.questions.map((q) => q.id)).toEqual(approved.map((q) => q.id));
    expect(open.questions.length).toBe(4);
    const rejectedIds = (await db.query(`select id from questions where round_date = $1 and status = 'rejected'`, [R4])).map((r: any) => r.id);
    expect(rejectedIds.length).toBe(1);
    expect(open.questions.map((q) => q.id)).not.toContain(rejectedIds[0]);
    expectNoActuals(open);

    expect(await settleRound(db, R3_TOO_EARLY, R3)).toEqual({ tooEarly: true });
    expect(await settleRound(db, R3_SETTLE, R3)).toEqual({ settled: true, players: 4, voided: 0 });
    await verifySettled(R3);
    // offsets accumulate over three rounds
    expect(offs.Ana).toBe(deltas[R1].Ana + deltas[R2].Ana + deltas[R3].Ana);
    expect(offs.Bruno).toBe(deltas[R1].Bruno + deltas[R2].Bruno + deltas[R3].Bruno);
    expect(offs.Cica).toBe(-1 - 1 + deltas[R3].Cica);
    expect(offs.Dino).toBe(deltas[R2].Dino + deltas[R3].Dino);
    const snap = await snapshot();
    expect(await settleRound(db, FINAL, R3)).toEqual({ alreadySettled: true });
    expect(await snapshot()).toEqual(snap);
    await verifyResult(R3);
    expect((await getRoundResult(db, FINAL, ids.Dino))!.targetDate).toBe(R3);
    // earlier results are unchanged by later settlements
    await verifyResult(R1);
    await verifyResult(R2);
  });

  it('cityLeaderboard and a league table reflect the final offsets', async () => {
    const today = '2027-03-29';
    const { cities } = await cityLeaderboard(db, FINAL);
    const byCity = new Map<number, Name[]>();
    for (const n of NAMES) byCity.set(cityOf[n], [...(byCity.get(cityOf[n]) ?? []), n]);
    expect(cities.length).toBe(byCity.size);
    for (const [cityId, members] of byCity) {
      const row = cities.find((c) => c.cityId === cityId)!;
      expect(row.players).toBe(members.length);
      const avg = Math.round(members.reduce((a, n) => a + offs[n], 0) / members.length);
      expect(row.avgOffset).toBe(avg);
      expect(row.displayYear).toBe(displayDate(today, avg).year);
    }
    for (let i = 1; i < cities.length; i++) expect(cities[i - 1].avgOffset).toBeGreaterThanOrEqual(cities[i].avgOffset);

    const created = await createLeague(db, ids.Ana, 'Flow league');
    if (!created.ok) throw new Error(created.error);
    for (const n of ['Bruno', 'Cica', 'Dino']) expect(await joinLeague(db, ids[n], created.league.code.toLowerCase())).not.toBeNull();
    const table = (await leagueTable(db, FINAL, created.league.code, ids.Cica))!;
    expect(table.table.length).toBe(4);
    const expectedOrder = [...NAMES].sort((a, b) => offs[b] - offs[a] || a.toLowerCase().localeCompare(b.toLowerCase()));
    expect(table.table.map((r) => r.nickname)).toEqual(expectedOrder);
    for (const r of table.table) {
      expect(r.offsetPoints).toBe(offs[r.nickname]);
      expect(r.displayYear).toBe(displayDate(today, offs[r.nickname]).year);
      expect(r.isMe).toBe(r.nickname === 'Cica');
    }
    expect(table.table.map((r) => r.cityName).every(Boolean)).toBe(true);
  });
});
