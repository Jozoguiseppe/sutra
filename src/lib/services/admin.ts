import type { Db } from '../db';
import type { AdminQuestionsResponse } from '../api-types';
import { addDays, lockInstant } from '../time';
import { toQuestionDTO } from './rounds';
import { generateProposals } from './questions';

/** All questions of a round (never actual_value), ordered by position. */
export async function listProposals(db: Db, targetDate: string): Promise<AdminQuestionsResponse> {
  const rows = await db.query(
    `select id, position, kind, category, text_hr, text_en, min, max, step, unit, status, scale, source_key
     from questions where round_date = $1 order by position, id`,
    [targetDate],
  );
  return {
    targetDate,
    questions: rows.map((r: any) => ({
      ...toQuestionDTO(r), status: r.status, scale: r.scale === null ? null : Number(r.scale), sourceKey: r.source_key,
    })),
  };
}

export async function approveAll(db: Db, targetDate: string): Promise<AdminQuestionsResponse> {
  await db.tx(async (t) => {
    await t.query(
      `update questions set status = 'approved' where round_date = $1 and position between 1 and 4 and status = 'proposed'`,
      [targetDate],
    );
    await t.query(`update rounds set status = 'ready' where target_date = $1 and status = 'draft'`, [targetDate]);
  });
  return listProposals(db, targetDate);
}

export type RejectResult =
  | { ok: true; targetDate: string }
  | { ok: false; error: 'question_not_found' | 'round_open' };

export async function reject(db: Db, now: Date, questionId: string): Promise<RejectResult> {
  if (typeof questionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId)) {
    return { ok: false, error: 'question_not_found' };
  }
  const found = await db.query<{ round_date: string }>('select round_date from questions where id = $1', [questionId]);
  if (found.length === 0) return { ok: false, error: 'question_not_found' };
  const targetDate = found[0].round_date;
  // Players can predict from the previous Zagreb midnight on; after that, changing questions is unsafe.
  if (now.getTime() >= lockInstant(addDays(targetDate, -1)).getTime()) return { ok: false, error: 'round_open' };

  await db.tx(async (t) => {
    await t.query('select 1 from rounds where target_date = $1 for update', [targetDate]);
    const cur = await t.query<{ position: number; status: string }>('select position, status from questions where id = $1', [questionId]);
    if (cur.length === 0 || cur[0].status === 'rejected' || cur[0].status === 'void') return;
    const { position, status } = cur[0];
    await t.query(`update questions set status = 'rejected' where id = $1`, [questionId]);
    if (position > 4) return;
    const spare = await t.query<{ id: string; position: number }>(
      `select id, position from questions where round_date = $1 and position > 4 and status = 'proposed'
       order by position limit 1`,
      [targetDate],
    );
    if (spare.length === 0) return;
    // Swap positions so positions 1-4 keep exactly the live questions.
    await t.query('update questions set position = $2 where id = $1', [questionId, spare[0].position]);
    await t.query('update questions set position = $2, status = $3 where id = $1', [
      spare[0].id, position, status === 'approved' ? 'approved' : 'proposed',
    ]);
  });
  return { ok: true, targetDate };
}

export async function generate(db: Db, now: Date, targetDate: string): Promise<AdminQuestionsResponse> {
  await generateProposals(db, now, targetDate);
  return listProposals(db, targetDate);
}
