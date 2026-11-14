// UNVERIFIED: no real request to Kraken was possible (docs/DATA_SOURCES.md s.3). Check with a real curl:
//  - Ticker: https://api.kraken.com/0/public/Ticker?pair=XBTEUR -> $.result.XXBTZEUR.c[0] (last trade, string).
//  - OHLC:   https://api.kraken.com/0/public/OHLC?pair=XBTEUR&interval=60&since=<unix> -> $.result.XXBTZEUR[n] =
//    [time(unix s), open, high, low, close, vwap, volume, count]; candle `time` is the candle OPEN time and
//    `since` semantics (exclusive) so we pass since = open-1. Result key assumed XXBTZEUR (we take the first
//    non-"last" key). Close at index 4 is a string.
//  - Resolution = close of the hourly candle opening 17:00 Zagreb (i.e. the price at 18:00). Check Kraken API terms.
import type { QuestionDraft, SourceAdapter } from './types';
import { fetchJson, isRecord, toNum, type FetchLike } from './http';
import { settleInstant } from '../time';

/** Unix seconds of the 17:00 Zagreb candle open on `date` (no DST change happens in that part of the day). */
export function candleOpenUnix(date: string): number {
  return Math.floor(settleInstant(date).getTime() / 1000) - 3 * 3600;
}

function firstResultArray(json: unknown): unknown[] | null {
  if (!isRecord(json) || !isRecord(json.result)) return null;
  for (const [k, v] of Object.entries(json.result)) if (k !== 'last' && Array.isArray(v)) return v;
  return null;
}

function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
}

const fmtEur = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function createKrakenAdapter(fetchFn?: FetchLike): SourceAdapter {
  const get = (url: string) => fetchJson(url, { fetchFn, retryDelayMs: fetchFn ? 0 : 400 });

  return {
    key: 'kraken',

    async propose(_targetDate, rng) {
      try {
        const json = await get('https://api.kraken.com/0/public/Ticker?pair=XBTEUR');
        if (!isRecord(json) || !isRecord(json.result)) return [];
        const t = Object.values(json.result).find(isRecord);
        const c = t && Array.isArray(t.c) ? toNum(t.c[0]) : null;
        if (c === null || c <= 0) return [];

        const step = niceStep(c * 0.01);
        const min = Math.floor((c * 0.9) / step) * step;
        const max = Math.ceil((c * 1.1) / step) * step;
        const centre = Math.round(c / step) * step;

        const price: QuestionDraft = {
          kind: 'number',
          category: 'money',
          source_key: 'kraken',
          source_params: { metric: 'price' },
          text_hr: 'Kolika će biti cijena Bitcoina u eurima sutra u 18:00?',
          text_en: 'What will the price of Bitcoin in euros be tomorrow at 18:00?',
          min,
          max,
          step,
          unit: 'EUR',
          scale: c * 0.03,
        };
        const mkAbove = (x: number): QuestionDraft => ({
          kind: 'yesno',
          category: 'money',
          source_key: 'kraken',
          source_params: { metric: 'above', threshold: x },
          text_hr: `Hoće li Bitcoin sutra u 18:00 vrijediti više od ${fmtEur(x)} eura?`,
          text_en: `Will Bitcoin be worth more than ${fmtEur(x)} euros tomorrow at 18:00?`,
        });
        const out = [price, mkAbove(centre)];
        if (rng() < 0.5) out.push(mkAbove(centre + step * (rng() < 0.5 ? 3 : -3)));
        return out;
      } catch {
        return [];
      }
    },

    async resolve(targetDate, p) {
      try {
        const open = candleOpenUnix(targetDate);
        const json = await get(`https://api.kraken.com/0/public/OHLC?pair=XBTEUR&interval=60&since=${open - 1}`);
        const rows = firstResultArray(json);
        if (!rows) return null;
        const row = rows.find((r) => Array.isArray(r) && toNum(r[0]) === open) as unknown[] | undefined;
        if (!row) return null;
        const close = toNum(row[4]);
        if (close === null || close <= 0) return null;
        if (p.metric === 'price') return close;
        if (p.metric === 'above') {
          const t = toNum(p.threshold);
          return t === null ? null : close > t ? 1 : 0;
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}

export const krakenAdapter = createKrakenAdapter();
