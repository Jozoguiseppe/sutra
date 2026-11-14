import { describe, expect, it } from 'vitest';
import type { QuestionDraft } from '@/lib/sources/types';
import type { FetchLike } from '@/lib/sources/http';
import { fetchJson } from '@/lib/sources/http';
import { createOpenMeteoAdapter } from '@/lib/sources/openmeteo';
import { createFrankfurterAdapter, isTargetHoliday } from '@/lib/sources/frankfurter';
import { createKrakenAdapter, candleOpenUnix } from '@/lib/sources/kraken';
import { createEmscAdapter } from '@/lib/sources/emsc';
import { liveAdapters } from '@/lib/sources/live';

const D = '2026-11-17'; // Tuesday
const SAT = '2026-11-14';

type Route = [string, unknown | number];
function fakeFetch(routes: Route[], calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    for (const [part, body] of routes) {
      if (url.includes(part)) {
        if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => body };
      }
    }
    throw new Error('network down');
  };
}
const failing: FetchLike = async () => {
  throw new Error('boom');
};
const seq = (seed = 1) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

function checkDrafts(drafts: QuestionDraft[], key: string) {
  expect(drafts.length).toBeGreaterThanOrEqual(2);
  expect(drafts.length).toBeLessThanOrEqual(4);
  for (const d of drafts) {
    expect(d.source_key).toBe(key);
    expect(['number', 'yesno']).toContain(d.kind);
    expect(d.text_hr.length).toBeGreaterThan(5);
    expect(d.text_en.length).toBeGreaterThan(5);
    expect(Object.keys(d.source_params).length).toBeGreaterThan(0);
    if (d.kind === 'number') {
      expect(d.min).toBeDefined();
      expect(d.max).toBeDefined();
      expect(d.min!).toBeLessThan(d.max!);
      expect(d.step!).toBeGreaterThan(0);
      expect(d.scale!).toBeGreaterThan(0);
    }
  }
}

describe('fetchJson', () => {
  it('retries once on a 500 then succeeds, returns null on 404 without retry', async () => {
    let n = 0;
    const f: FetchLike = async () => (++n === 1 ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ a: 1 }) });
    expect(await fetchJson('x', { fetchFn: f, retryDelayMs: 0 })).toEqual({ a: 1 });
    let m = 0;
    const g: FetchLike = async () => (m++, { ok: false, status: 404, json: async () => ({}) });
    expect(await fetchJson('x', { fetchFn: g, retryDelayMs: 0 })).toBeNull();
    expect(m).toBe(1);
  });
});

describe('openmeteo', () => {
  const hours = (date: string, f: (h: number) => number | null) =>
    Array.from({ length: 24 }, (_, h) => ({ t: `${date}T${String(h).padStart(2, '0')}:00`, v: f(h) }));
  const fixture = (opts: { rain?: (h: number) => number; gust?: (h: number) => number | null; dates?: string[] } = {}) => {
    const dates = opts.dates ?? ['2026-11-16', D, '2026-11-18'];
    const rows = dates.flatMap((d) => hours(d, () => 0));
    return {
      hourly: {
        time: rows.map((r) => r.t),
        temperature_2m: dates.flatMap((d) => hours(d, (h) => (d === D ? h + 0.5 : -99)).map((r) => r.v)),
        wind_gusts_10m: dates.flatMap((d) => hours(d, (h) => (d === D ? (opts.gust ? opts.gust(h) : h) : 999)).map((r) => r.v)),
        precipitation: dates.flatMap((d) => hours(d, (h) => (d === D ? (opts.rain ? opts.rain(h) : 0) : 50)).map((r) => r.v)),
      },
    };
  };
  const params = (metric: string) => ({ metric, city: 'zagreb', lat: 45.815, lon: 15.9819 });
  const mk = (body: unknown) => createOpenMeteoAdapter(fakeFetch([['api.open-meteo.com', body]]));

  it('proposes well-formed drafts', async () => {
    const drafts = await createOpenMeteoAdapter(failing).propose(D, seq());
    checkDrafts(drafts, 'openmeteo');
    expect(drafts.map((d) => d.kind)).toContain('yesno');
    const t = drafts.find((d) => d.source_params.metric === 'temp14')!;
    expect(t.step).toBe(0.5);
  });

  it('resolves temperature at 14:00', async () => {
    expect(await mk(fixture()).resolve(D, params('temp14'))).toBe(14.5);
  });
  it('resolves max gust over 01..18', async () => {
    expect(await mk(fixture()).resolve(D, params('gust18'))).toBe(18);
  });
  it('resolves rain yes/no with 0.1 mm threshold', async () => {
    expect(await mk(fixture({ rain: (h) => (h === 10 ? 0.1 : 0) })).resolve(D, params('rain18'))).toBe(1);
    expect(await mk(fixture({ rain: (h) => (h === 19 ? 5 : 0.005) })).resolve(D, params('rain18'))).toBe(0);
  });
  it('returns null on HTTP error, missing day, null value, bad params', async () => {
    expect(await createOpenMeteoAdapter(fakeFetch([['open-meteo', 500]])).resolve(D, params('temp14'))).toBeNull();
    expect(await mk(fixture({ dates: ['2026-11-16'] })).resolve(D, params('temp14'))).toBeNull();
    expect(await mk(fixture({ gust: (h) => (h === 7 ? null : 1) })).resolve(D, params('gust18'))).toBeNull();
    expect(await mk(fixture()).resolve(D, { metric: 'nope' })).toBeNull();
    expect(await createOpenMeteoAdapter(failing).resolve(D, params('temp14'))).toBeNull();
  });
});

