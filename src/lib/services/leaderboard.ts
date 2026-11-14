import { randomInt } from 'node:crypto';
import type { Db } from '../db';
import type { CityBoardResponse, LeagueRef, LeagueTableResponse } from '../api-types';
import { displayDate } from '../scoring';
import { zagrebDate } from '../time';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I
const CODE_LEN = 6;

export async function cityLeaderboard(db: Db, now: Date): Promise<CityBoardResponse> {
  const rows = await db.query(
    `select c.id as city_id, c.name as city_name, co.name as county_name,
            count(p.id) as players, avg(p.offset_points) as avg_offset
     from cities c join counties co on co.id = c.county_id join players p on p.city_id = c.id
     group by c.id, c.name, co.name`,
  );
  const today = zagrebDate(now);
  const cities = rows.map((r: any) => {
    const avgOffset = Math.round(Number(r.avg_offset));
    return {
      cityId: Number(r.city_id), cityName: r.city_name as string, countyName: r.county_name as string,
      players: Number(r.players), avgOffset, displayYear: displayDate(today, avgOffset).year,
    };
  });
  cities.sort((a, b) => b.avgOffset - a.avgOffset || b.players - a.players || a.cityName.localeCompare(b.cityName));
  return { cities };
}

function randomCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

async function refFor(db: Db, leagueId: string): Promise<LeagueRef> {
  const r = await db.query(
    `select l.code, l.name, (select count(*) from league_members m where m.league_id = l.id) as members
     from leagues l where l.id = $1`,
    [leagueId],
  );
  return { code: r[0].code, name: r[0].name, members: Number(r[0].members) };
}

export type CreateLeagueResult = { ok: true; league: LeagueRef } | { ok: false; error: 'name_invalid' };

export async function createLeague(db: Db, playerId: string, rawName: unknown): Promise<CreateLeagueResult> {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const len = [...name].length;
  if (len < 3 || len > 30) return { ok: false, error: 'name_invalid' };

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode();
    const leagueId = await db.tx(async (t) => {
      const ins = await t.query<{ id: string }>(
        `insert into leagues (code, name, owner_id) values ($1, $2, $3) on conflict (code) do nothing returning id`,
        [code, name, playerId],
      );
      if (ins.length === 0) return null;
      await t.query('insert into league_members (league_id, player_id) values ($1, $2)', [ins[0].id, playerId]);
      return ins[0].id;
    });
    if (leagueId) return { ok: true, league: await refFor(db, leagueId) };
  }
  throw new Error('could not allocate league code');
}

/** Returns null when no league has that code (case-insensitive). Joining twice is a no-op. */
export async function joinLeague(db: Db, playerId: string, rawCode: unknown): Promise<LeagueRef | null> {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!code) return null;
  const l = await db.query<{ id: string }>('select id from leagues where code = $1', [code]);
  if (l.length === 0) return null;
  await db.query(
    'insert into league_members (league_id, player_id) values ($1, $2) on conflict do nothing',
    [l[0].id, playerId],
  );
  return refFor(db, l[0].id);
}

export async function myLeagues(db: Db, playerId: string): Promise<LeagueRef[]> {
  const rows = await db.query(
    `select l.code, l.name, (select count(*) from league_members x where x.league_id = l.id) as members
     from leagues l join league_members m on m.league_id = l.id
     where m.player_id = $1 order by l.created_at, l.name`,
    [playerId],
  );
  return rows.map((r: any) => ({ code: r.code, name: r.name, members: Number(r.members) }));
}

/** null when the league does not exist. */
export async function leagueTable(db: Db, now: Date, rawCode: string, playerId: string | null): Promise<LeagueTableResponse | null> {
  const code = String(rawCode ?? '').trim().toUpperCase();
  const l = await db.query<{ id: string; code: string; name: string }>('select id, code, name from leagues where code = $1', [code]);
  if (l.length === 0) return null;
  const rows = await db.query(
    `select p.id, p.nickname, c.name as city_name, p.offset_points
     from league_members m join players p on p.id = m.player_id join cities c on c.id = p.city_id
     where m.league_id = $1 order by p.offset_points desc, p.nickname_lower`,
    [l[0].id],
  );
  const today = zagrebDate(now);
  return {
    code: l[0].code, name: l[0].name,
    table: rows.map((r: any) => ({
      nickname: r.nickname, cityName: r.city_name, offsetPoints: Number(r.offset_points),
      displayYear: displayDate(today, Number(r.offset_points)).year, isMe: playerId !== null && r.id === playerId,
    })),
  };
}
