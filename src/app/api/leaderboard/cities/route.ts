import { getContext, json } from '@/lib/server';
import { cityLeaderboard } from '@/lib/services/leaderboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db, now } = await getContext();
  return json(await cityLeaderboard(db, now));
}