describe('frankfurter', () => {
  const rateBody = (date: string, rate: number) => ({ date, base: 'EUR', quote: 'USD', rate });
  const fetchFor = (map: Record<string, unknown>, latest: unknown) =>
    createFrankfurterAdapter(async (url) => {
      const m = /date=([\d-]+)/.exec(url);
      const body = m ? map[m[1]] : latest;
      if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => body };
    });

  it('proposes nothing on a Saturday, Sunday and TARGET holidays', async () => {
    const a = fetchFor({}, rateBody('2026-11-13', 1.1));
    expect(await a.propose(SAT, seq())).toEqual([]);
    expect(await a.propose('2026-11-15', seq())).toEqual([]);
    expect(isTargetHoliday('2026-12-25')).toBe(true);
    expect(isTargetHoliday('2026-04-03')).toBe(true); // Good Friday 2026
    expect(isTargetHoliday('2026-04-06')).toBe(true); // Easter Monday 2026
    expect(isTargetHoliday(D)).toBe(false);
    expect(await a.propose('2026-12-25', seq())).toEqual([]);
  });
  it('proposes well-formed drafts on a working day, [] if fetch fails', async () => {
    const drafts = await fetchFor({}, rateBody('2026-11-16', 1.1081)).propose(D, seq(3));
    checkDrafts(drafts, 'frankfurter');
    const n = drafts.find((d) => d.source_params.metric === 'rate')!;
    expect(n.min!).toBeLessThan(1.1081);
    expect(n.max!).toBeGreaterThan(1.1081);
    expect(await createFrankfurterAdapter(failing).propose(D, seq())).toEqual([]);
  });
  it('resolves rate, above, stronger, change', async () => {
    const a = fetchFor({ [D]: rateBody(D, 1.12), '2026-11-16': rateBody('2026-11-16', 1.11) }, undefined);
    expect(await a.resolve(D, { metric: 'rate' })).toBe(1.12);
    expect(await a.resolve(D, { metric: 'above', threshold: 1.115 })).toBe(1);
    expect(await a.resolve(D, { metric: 'above', threshold: 1.13 })).toBe(0);
    expect(await a.resolve(D, { metric: 'stronger', ref_date: '2026-11-16' })).toBe(1);
    expect(await a.resolve(D, { metric: 'change', ref_date: '2026-11-16' })).toBe(1);
  });
  it('resolve returns null when date differs, on HTTP error, on weekend', async () => {
    expect(await fetchFor({ [D]: rateBody('2026-11-16', 1.12) }, undefined).resolve(D, { metric: 'rate' })).toBeNull();
    expect(await fetchFor({}, undefined).resolve(D, { metric: 'rate' })).toBeNull();
    expect(await fetchFor({ [SAT]: rateBody('2026-11-13', 1.1) }, undefined).resolve(SAT, { metric: 'rate' })).toBeNull();
    expect(await createFrankfurterAdapter(failing).resolve(D, { metric: 'rate' })).toBeNull();
  });
});

