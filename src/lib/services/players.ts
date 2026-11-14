import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';
import type { MeResponse } from '../api-types';
import { openRoundDate, zagrebDate } from '../time';
import { displayDate } from '../scoring';

export interface Player {
  id: string; nickname: string; cityId: number; cityName: string; offsetPoints: number; firstRound: string;
}

export type CreatePlayerError = 'nickname_short' | 'nickname_long' | 'nickname_invalid' | 'city_invalid' | 'nickname_taken';
export type CreatePlayerResult =
  | { ok: true; player: Player; token: string }
  | { ok: false; error: CreatePlayerError };

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const NICK_RE = /^[\p{L}\p{N} _-]+$/u;

const PLAYER_SQL = `select p.id, p.nickname, p.city_id, c.name as city_name, p.offset_points, p.first_round
  from players p join cities c on c.id = p.city_id`;

function mapPlayer(r: any): Player {
  return { id: r.id, nickname: r.nickname, cityId: Number(r.city_id), cityName: r.city_name, offsetPoints: Number(r.offset_points), firstRound: r.first_round };
}

export function validateNickname(raw: unknown): { ok: true; nickname: string } | { ok: false; error: CreatePlayerError } {
  const nickname = typeof raw === 'string' ? raw.trim() : '';
  const len = [...nickname].length;
  if (len < 3) return { ok: false, error: 'nickname_short' };
  if (len > 20) return { ok: false, error: 'nickname_long' };
  if (!NICK_RE.test(nickname)) return { ok: false, error: 'nickname_invalid' };
  return { ok: true, nickname };
}

export async function createPlayer(db: Db, now: Date, input: { nickname: unknown; cityId: unknown }): Promise<CreatePlayerResult> {
  const v = validateNickname(input.nickname);
  if (!v.ok) return v;
  const cityId = typeof input.cityId === 'number' ? input.cityId : NaN;
  if (!Number.isInteger(cityId)) return { ok: false, error: 'city_invalid' };
  const city = await db.query('select id from cities where id = $1', [cityId]);
  if (city.length === 0) return { ok: false, error: 'city_invalid' };

  const lower = v.nickname.toLowerCase();
  const taken = await db.query('select 1 from players where nickname_lower = $1', [lower]);
  if (taken.length) return { ok: false, error: 'nickname_taken' };

  const token = randomBytes(32).toString('base64url');
  let id: string;
  try {
    const rows = await db.query<{ id: string }>(
      `insert into players (nickname, nickname_lower, city_id, token_hash, first_round)
       values ($1, $2, $3, $4, $5) returning id`,
      [v.nickname, lower, cityId, hashToken(token), openRoundDate(now)],
    );
    id = rows[0].id;
  } catch (e: any) {
    if (e?.code === '23505' || /unique|duplicate/i.test(String(e?.message))) return { ok: false, error: 'nickname_taken' };
    throw e;
  }
  const rows = await db.query(`${PLAYER_SQL} where p.id = $1`, [id]);
  return { ok: true, player: mapPlayer(rows[0]), token };
}

export async function getPlayerByToken(db: Db, token: string | null | undefined): Promise<Player | null> {
  if (!token) return null;
  const rows = await db.query(`${PLAYER_SQL} where p.token_hash = $1`, [hashToken(token)]);
  return rows.length ? mapPlayer(rows[0]) : null;
}

export function toMe(player: Player, now: Date): MeResponse {
  const today = zagrebDate(now);
  return {
    player: { id: player.id, nickname: player.nickname, cityId: player.cityId, cityName: player.cityName, offsetPoints: player.offsetPoints },
    today,
    display: displayDate(today, player.offsetPoints),
  };
}
