// Pure scoring functions. Unit = shift points ("dani pomaka").

export const MISSED_ROUND_DELTA = -1;

/** Strictly-inside-half-step check, tolerant to float noise (e.g. 0.35 vs 0.3 with step 0.1). */
function isHit(e: number, step: number): boolean {
  return e < step / 2 - 1e-9 * Math.max(step, Number.MIN_VALUE);
}

export function scoreNumber(guess: number, actual: number, scale: number, step: number): number {
  const e = Math.abs(guess - actual);
  if (isHit(e, step)) return 30;
  const s = scale > 0 ? Math.min(e / scale, 1) : e > 0 ? 1 : 0;
  // toFixed guards against noise like 17.499999999999996 when the true value is 17.5.
  return Math.round(Number((30 - 40 * s).toFixed(9)));
}

export function scoreYesNo(guess: 0 | 1, actual: 0 | 1): number {
  return guess === actual ? 15 : -10;
}

export interface RoundItem {
  questionId: string;
  kind: 'number' | 'yesno';
  guess: number | null;
  actual: number | null;
  scale: number | null;
  step: number | null;
  staked: boolean;
}

export interface RoundScore {
  delta: number;
  missed: boolean;
  perQuestion: { questionId: string; points: number; staked: boolean; void: boolean; answered: boolean }[];
}

export function scoreRound(items: RoundItem[]): RoundScore {
  const perQuestion = items.map((it) => {
    const answered = it.guess !== null;
    const isVoid = it.actual === null;
    let points = 0;
    if (answered && !isVoid) {
      points =
        it.kind === 'yesno'
          ? scoreYesNo(it.guess as 0 | 1, it.actual as 0 | 1)
          : scoreNumber(it.guess as number, it.actual as number, it.scale ?? 0, it.step ?? 0);
      if (it.staked) points *= 2;
    }
    return { questionId: it.questionId, points, staked: it.staked, void: isVoid, answered };
  });
  const missed = !perQuestion.some((q) => q.answered);
  const delta = missed ? MISSED_ROUND_DELTA : perQuestion.reduce((a, q) => a + q.points, 0);
  return { delta, missed, perQuestion };
}

// ---- Time warp ----

export function warpDays(offset: number): number {
  if (offset === 0) return 0;
  const a = Math.abs(offset);
  return Math.sign(offset) * (a + Math.floor((offset * offset) / 100));
}

// Integer day-number arithmetic (proleptic Gregorian), days since 1970-01-01.
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = floorDiv(y, 400);
  const yoe = y - era * 400;
  const doy = floorDiv(153 * (m + (m > 2 ? -3 : 9)) + 2, 5) + d - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): { year: number; month: number; day: number } {
  z += 719468;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const day = doy - floorDiv(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

function todayNumber(today: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) throw new Error(`Invalid date: ${today}`);
  return daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function displayDate(today: string, offset: number): { year: number; month: number; day: number } {
  return civilFromDays(todayNumber(today) + warpDays(offset));
}

/**
 * Minimal non-negative number of additional points (in the direction of targetYear) so that the
 * displayed date reaches Jan 1 of targetYear (target ahead) or Dec 31 of targetYear (target behind).
 */
export function pointsToYear(today: string, offset: number, targetYear: number): number {
  const base = todayNumber(today);
  const currentYear = civilFromDays(base + warpDays(offset)).year;
  if (targetYear === currentYear) return 0;
  const ahead = targetYear > currentYear;
  const goal = ahead ? daysFromCivil(targetYear, 1, 1) : daysFromCivil(targetYear, 12, 31);
  const reached = (p: number) =>
    ahead ? base + warpDays(offset + p) >= goal : base + warpDays(offset - p) <= goal;
  if (reached(0)) return 0;
  let hi = 1;
  while (!reached(hi)) hi *= 2;
  let lo = hi >> 1; // reached(lo) is false (or lo = 0, false)
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (reached(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
