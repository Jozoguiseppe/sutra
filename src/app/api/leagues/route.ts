import { getContext, json, error } from '@/lib/server';
import { createLeague, myLeagues } from '@/lib/services/leaderboard';
import type { MyLeaguesResponse } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db, player } = await getContext();
  if (!player) return error('no_player', 401);
  const res: MyLeaguesResponse = { leagues: await myLeagues(db, player.id) };
  return json(res);
}

export async function POST(req: Request) {
  const { db, player } = await getContext();
  if (!player) return error('no_player', 401);
  const body = await req.json().catch(() => null);
  const r = await createLeague(db, player.id, body?.name);
  if (!r.ok) return error(r.error, 400);
  return json(r.league, 201);
}
