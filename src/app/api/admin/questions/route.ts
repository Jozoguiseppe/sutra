import { timingSafeEqual } from 'node:crypto';
import { getContext, json, error } from '@/lib/server';
import { addDays, zagrebDate } from '@/lib/time';
import { approveAll, generate, listProposals, reject } from '@/lib/services/admin';

export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const got = req.headers.get('x-admin-token') ?? '';
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: unknown): d is string => typeof d === 'string' && DATE_RE.test(d) && addDays(d, 0) === d;

export async function GET(req: Request) {
  if (!authorized(req)) return error('bad_token', 401);
  const { db, now } = await getContext();
  const q = new URL(req.url).searchParams.get('date');
  if (q !== null && !validDate(q)) return error('invalid_date', 400);
  return json(await listProposals(db, q ?? addDays(zagrebDate(now), 2)));
}

export async function POST(req: Request) {
  if (!authorized(req)) return error('bad_token', 401);
  const { db, now } = await getContext();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return error('invalid_action', 400);
  const date = body.date === undefined ? addDays(zagrebDate(now), 2) : body.date;

  switch (body.action) {
    case 'approveAll':
      if (!validDate(date)) return error('invalid_date', 400);
      return json(await approveAll(db, date));
    case 'generate':
      if (!validDate(date)) return error('invalid_date', 400);
      return json(await generate(db, now, date));
    case 'reject': {
      const r = await reject(db, now, body.questionId);
      if (!r.ok) return error(r.error, r.error === 'round_open' ? 409 : 404);
      return json(await listProposals(db, r.targetDate));
    }
    default:
      return error('invalid_action', 400);
  }
}
