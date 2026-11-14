import type { Db } from '../db';
import type { ResultQuestion, RoundResultResponse } from '../api-types';
import { displayDate } from '../scoring';
import { loadScoredQuestions } from './settle';

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const pct = (part: number, whole: number) => Math.round((100 * part) / whole);

/**
 * Result of a settled round (default: the latest settled one). Returns null when there is no such
 * settled round. All crowd statistics are aggregated in SQL so this stays cheap with many players.
 */
export async function getRoundResult(
  db: Db,
  _now: Date,
  playerId: string | null | undefined,
  targetDate?: string,
): Promise<RoundResultResponse | null> {
  let date: string;
  if (targetDate !== undefined) {
    if (!validDate(targetDate)) return null;
    const r = await db.query(`select 1 from rounds where target_date = $1 and status = 'settled'`, [targetDate]);
    if (r.length === 0) return null;
    date = targetDate;
  } else {
    const r = await db.query<{ target_date: string }>(
      `select target_date from rounds where status = 'settled' order by target_date desc limit 1`,
    );
    if (r.length === 0) return null;
    date = r[0].target_date;
  }

  const questions = await loadScoredQuestions(db, date);

  const [totals] = await db.query<{ players: number }>(
    'select count(*) as players from settlements where round_date = $1 and not missed',
    [date],
  );
  const players = Number(totals?.players ?? 0);

  const crowdRows = await db.query<{ question_id: string; n: number; avg: number | null; sum: number | null }>(
    `select question_id, count(*) as n, avg(value) as avg, sum(value) as sum
       from predictions where round_date = $1 group by question_id`,
    [date],
  );
  const crowd = new Map(crowdRows.map((r) => [r.question_id, r]));

  const wildRows = await db.query<{ question_id: string; nickname: string; value: number }>(
    `select distinct on (pr.question_id) pr.question_id, pl.nickname, pr.value
       from predictions pr
       join questions q on q.id = pr.question_id
       join players pl on pl.id = pr.player_id
      where pr.round_date = $1 and q.kind = 'number' and q.status = 'approved' and q.actual_value is not null
      order by pr.question_id, abs(pr.value - q.actual_value) desc, pl.nickname_lower asc`,
    [date],
  );
  const wild = new Map(wildRows.map((r) => [r.question_id, r]));

  const beatRows = await db.query<{ question_id: string; larger: number }>(
    `select pr.question_id,
            count(*) filter (where abs(pr.value - q.actual_value) > abs(a.avg - q.actual_value) + 0.000000001) as larger
       from predictions pr
       join questions q on q.id = pr.question_id
       join (select question_id, avg(value) as avg from predictions where round_date = $1 group by question_id) a
         on a.question_id = pr.question_id
      where pr.round_date = $1 and q.kind = 'number' and q.status = 'approved' and q.actual_value is not null
      group by pr.question_id`,
    [date],
  );
  const larger = new Map(beatRows.map((r) => [r.question_id, Number(r.larger)]));

  let mine = new Map<string, { value: number; staked: boolean }>();
  let settlement: { delta: number; missed: boolean; offset_after: number; detail: { questionId: string; points: number }[] } | null = null;
  if (playerId) {
    const s = await db.query<any>(
      'select delta, missed, offset_after, detail from settlements where player_id = $1 and round_date = $2',
      [playerId, date],
    );
    settlement = s[0] ?? null;
    if (settlement) {
      const p = await db.query<{ question_id: string; value: number; staked: boolean }>(
        'select question_id, value, staked from predictions where player_id = $1 and round_date = $2',
        [playerId, date],
      );
      mine = new Map(p.map((r) => [r.question_id, { value: Number(r.value), staked: !!r.staked }]));
    }
  }
  const pointsById = new Map((settlement?.detail ?? []).map((d) => [d.questionId, Number(d.points)]));

  const resultQuestions: ResultQuestion[] = questions.map((q) => {
    const isVoid = q.status === 'void' || q.actual_value === null;
    const c = crowd.get(q.id);
    const n = c ? Number(c.n) : 0;
    const my = mine.get(q.id);
    const number = q.kind === 'number';
    const w = !isVoid && number ? wild.get(q.id) : undefined;
    return {
      id: q.id,
      position: Number(q.position),
      kind: q.kind,
      text: q.text_hr,
      textEn: q.text_en,
      unit: q.unit ?? null,
      void: isVoid,
      actual: isVoid ? null : q.actual_value,
      my: my ? { value: my.value, staked: my.staked, points: pointsById.get(q.id) ?? 0 } : null,
      crowd: {
        count: n,
        avg: number && n > 0 ? Number(c!.avg) : null,
        yesPct: !number && n > 0 ? pct(Number(c!.sum), n) : null,
      },
      crowdBeatPct: !isVoid && number && n > 0 && larger.has(q.id) ? pct(larger.get(q.id)!, n) : null,
      wildest: w ? { nickname: w.nickname, value: Number(w.value) } : null,
    };
  });

  let me: RoundResultResponse['me'] = null;
  if (settlement) {
    const [b] = await db.query<{ lower: number }>(
      'select count(*) as lower from settlements where round_date = $1 and not missed and delta < $2',
      [date, settlement.delta],
    );
    const after = Number(settlement.offset_after);
    const before = after - Number(settlement.delta);
    me = {
      played: !settlement.missed,
      missed: !!settlement.missed,
      delta: Number(settlement.delta),
      offsetBefore: before,
      offsetAfter: after,
      displayBefore: displayDate(date, before),
      displayAfter: displayDate(date, after),
      beatPct: players > 0 ? pct(Number(b?.lower ?? 0), players) : null,
    };
  }

  return { targetDate: date, players, me, questions: resultQuestions };
}
