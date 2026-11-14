import type { Db } from '../db';
import type { OpenRoundResponse, PendingRoundResponse, PredictionDTO, QuestionDTO } from '../api-types';
import { lockInstant, openRoundDate, pendingRoundDate, settleInstant } from '../time';
import { generateProposals } from './questions';

const Q_COLS = 'id, position, kind, category, text_hr, text_en, min, max, step, unit';

export function toQuestionDTO(r: any): QuestionDTO {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r.id, position: Number(r.position), kind: r.kind, category: r.category,
    text: r.text_hr, textEn: r.text_en,
    min: n(r.min), max: n(r.max), step: n(r.step), unit: r.unit ?? null,
  };
}

async function loadPredictions(db: Db, playerId: string | undefined | null, roundDate: string): Promise<PredictionDTO[]> {
  if (!playerId) return [];
  const rows = await db.query(
    `select p.question_id, p.value, p.staked from predictions p join questions q on q.id = p.question_id
     where p.player_id = $1 and p.round_date = $2 order by q.position`,
    [playerId, roundDate],
  );
  return rows.map((r: any) => ({ questionId: r.question_id, value: Number(r.value), staked: !!r.staked }));
}

async function loadApproved(db: Db, roundDate: string): Promise<QuestionDTO[]> {
  const rows = await db.query(
    `select ${Q_COLS} from questions where round_date = $1 and status = 'approved' order by position limit 4`,
    [roundDate],
  );
  return rows.map(toQuestionDTO);
}

/** The open round (tomorrow). Generates and auto-approves questions on first read. */
export async function getOpenRound(db: Db, now: Date, playerId?: string | null): Promise<OpenRoundResponse> {
  const targetDate = openRoundDate(now);
  const has = await db.query('select 1 from questions where round_date = $1 limit 1', [targetDate]);
  if (has.length === 0) await generateProposals(db, now, targetDate);

  await db.tx(async (t) => {
    await t.query('select 1 from rounds where target_date = $1 for update', [targetDate]);
    const approved = await t.query(`select 1 from questions where round_date = $1 and status = 'approved' limit 1`, [targetDate]);
    if (approved.length === 0) {
      await t.query(
        `update questions set status = 'approved' where round_date = $1 and position between 1 and 4 and status = 'proposed'`,
        [targetDate],
      );
    }
    await t.query(`update rounds set status = 'ready' where target_date = $1 and status = 'draft'`, [targetDate]);
  });

  return {
    targetDate,
    lockAt: lockInstant(targetDate).toISOString(),
    questions: await loadApproved(db, targetDate),
    predictions: await loadPredictions(db, playerId, targetDate),
  };
}

export type SavePredictionResult =
  | { ok: true; predictions: PredictionDTO[] }
  | { ok: false; error: 'invalid_value' | 'question_not_found' | 'locked' };

export async function savePrediction(
  db: Db, now: Date, playerId: string,
  input: { questionId: string; value: number; staked: boolean },
): Promise<SavePredictionResult> {
  const { questionId, value } = input;
  const staked = input.staked === true;
  if (typeof questionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId)) {
    return { ok: false, error: 'question_not_found' };
  }
  const rows = await db.query(
    `select id, round_date, kind, min, max, step from questions where id = $1 and status = 'approved'`,
    [questionId],
  );
  if (rows.length === 0) return { ok: false, error: 'question_not_found' };
  const q = rows[0] as any;
  const open = openRoundDate(now);
  if (q.round_date > open) return { ok: false, error: 'question_not_found' }; // not visible yet
  if (q.round_date !== open || now.getTime() >= lockInstant(q.round_date).getTime()) return { ok: false, error: 'locked' };

  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, error: 'invalid_value' };
  if (q.kind === 'yesno') {
    if (value !== 0 && value !== 1) return { ok: false, error: 'invalid_value' };
  } else {
    const min = Number(q.min), max = Number(q.max), step = Number(q.step);
    if (value < min - 1e-9 || value > max + 1e-9) return { ok: false, error: 'invalid_value' };
    const k = (value - min) / step;
    if (Math.abs(k - Math.round(k)) > 1e-6) return { ok: false, error: 'invalid_value' };
  }

  await db.tx(async (t) => {
    if (staked) {
      await t.query(
        'update predictions set staked = false where player_id = $1 and round_date = $2 and question_id <> $3 and staked',
        [playerId, q.round_date, questionId],
      );
    }
    await t.query(
      `insert into predictions (player_id, question_id, round_date, value, staked, updated_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (player_id, question_id) do update
         set value = excluded.value, staked = excluded.staked, updated_at = excluded.updated_at`,
      [playerId, questionId, q.round_date, value, staked, now.toISOString()],
    );
  });
  return { ok: true, predictions: await loadPredictions(db, playerId, q.round_date) };
}

/** Today's locked round (settles at 20:00). targetDate is null when there is no round for today. */
export async function getPendingRound(db: Db, now: Date, playerId?: string | null): Promise<PendingRoundResponse> {
  const targetDate = pendingRoundDate(now);
  const round = await db.query<{ status: string }>('select status from rounds where target_date = $1', [targetDate]);
  const questions = round.length ? await loadApproved(db, targetDate) : [];
  if (questions.length === 0) {
    return { targetDate: null, settleAt: null, settled: false, questions: [], predictions: [] };
  }
  return {
    targetDate,
    settleAt: settleInstant(targetDate).toISOString(),
    settled: round[0].status === 'settled',
    questions,
    predictions: await loadPredictions(db, playerId, targetDate),
  };
}
