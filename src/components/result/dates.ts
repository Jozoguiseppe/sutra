import type { Ymd } from '@/lib/api-types';
import { addDays, settleInstant, zagrebDate } from '@/lib/time';

// Proleptic Gregorian day numbers (days since 1970-01-01), valid for any year incl. <= 0.
export function ymdToDays({ year, month, day }: Ymd): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function daysToYmd(n: number): Ymd {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** "YYYY-MM-DD" -> Ymd (null when malformed). */
export function parseYmd(date: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/** Epoch ms of the next 20:00 Zagreb strictly after `nowMs`. */
export function nextResultsMs(nowMs: number): number {
  const today = zagrebDate(new Date(nowMs));
  const todays = settleInstant(today).getTime();
  return todays > nowMs ? todays : settleInstant(addDays(today, 1)).getTime();
}

export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}
