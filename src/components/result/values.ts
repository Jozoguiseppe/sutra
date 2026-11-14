import { formatNumber } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import type { ResultQuestion } from '@/lib/api-types';

/** Round to at most `maxDecimals`, then show only the decimals that remain (decimal comma). */
export function fmtValue(v: number, maxDecimals = 1): string {
  const r = Number(v.toFixed(maxDecimals));
  return formatNumber(r, r);
}

export function fmtQuantity(v: number, unit: string | null, maxDecimals = 1): string {
  const s = fmtValue(v, maxDecimals);
  return unit ? `${s} ${unit}` : s;
}

export function yesNo(v: number): string {
  return t(v >= 0.5 ? 'result.q.yes' : 'result.q.no');
}

/** Exact value (guess or actual) of a question as text. */
export function valueText(q: ResultQuestion, v: number, maxDecimals = 2): string {
  return q.kind === 'yesno' ? yesNo(v) : fmtQuantity(v, q.unit, maxDecimals);
}

export function sortedQuestions(qs: ResultQuestion[]): ResultQuestion[] {
  return [...qs].sort((a, b) => a.position - b.position);
}
