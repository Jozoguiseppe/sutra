import { createHash, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/db';
import { getNow } from '@/lib/now';
import { error, json } from '@/lib/server';
import { settleRound } from '@/lib/services/settle';
import { zagrebDate, zagrebHour } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sha = (s: string) => createHash('sha256').update(s).digest();

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization') ?? '';
  return timingSafeEqual(sha(header), sha(`Bearer ${secret}`));
}

/** Settles today's round once it is 20:00 in Zagreb, plus any earlier round still waiting (catch-up, oldest first). */
export async function GET(request: Request) {
  if (!authorized(request)) return error('unauthorized', 401);
  const db = await getDb();
  const now = getNow();
  const today = zagrebDate(now);

  const due = await db.query<{ target_date: string }>(
    `select target_date from rounds where status = 'ready' and target_date <= $1 order by target_date`,
    [today],
  );
  const results: Record<string, unknown> = {};
  for (const { target_date: date } of due) {
    if (date === today && zagrebHour(now) < 20) {
      results[date] = { tooEarly: true };
      continue;
    }
    try {
      results[date] = await settleRound(db, now, date);
    } catch (e) {
      console.error('settleRound failed', date, e);
      results[date] = { error: 'settle_failed' };
      // Later rounds depend on this one's offsets: stop here, the next run retries.
      return json({ now: now.toISOString(), results }, 500);
    }
  }
  return json({ now: now.toISOString(), results });
}
