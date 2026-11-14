import { getContext, json, error } from '@/lib/server';
import { toMe } from '@/lib/services/players';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { now, player } = await getContext();
  if (!player) return error('no_player', 401);
  return json(toMe(player, now));
}
