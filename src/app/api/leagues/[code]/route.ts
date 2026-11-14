import { getContext, json, error } from '@/lib/server';
import { leagueTable } from '@/lib/services/leaderboard';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { db, now, player } = await getContext();
  if (!player) return error('no_player', 401);
  const { code } = await ctx.params;
  const table = await leagueTable(db, now, code, player.id);
  if (!table) return error('league_not_found', 404);
  return json(table);
}
