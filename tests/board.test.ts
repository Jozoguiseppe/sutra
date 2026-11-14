import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/lib/db';
import { createPlayer } from '@/lib/services/players';
import { cityLeaderboard, createLeague, joinLeague, leagueTable, myLeagues } from '@/lib/services/leaderboard';
import { approveAll, generate, listProposals, reject } from '@/lib/services/admin';
import { displayDate } from '@/lib/scoring';

const NOW = new Date('2026-11-14T10:00:00Z'); // 11:00 Zagreb
const T = '2026-11-16'; // round two days ahead: not yet open at NOW

let db: Db;
let cities: number[];
beforeEach(async () => {
  db = await createTestDb();
  cities = (await db.query('select id from cities order by id limit 3')).map((r: any) => Number(r.id));
});

async function mk(nickname: string, cityId: number, offset = 0) {
  const r = await createPlayer(db, NOW, { nickname, cityId });
  if (!r.ok) throw new Error(r.error);
  await db.query('update players set offset_points = $2 where id = $1', [r.player.id, offset]);
  return r.player;
}

describe('city leaderboard', () => {
  it('averages, counts, orders, skips empty cities', async () => {
    await mk('Aaa', cities[0], 10);
    await mk('Bbb', cities[0], 21); // avg 15.5 -> 16
    await mk('Ccc', cities[1], 40);
    const { cities: board } = await cityLeaderboard(db, NOW);
    expect(board.map((c) => c.cityId)).toEqual([cities[1], cities[0]]);
    expect(board[0]).toMatchObject({ players: 1, avgOffset: 40 });
    expect(board[1]).toMatchObject({ players: 2, avgOffset: 16 });
    expect(board[1].displayYear).toBe(displayDate('2026-11-14', 16).year);
    expect(board[0].cityName).toBeTruthy();
    expect(board[0].countyName).toBeTruthy();
  });
});

describe('leagues', () => {
  it('creates, joins, tables with isMe', async () => {
    const a = await mk('Alpha', cities[0], 5);
    const b = await mk('Bravo', cities[1], 50);
    const c = await createLeague(db, a.id, '  Prijatelji ');
    if (!c.ok) throw new Error('create failed');
    expect(c.league).toMatchObject({ name: 'Prijatelji', members: 1 });
    expect(c.league.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const j = await joinLeague(db, b.id, c.league.code.toLowerCase());
    expect(j).toEqual({ ...c.league, members: 2 });
    expect((await joinLeague(db, b.id, c.league.code))?.members).toBe(2); // duplicate join ok

    const t = await leagueTable(db, NOW, c.league.code, b.id);
    expect(t!.table.map((r) => r.nickname)).toEqual(['Bravo', 'Alpha']);
    expect(t!.table.map((r) => r.isMe)).toEqual([true, false]);
    expect((await leagueTable(db, NOW, c.league.code, null))!.table.some((r) => r.isMe)).toBe(false);
    expect(await myLeagues(db, b.id)).toEqual([{ ...c.league, members: 2 }]);
  });

  it('rejects bad names and unknown codes', async () => {
    const a = await mk('Alpha', cities[0]);
    expect(await createLeague(db, a.id, 'ab')).toEqual({ ok: false, error: 'name_invalid' });
    expect(await createLeague(db, a.id, 'x'.repeat(31))).toEqual({ ok: false, error: 'name_invalid' });
    expect(await joinLeague(db, a.id, 'ZZZZZZ')).toBeNull();
    expect(await leagueTable(db, NOW, 'ZZZZZZ', a.id)).toBeNull();
    expect(await myLeagues(db, a.id)).toEqual([]);
  });
});

describe('admin', () => {
  it('generate + approveAll approves positions 1-4 only', async () => {
    const g = await generate(db, NOW, T);
    expect(g.questions).toHaveLength(8);
    expect(g.questions.every((q) => q.status === 'proposed')).toBe(true);
    expect(JSON.stringify(g)).not.toContain('actual');
    const r = await approveAll(db, T);
    expect(r.questions.filter((q) => q.status === 'approved').map((q) => q.position)).toEqual([1, 2, 3, 4]);
    expect((await db.query('select status from rounds where target_date = $1', [T]))[0].status).toBe('ready');
  });

  it('reject promotes a spare, keeping four live questions in 1-4', async () => {
    await generate(db, NOW, T);
    await approveAll(db, T);
    const before = await listProposals(db, T);
    const victim = before.questions.find((q) => q.position === 2)!;
    const spare = before.questions.find((q) => q.position === 5)!;
    const r = await reject(db, NOW, victim.id);
    expect(r).toEqual({ ok: true, targetDate: T });
    const after = (await listProposals(db, T)).questions;
    const top = after.filter((q) => q.position <= 4);
    expect(top).toHaveLength(4);
    expect(top.map((q) => q.position)).toEqual([1, 2, 3, 4]);
    expect(top.every((q) => q.status === 'approved')).toBe(true);
    expect(top.find((q) => q.position === 2)!.id).toBe(spare.id);
    expect(after.find((q) => q.id === victim.id)!.status).toBe('rejected');
    expect(after.find((q) => q.id === victim.id)!.position).toBeGreaterThan(4);
  });

  it('reject of a proposed question promotes a proposed spare', async () => {
    await generate(db, NOW, T);
    const q1 = (await listProposals(db, T)).questions[0];
    await reject(db, NOW, q1.id);
    const top = (await listProposals(db, T)).questions.filter((q) => q.position <= 4);
    expect(top.every((q) => q.status === 'proposed')).toBe(true);
    expect(top).toHaveLength(4);
  });

  it('refuses to reject once the round is open', async () => {
    const OPEN_T = '2026-11-15'; // open at NOW (predictions allowed)
    await generate(db, NOW, OPEN_T);
    await approveAll(db, OPEN_T);
    const q = (await listProposals(db, OPEN_T)).questions[0];
    expect(await reject(db, NOW, q.id)).toEqual({ ok: false, error: 'round_open' });
    expect((await listProposals(db, OPEN_T)).questions.find((x) => x.id === q.id)!.status).toBe('approved');
    expect(await reject(db, NOW, '00000000-0000-0000-0000-000000000000')).toEqual({ ok: false, error: 'question_not_found' });
  });
});
