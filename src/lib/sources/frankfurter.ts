// UNVERIFIED: no real request to Frankfurter was possible (docs/DATA_SOURCES.md s.1). Check with a real curl:
//  - GET https://api.frankfurter.dev/v2/rate/EUR/USD?providers=ECB (latest) and ...&date=YYYY-MM-DD both work,
//    and the `providers=ECB` parameter is accepted on /v2/rate.
//  - Response shape {"date":"YYYY-MM-DD","base":"EUR","quote":"USD","rate":1.1568}: $.rate (number), $.date.
//  - Behaviour for a weekend/holiday ?date= (assumed: returns the previous working date, which resolve() rejects).
import type { QuestionDraft, SourceAdapter } from './types';
import { fetchJson, isRecord, toNum, type FetchLike } from './http';
import { addDays } from '../time';

const BASE = 'https://api.frankfurter.dev/v2/rate/EUR/USD?providers=ECB';

function dow(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** TARGET closing days: 1 Jan, Good Friday, Easter Monday, 1 May, 25 and 26 Dec. */
export function isTargetHoliday(date: string): boolean {
  const year = Number(date.slice(0, 4));
  const md = date.slice(5);
  if (['01-01', '05-01', '12-25', '12-26'].includes(md)) return true;
  const easter = easterSunday(year);
  return date === addDays(easter, -2) || date === addDays(easter, 1);
}

export function isEcbWorkingDay(date: string): boolean {
  const w = dow(date);
  return w !== 0 && w !== 6 && !isTargetHoliday(date);
}

export function previousWorkingDay(date: string): string {
  let d = addDays(date, -1);
  for (let i = 0; i < 10 && !isEcbWorkingDay(d); i++) d = addDays(d, -1);
  return d;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function createFrankfurterAdapter(fetchFn?: FetchLike): SourceAdapter {
  const get = (url: string) => fetchJson(url, { fetchFn, retryDelayMs: fetchFn ? 0 : 400 });

  async function rateOn(date?: string): Promise<{ date: string; rate: number } | null> {
    const json = await get(date ? `${BASE}&date=${date}` : BASE);
    if (!isRecord(json)) return null;
    const rate = toNum(json.rate);
    if (rate === null || rate <= 0 || typeof json.date !== 'string') return null;
    return { date: json.date, rate };
  }

  return {
    key: 'frankfurter',

    async propose(targetDate, rng) {
      try {
        if (!isEcbWorkingDay(targetDate)) return [];
        const latest = await rateOn();
        if (!latest) return [];
        const last = latest.rate;
        const ref = previousWorkingDay(targetDate);
        const lastTxt = last.toFixed(4).replace('.', ',');

        const rate: QuestionDraft = {
          kind: 'number',
          category: 'money',
          source_key: 'frankfurter',
          source_params: { metric: 'rate' },
          text_hr: 'Koliki će biti službeni ECB tečaj EUR/USD sutra?',
          text_en: 'What will the official ECB EUR/USD reference rate be tomorrow?',
          min: r4(Math.floor((last - 0.05) / 0.0005) * 0.0005),
          max: r4(Math.ceil((last + 0.05) / 0.0005) * 0.0005),
          step: 0.0005,
          unit: 'USD',
          scale: 0.008,
        };
        const stronger: QuestionDraft = {
          kind: 'yesno',
          category: 'money',
          source_key: 'frankfurter',
          source_params: { metric: 'stronger', ref_date: ref },
          text_hr: 'Hoće li euro sutra biti jači prema dolaru nego danas (ECB tečaj)?',
          text_en: 'Will the euro be stronger against the dollar tomorrow than today (ECB rate)?',
        };
        const change: QuestionDraft = {
          kind: 'number',
          category: 'money',
          source_key: 'frankfurter',
          source_params: { metric: 'change', ref_date: ref },
          text_hr: 'Za koliko će se promijeniti tečaj EUR/USD u odnosu na prethodni radni dan (u centima)?',
          text_en: 'By how many US cents will EUR/USD change versus the previous working day?',
          min: -3,
          max: 3,
          step: 0.1,
          unit: 'centa',
          scale: 1,
        };
        const threshold = Math.round(last * 200) / 200;
        const thrTxt = threshold.toFixed(3).replace('.', ',');
        const above: QuestionDraft = {
          kind: 'yesno',
          category: 'money',
          source_key: 'frankfurter',
          source_params: { metric: 'above', threshold },
          text_hr: `Hoće li ECB tečaj EUR/USD sutra biti iznad ${thrTxt}? (zadnji tečaj: ${lastTxt})`,
          text_en: `Will the ECB EUR/USD rate tomorrow be above ${threshold.toFixed(3)}? (latest: ${last.toFixed(4)})`,
        };
        const out = [rate, stronger];
        const r = rng();
        if (r < 0.4) out.push(change);
        else if (r < 0.8) out.push(above);
        else out.push(change, above);
        return out;
      } catch {
        return [];
      }
    },

    async resolve(targetDate, p) {
      try {
        if (!isEcbWorkingDay(targetDate)) return null;
        const cur = await rateOn(targetDate);
        if (!cur || cur.date !== targetDate) return null;
        switch (p.metric) {
          case 'rate':
            return cur.rate;
          case 'above': {
            const t = toNum(p.threshold);
            return t === null ? null : cur.rate > t ? 1 : 0;
          }
          case 'stronger':
          case 'change': {
            const refDate = typeof p.ref_date === 'string' ? p.ref_date : null;
            if (!refDate) return null;
            const prev = await rateOn(refDate);
            if (!prev || prev.date !== refDate) return null;
            return p.metric === 'stronger' ? (cur.rate > prev.rate ? 1 : 0) : r4((cur.rate - prev.rate) * 100);
          }
          default:
            return null;
        }
      } catch {
        return null;
      }
    },
  };
}

export const frankfurterAdapter = createFrankfurterAdapter();
