import { t } from '@/lib/i18n';
import type { Ymd } from '@/lib/api-types';

const NBSP = ' ';

/** Integer with non-breaking-space thousands grouping, only for |n| >= 10000. */
export function groupDigits(n: number): string {
  const s = String(Math.trunc(Math.abs(n)));
  const body = Math.abs(n) >= 10000 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) : s;
  return n < 0 ? `-${body}` : body;
}

/** Displayed year number: years <= 0 are shown as 1 - year (BC). */
export function displayYear(year: number): number {
  return year <= 0 ? 1 - year : year;
}

export function formatYear(year: number): string {
  if (year <= 0) return t('year.format.bc', { year: groupDigits(1 - year), era: t('era.bc') });
  return t('year.format', { year: groupDigits(year) });
}

/** Year without its trailing dot, for sentences that already add one ("Do {year}. ti fali"). */
export function formatYearBare(year: number): string {
  return formatYear(year).replace(/\.$/, '');
}

export function formatDate(d: Ymd): string {
  const vars = { day: d.day, month: t(`month.${d.month}`), year: groupDigits(displayYear(d.year)) };
  if (d.year <= 0) return t('date.format.bc', { ...vars, era: t('era.bc') });
  return t('date.format', vars);
}

export function pluralCategory(n: number): 'one' | 'few' | 'other' {
  const a = Math.abs(Math.trunc(n));
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'other';
}

export function formatDays(n: number): string {
  return t(`unit.days.${pluralCategory(n)}`, { n: groupDigits(n) });
}

/** Remaining time as h:mm:ss (hours not padded). Negative input clamps to zero. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return t('unit.time.hms', { h, m: String(m).padStart(2, '0'), s: String(s).padStart(2, '0') });
}

/** Number of decimals implied by a step (0.1 -> 1, 5 -> 0, 1e-7 -> 6 capped). */
export function stepDecimals(step: number | null | undefined): number {
  if (!step || !Number.isFinite(step)) return 0;
  const s = String(step);
  const exp = /e-(\d+)$/.exec(s);
  if (exp) return Math.min(6, Number(exp[1]));
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : Math.min(6, s.length - dot - 1);
}

/** Croatian decimal comma, grouped integer part. */
export function formatNumber(value: number, step?: number | null): string {
  const fixed = Math.abs(value).toFixed(stepDecimals(step));
  const [int, frac] = fixed.split('.');
  const grouped = groupDigits(Number(int));
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  return frac ? `${sign}${grouped},${frac}` : `${sign}${grouped}`;
}

export function formatQuantity(value: number, step?: number | null, unit?: string | null): string {
  const n = formatNumber(value, step);
  return unit ? `${n}${NBSP}${unit}` : n;
}

export function formatYearRange(from: number, to: number): string {
  if (from === to) return formatYear(from);
  return t('home.timeline.range', { from: formatYear(from), to: formatYear(to) });
}

/** Lowercase, diacritic-free text for forgiving search (Đ/đ -> d). */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

export type NicknameProblem = 'short' | 'long' | 'invalid' | null;

export function nicknameProblem(raw: string): NicknameProblem {
  const n = raw.trim();
  if (n.length < 3) return 'short';
  if (n.length > 20) return 'long';
  if (!/^[\p{L}\p{N} _-]+$/u.test(n)) return 'invalid';
  return null;
}
