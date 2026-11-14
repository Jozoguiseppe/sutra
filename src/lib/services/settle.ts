import type { Db } from '../db';
import { getAdapter } from '../sources';
import { scoreRound, type RoundItem } from '../scoring';
import { settleInstant } from '../time';

export type SettleResult =
  | { settled: true; players: number; voided: number }
  | { tooEarly: true }
  | { alreadySettled: true }
  | { nothingToSettle: true };

export interface ScoredQuestion {
  id: string;
  position: number;
  kind: 'number' | 'yesno';
  text_hr: string;
  text_en: string;
  unit: string | null;
  status: 'approved' | 'void';
  actual_value: number | null;
  scale: number | null;
  step: number | null;
  source_key: string;
  source_params: any;
}

/** The questions a round is scored on: the (max 4) non-rejected, non-proposed ones, in position order. */
export async function loadScoredQuestions(db: Db, targetDate: string): Promise<ScoredQuestion[]> {
  return db.query<ScoredQuestion>(
    `select id, position, kind, text_hr, text_en, unit, status, actual_value, scale, step, source_key, source_params
       from questions
      where round_date = $1 and status in ('approved', 'void')
      order by position
      limit 4`,
    [targetDate],
  );
}

const CHUNK = 5000;

/**
 * Persist the actual value (or void the question) for one question. Writes are conditional
 * ("first write wins", never after the round is settled), so crashes / concurrent runs / reruns can
 * neither overwrite a resolved value nor change anything once the round is settled. The scoring
 * transaction always re-reads the persisted values instead of trusting in-memory ones.
 */
async function resolveQuestion(db: Db, now: Date, targetDate: string, q: ScoredQuestion): Promise<void> {
  let value: number | null = null;
  try {
    const adapter = getAdapter(q.source_key);
    if (adapter) value = await adapter.resolve(targetDate, q.source_params);
  } catch {
    value = null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) value = null;
  if (value !== null && q.kind === 'yesno' && value !== 0 && value !== 1) value = null;

  const guard = `id = $1 and status = 'approved' and actual_value is null
     and exists (select 1 from rounds r where r.target_date = questions.round_date and r.status <> 'settled')`;
  if (value !== null) {
    await db.query(`update questions set actual_value = $2, resolved_at = $3 where ${guard}`, [q.id, value, now.toISOString()]);
  } else {
    await db.query(`update questions set status = 'void', resolved_at = $2 where ${guard}`, [q.id, now.toISOString()]);
  }
}

/**
 * Settle round `targetDate` (see docs/ARCHITECTURE.md section 5). Idempotent and atomic:
 * the round is claimed with a conditional UPDATE inside the same transaction that writes all
 * settlements and offsets, so a second/concurrent/crashed run can never score a round twice.
 */
export async function settleRound(db: Db, now: Date, targetDate: string): Promise<SettleResult> {
  if (now.getTime() < settleInstant(targetDate).getTime()) return { tooEarly: true };

  const round = await db.query<{ status: string }>('select status from rounds where target_date = $1', [targetDate]);
  if (round.length === 0) return { nothingToSettle: true };
  if (round[0].status === 'settled') return { alreadySettled: true };

  const pre = await loadScoredQuestions(db, targetDate);
  if (pre.length === 0) return { nothingToSettle: true };

  // Network calls happen here, never inside the transaction.
  await Promise.all(
    pre.filter((q) => q.status === 'approved' && q.actual_value === null).map((q) => resolveQuestion(db, now, targetDate, q)),
  );

  return db.tx<SettleResult>(async (t) => {
    const claimed = await t.query(
      `update rounds set status = 'settled', settled_at = $2 where target_date = $1 and status <> 'settled' returning target_date`,
      [targetDate, now.toISOString()],
    );
    if (claimed.length === 0) return { alreadySettled: true };

    // Anything still unresolved at claim time counts as void (persisted so results show it).
    let questions = await loadScoredQuestions(t, targetDate);
    for (const q of questions) {
      if (q.status === 'approved' && q.actual_value === null) {
        await t.query(`update questions set status = 'void', resolved_at = coalesce(resolved_at, $2) where id = $1`, [q.id, now.toISOString()]);
      }
    }
    questions = await loadScoredQuestions(t, targetDate);

    const players = await t.query<{ id: string }>('select id from players where first_round <= $1 order by id', [targetDate]);
    const preds = await t.query<{ player_id: string; question_id: string; value: number; staked: boolean }>(
      'select player_id, question_id, value, staked from predictions where round_date = $1',
      [targetDate],
    );
    const byPlayer = new Map<string, Map<string, { value: number; staked: boolean }>>();
    for (const p of preds) {
      let m = byPlayer.get(p.player_id);
      if (!m) byPlayer.set(p.player_id, (m = new Map()));
      m.set(p.question_id, { value: Number(p.value), staked: !!p.staked });
    }

    const rows = players.map((pl) => {
      const mine = byPlayer.get(pl.id);
      const items: RoundItem[] = questions.map((q) => {
        const pr = mine?.get(q.id);
        return {
          questionId: q.id,
          kind: q.kind,
          guess: pr ? pr.value : null,
          actual: q.status === 'void' ? null : q.actual_value,
          scale: q.scale,
          step: q.step,
          staked: pr ? pr.staked : false,
        };
      });
      const s = scoreRound(items);
      return { player_id: pl.id, delta: s.delta, missed: s.missed, detail: s.perQuestion };
    });

    // Set-based writes: one statement per chunk. offset_after is taken from the row actually updated.
    for (let i = 0; i < rows.length; i += CHUNK) {
      await t.query(
        `with v as (
           select * from jsonb_to_recordset($1::jsonb) as x(player_id uuid, delta int, missed boolean, detail jsonb)
         ), upd as (
           update players p set offset_points = p.offset_points + v.delta
             from v where p.id = v.player_id
           returning p.id, p.offset_points, v.delta, v.missed, v.detail
         )
         insert into settlements (player_id, round_date, delta, missed, offset_after, detail)
         select id, $2::date, delta, missed, offset_points, detail from upd`,
        [JSON.stringify(rows.slice(i, i + CHUNK)), targetDate],
      );
    }

    return {
      settled: true,
      players: rows.length,
      voided: questions.filter((q) => q.status === 'void').length,
    };
  });
}
