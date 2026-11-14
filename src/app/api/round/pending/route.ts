import { getContext, json } from '@/lib/server';
import { getPendingRound } from '@/lib/services/rounds';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { db, now, player } = await getContext();
  return json(await getPendingRound(db, now, player?.id));
}
