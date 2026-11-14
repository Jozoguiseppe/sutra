import { createHash, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/db';
import { getNow } from '@/lib/now';
import { error, json } from '@/lib/server';
import { generateProposals } from '@/lib/services/questions';
import { getOpenRound } from '@/lib/services/rounds';
import { addDays, zagrebDate, zagrebHour } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sha = (s: string) => createHash('sha256').update(s).digest();

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization') ?? '';
  return timingSafeEqual(sha(header), sha(`Bearer ${secret}`));
}

/** From 18:00 Zagreb: propose questions for round today+2. Idempotent (no-op if the round already has questions). */
export async function GET(request: Request) {
  if (!authorized(request)) return error('unauthorized', 401);
  const now = getNow();
  if (zagrebHour(now) < 18) return json({ skipped: 'too_early' });
  const db = await getDb();
  const date = addDays(zagrebDate(now), 2);
  const { created } = await generateProposals(db, now, date);
  // Safety net: make sure the round that is open right now has an approved set even if nobody has
  // opened the app yet, so it can be settled tomorrow (and skipped days still cost -1).
  let openRound: string | null = null;
  try {
    openRound = (await getOpenRound(db, now)).targetDate;
  } catch {
    openRound = null;
  }
  return json({ date, created, openRound });
}
