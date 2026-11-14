import { t } from '@/lib/i18n';
import { formatDays, formatYearBare } from './format';

export const SHARE_SYMBOL = { forward: '⏩', backward: '⏪', zero: '⏸', void: '✖' } as const;

export interface ShareQuestion {
  void: boolean;
  /** null = unanswered / no player */
  points: number | null;
}

/** One symbol per question; never reveals answers. */
export function shareSymbol(q: ShareQuestion): string {
  if (q.void) return SHARE_SYMBOL.void;
  if (q.points === null || q.points === 0) return SHARE_SYMBOL.zero;
  return q.points > 0 ? SHARE_SYMBOL.forward : SHARE_SYMBOL.backward;
}

/** Grid for questions already in position order. */
export function shareGrid(questions: ShareQuestion[]): string {
  return questions.map(shareSymbol).join('');
}

/** "+12 dana", "−1 dan", "0 dana". */
export function formatSignedDays(delta: number): string {
  if (delta > 0) return `+${formatDays(delta)}`;
  if (delta < 0) return `−${formatDays(-delta)}`;
  return formatDays(0);
}

export interface ShareInput {
  /** Displayed year after the round (<= 0 means BC). */
  year: number;
  delta: number;
  questions: ShareQuestion[];
  url: string;
}

export function buildShareText({ year, delta, questions, url }: ShareInput): string {
  return t('share.text', {
    date: t('home.position', { year: formatYearBare(year) }),
    delta: formatSignedDays(delta),
    grid: shareGrid(questions),
    url,
  });
}
