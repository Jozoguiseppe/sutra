import { getContext, json, error } from '@/lib/server';
import { savePrediction } from '@/lib/services/rounds';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const { db, now, player } = await getContext();
  if (!player) return error('no_player', 401);
  let body: any;
  try { body = await req.json(); } catch { return error('invalid_value', 400); }
  if (!body || typeof body.questionId !== 'string' || typeof body.value !== 'number') return error('invalid_value', 400);
  const res = await savePrediction(db, now, player.id, { questionId: body.questionId, value: body.value, staked: body.staked === true });
  if (!res.ok) return error(res.error, res.error === 'locked' ? 409 : res.error === 'question_not_found' ? 404 : 400);
  return json({ predictions: res.predictions });
}
