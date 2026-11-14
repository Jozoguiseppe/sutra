import { getContext, json, error, setPlayerCookie } from '@/lib/server';
import { createPlayer, toMe } from '@/lib/services/players';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { body = null; }
  const { db, now } = await getContext();
  const res = await createPlayer(db, now, { nickname: body?.nickname, cityId: body?.cityId });
  if (!res.ok) return error(res.error, res.error === 'nickname_taken' ? 409 : 400);
  await setPlayerCookie(res.token);
  return json(toMe(res.player, now), 201);
}
