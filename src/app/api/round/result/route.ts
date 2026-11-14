import { error, getContext, json } from '@/lib/server';
import { getRoundResult } from '@/lib/services/results';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { db, now, player } = await getContext();
  const date = new URL(request.url).searchParams.get('date') ?? undefined;
  const result = await getRoundResult(db, now, player?.id ?? null, date);
  if (!result) return error('no_result', 404);
  return json(result);
}
