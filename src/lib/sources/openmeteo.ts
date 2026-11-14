// UNVERIFIED: no real request to Open-Meteo was possible when this was written (docs/DATA_SOURCES.md s.2).
// Must be checked with a real curl:
//  - URL https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&hourly=temperature_2m,wind_gusts_10m,precipitation
//    &timezone=Europe%2FZagreb&past_days=1&forecast_days=3 is accepted (past_days + forecast_days together).
//  - JSON paths $.hourly.time[] (local "YYYY-MM-DDTHH:00" strings), $.hourly.temperature_2m[],
//    $.hourly.wind_gusts_10m[], $.hourly.precipitation[] are parallel arrays.
//  - wind_gusts_10m / precipitation are "preceding hour" values (assumed from docs), so the window 00:00-18:00
//    uses hourly entries 01:00..18:00; confirm. Free tier is non-commercial only.
import type { QuestionDraft, SourceAdapter } from './types';
import { fetchJson, isRecord, toNum, type FetchLike } from './http';

interface City {
  id: string;
  hr: string; // locative: "u Zagrebu"
  en: string;
  lat: number;
  lon: number;
  coastal: boolean;
}

export const CITIES: City[] = [
  { id: 'zagreb', hr: 'Zagrebu', en: 'Zagreb', lat: 45.815, lon: 15.9819, coastal: false },
  { id: 'split', hr: 'Splitu', en: 'Split', lat: 43.508, lon: 16.44, coastal: true },
  { id: 'rijeka', hr: 'Rijeci', en: 'Rijeka', lat: 45.327, lon: 14.442, coastal: true },
  { id: 'osijek', hr: 'Osijeku', en: 'Osijek', lat: 45.554, lon: 18.695, coastal: false },
  { id: 'dubrovnik', hr: 'Dubrovniku', en: 'Dubrovnik', lat: 42.65, lon: 18.094, coastal: true },
];

// Rough mean 14:00 temperature by month (Jan..Dec), continental Croatia.
const MONTH_BASE = [4, 7, 12, 17, 22, 26, 29, 29, 24, 17, 10, 5];

function monthOf(date: string): number {
  return Number(date.slice(5, 7)) - 1;
}

const RAIN_MM = 0.1;
const END_HOUR = 18;

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Metric = 'temp14' | 'rain18' | 'gust18';

function params(city: City, metric: Metric): Record<string, unknown> {
  return { metric, city: city.id, lat: city.lat, lon: city.lon };
}

function tempDraft(city: City): QuestionDraft {
  return {
    kind: 'number',
    category: 'weather',
    source_key: 'openmeteo',
    source_params: params(city, 'temp14'),
    text_hr: `Kolika će biti temperatura u ${city.hr} sutra u 14:00?`,
    text_en: `What will the temperature in ${city.en} be tomorrow at 14:00?`,
    unit: '°C',
    step: 0.5,
    scale: 5,
    min: 0,
    max: 0,
  };
}

export function createOpenMeteoAdapter(fetchFn?: FetchLike): SourceAdapter {
  const get = (url: string) => fetchJson(url, { fetchFn, retryDelayMs: fetchFn ? 0 : 400 });

  return {
    key: 'openmeteo',

    async propose(targetDate, rng) {
      try {
        const base = MONTH_BASE[monthOf(targetDate)];
        const order = shuffle(CITIES, rng);
        const mkTemp = (c: City): QuestionDraft => {
          const mean = base + (c.coastal ? (base < 15 ? 3 : -1) : 0);
          const d = tempDraft(c);
          d.min = Math.floor(mean - 13);
          d.max = Math.ceil(mean + 13);
          return d;
        };
        const drafts: QuestionDraft[] = [mkTemp(order[0])];
        const rainCity = order[1];
        drafts.push({
          kind: 'yesno',
          category: 'weather',
          source_key: 'openmeteo',
          source_params: params(rainCity, 'rain18'),
          text_hr: `Hoće li u ${rainCity.hr} sutra do 18:00 pasti kiša?`,
          text_en: `Will it rain in ${rainCity.en} tomorrow before 18:00?`,
        });
        const gustCity = order[2];
        drafts.push({
          kind: 'number',
          category: 'weather',
          source_key: 'openmeteo',
          source_params: params(gustCity, 'gust18'),
          text_hr: `Koliki će biti najjači udar vjetra u ${gustCity.hr} sutra do 18:00 (km/h)?`,
          text_en: `What will the strongest wind gust in ${gustCity.en} be tomorrow until 18:00 (km/h)?`,
          min: 0,
          max: 100,
          step: 1,
          unit: 'km/h',
          scale: 15,
        });
        if (rng() < 0.5) drafts.push(mkTemp(order[3]));
        return drafts;
      } catch {
        return [];
      }
    },

    async resolve(targetDate, p) {
      try {
        const metric = p.metric;
        const lat = toNum(p.lat);
        const lon = toNum(p.lon);
        if (lat === null || lon === null) return null;
        if (metric !== 'temp14' && metric !== 'rain18' && metric !== 'gust18') return null;
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&hourly=temperature_2m,wind_gusts_10m,precipitation&timezone=Europe%2FZagreb` +
          `&past_days=1&forecast_days=3`;
        const json = await get(url);
        if (!isRecord(json) || !isRecord(json.hourly)) return null;
        const h = json.hourly;
        const time = h.time;
        if (!Array.isArray(time)) return null;
        const col = (name: string): unknown[] | null => (Array.isArray(h[name]) ? (h[name] as unknown[]) : null);
        const at = (hour: number) => time.indexOf(`${targetDate}T${String(hour).padStart(2, '0')}:00`);

        if (metric === 'temp14') {
          const t = col('temperature_2m');
          const i = at(14);
          if (!t || i < 0) return null;
          return toNum(t[i]);
        }
        const series = col(metric === 'rain18' ? 'precipitation' : 'wind_gusts_10m');
        if (!series) return null;
        const vals: number[] = [];
        for (let hour = 1; hour <= END_HOUR; hour++) {
          const i = at(hour);
          if (i < 0) return null;
          const v = toNum(series[i]);
          if (v === null) return null;
          vals.push(v);
        }
        if (metric === 'rain18') {
          const sum = vals.reduce((a, b) => a + b, 0);
          return sum >= RAIN_MM - 1e-9 ? 1 : 0;
        }
        return Math.max(...vals);
      } catch {
        return null;
      }
    },
  };
}

export const openmeteoAdapter = createOpenMeteoAdapter();
