import { getContext, json, error } from '@/lib/server';
import { joinLeague } from '@/lib/services/leaderboard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { db, player } = await getContext();
  if (!player) return error('no_player', 401);
  const body = await req.json().catch(() => null);
  const league = await joinLeague(db, player.id, body?.code);
  if (!league) return error('league_not_found', 404);
  return json(league);
}