describe('kraken', () => {
  const ticker = { error: [], result: { XXBTZEUR: { c: ['80000.1', '0.5'] } } };
  const open = candleOpenUnix(D);
  const ohlc = (rows: unknown[][]) => ({ error: [], result: { XXBTZEUR: rows, last: open + 7200 } });
  const candle = (t: number, close: string) => [t, '1', '2', '0.5', close, '1', '1', 1];

  it('candle open is 16:00Z (17:00 CET) in winter', () => {
    expect(new Date(open * 1000).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });
  it('proposes drafts centred on the fetched price; [] on failure', async () => {
    const drafts = await createKrakenAdapter(fakeFetch([['Ticker', ticker]])).propose(D, seq());
    checkDrafts(drafts, 'kraken');
    const n = drafts.find((d) => d.kind === 'number')!;
    expect(n.min!).toBeLessThan(80000);
    expect(n.max!).toBeGreaterThan(80000);
    expect(n.scale).toBeCloseTo(2400, 0);
    expect(await createKrakenAdapter(failing).propose(D, seq())).toEqual([]);
    expect(await createKrakenAdapter(fakeFetch([['Ticker', { error: ['x'], result: {} }]])).propose(D, seq())).toEqual([]);
  });
  it('resolves close of the 17:00 candle', async () => {
    const a = createKrakenAdapter(fakeFetch([['OHLC', ohlc([candle(open - 3600, '1'), candle(open, '81234.5')])]]));
    expect(await a.resolve(D, { metric: 'price' })).toBe(81234.5);
    expect(await a.resolve(D, { metric: 'above', threshold: 81000 })).toBe(1);
    expect(await a.resolve(D, { metric: 'above', threshold: 82000 })).toBe(0);
  });
  it('null on HTTP error / missing candle / bad close', async () => {
    expect(await createKrakenAdapter(fakeFetch([['OHLC', 503]])).resolve(D, { metric: 'price' })).toBeNull();
    expect(await createKrakenAdapter(fakeFetch([['OHLC', ohlc([candle(open - 3600, '1')])]])).resolve(D, { metric: 'price' })).toBeNull();
    expect(await createKrakenAdapter(fakeFetch([['OHLC', ohlc([candle(open, 'abc')])]])).resolve(D, { metric: 'price' })).toBeNull();
  });
});

describe('emsc', () => {
  const fc = (mags: number[]) => ({ type: 'FeatureCollection', features: mags.map((mag) => ({ properties: { mag } })) });

  it('proposes well-formed drafts', async () => {
    const drafts = await createEmscAdapter(failing).propose(D, seq());
    checkDrafts(drafts, 'emsc');
    const n = drafts.find((d) => d.kind === 'number')!;
    expect([n.min, n.max, n.step, n.scale]).toEqual([0, 15, 1, 4]);
  });
  it('resolves count and any-M>=x; queries the UTC window', async () => {
    const calls: string[] = [];
    const a = createEmscAdapter(fakeFetch([['seismicportal', fc([2.6, 3.0, 3.6, 2.4])]], calls));
    expect(await a.resolve(D, { metric: 'count' })).toBe(3);
    expect(await a.resolve(D, { metric: 'any', min_mag: 3.5 })).toBe(1);
    expect(await a.resolve(D, { metric: 'any', min_mag: 4 })).toBe(0);
    expect(await a.resolve(D, { metric: 'count_ge', n: 3 })).toBe(1);
    expect(calls[0]).toContain('starttime=2026-11-16T23:00:00');
    expect(calls[0]).toContain('endtime=2026-11-17T18:00:00');
  });
  it('empty day is 0; null on HTTP error / bad shape', async () => {
    expect(await createEmscAdapter(fakeFetch([['seismicportal', fc([])]])).resolve(D, { metric: 'count' })).toBe(0);
    expect(await createEmscAdapter(fakeFetch([['seismicportal', 500]])).resolve(D, { metric: 'count' })).toBeNull();
    expect(await createEmscAdapter(fakeFetch([['seismicportal', { nope: 1 }]])).resolve(D, { metric: 'count' })).toBeNull();
    expect(await createEmscAdapter(failing).resolve(D, { metric: 'count' })).toBeNull();
  });
});

describe('liveAdapters', () => {
  it('exports the four adapters', () => {
    expect(liveAdapters.map((a) => a.key)).toEqual(['openmeteo', 'frankfurter', 'kraken', 'emsc']);
  });
});
