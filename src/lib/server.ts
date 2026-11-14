import { cookies } from 'next/headers';
import { getDb, type Db } from './db';
import { getNow } from './now';
import { getPlayerByToken, type Player } from './services/players';

export const COOKIE_NAME = 'sutra_token';

export interface Context { db: Db; now: Date; player: Player | null }

export async function getContext(): Promise<Context> {
  const db = await getDb();
  const now = getNow();
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const player = token ? await getPlayerByToken(db, token) : null;
  return { db, now, player };
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function error(code: string, status: number): Response {
  return json({ error: code }, status);
}

export async function setPlayerCookie(token: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
