// UNVERIFIED: no real request to EMSC was possible (docs/DATA_SOURCES.md s.4). Check with a real curl:
//  - https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minlat=42.3&maxlat=46.6&minlon=13.4&maxlon=19.5
//    &minmag=2.5&starttime=..&endtime=..&limit=1000 accepts these params (esp. minlon/maxlon, limit).
//  - starttime/endtime are interpreted as UTC (we send Zagreb 00:00 and 19:00 converted to UTC, format
//    YYYY-MM-DDTHH:MM:SS without zone suffix).
//  - Response is GeoJSON FeatureCollection: $.features[] with $.features[].properties.mag (number).
//  - A day with zero events returns an empty features array (not an HTTP error).
import type { QuestionDraft, SourceAdapter } from './types';
import { fetchJson, isRecord, toNum, type FetchLike } from './http';
import { lockInstant, settleInstant } from '../time';

const MIN_MAG = 2.5;
const BBOX = 'minlat=42.3&maxlat=46.6&minlon=13.4&maxlon=19.5';

const iso = (d: Date) => d.toISOString().slice(0, 19);

export function createEmscAdapter(fetchFn?: FetchLike): SourceAdapter {
  const get = (url: string) => fetchJson(url, { fetchFn, retryDelayMs: fetchFn ? 0 : 400 });

  return {
    key: 'emsc',

    async propose(_targetDate, rng) {
      try {
        const count: QuestionDraft = {
          kind: 'number',
          category: 'misc',
          source_key: 'emsc',
          source_params: { metric: 'count' },
          text_hr: 'Koliko će potresa jačine 2,5 ili više EMSC zabilježiti u Hrvatskoj i okolici sutra do 19:00?',
          text_en: 'How many earthquakes of magnitude 2.5 or more will EMSC record in Croatia and the surrounding region tomorrow until 19:00?',
          min: 0,
          max: 15,
          step: 1,
          unit: 'potresa',
          scale: 4,
        };
        const mag = rng() < 0.5 ? 3.5 : 3.0;
        const magTxt = mag.toFixed(1).replace('.', ',');
        const any: QuestionDraft = {
          kind: 'yesno',
          category: 'misc',
          source_key: 'emsc',
          source_params: { metric: 'any', min_mag: mag },
          text_hr: `Hoće li sutra do 19:00 biti potres jačine ${magTxt} ili više u Hrvatskoj i okolici?`,
          text_en: `Will there be an earthquake of magnitude ${mag.toFixed(1)} or more in Croatia and the region tomorrow before 19:00?`,
        };
        const out = [count, any];
        if (rng() < 0.5) {
          const n = rng() < 0.5 ? 3 : 5;
          out.push({
            kind: 'yesno',
            category: 'misc',
            source_key: 'emsc',
            source_params: { metric: 'count_ge', n },
            text_hr: `Hoće li EMSC sutra do 19:00 zabilježiti barem ${n} potresa jačine 2,5 ili više u Hrvatskoj i okolici?`,
            text_en: `Will EMSC record at least ${n} earthquakes of magnitude 2.5+ in Croatia and the region tomorrow before 19:00?`,
          });
        }
        return out;
      } catch {
        return [];
      }
    },

    async resolve(targetDate, p) {
      try {
        const start = iso(lockInstant(targetDate));
        const end = iso(new Date(settleInstant(targetDate).getTime() - 3600_000));
        const url =
          `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&${BBOX}` +
          `&minmag=${MIN_MAG}&starttime=${start}&endtime=${end}&orderby=time&limit=1000`;
        const json = await get(url);
        if (!isRecord(json) || !Array.isArray(json.features)) return null;
        const mags: number[] = [];
        for (const f of json.features) {
          const m = isRecord(f) && isRecord(f.properties) ? toNum(f.properties.mag) : null;
          if (m === null) return null;
          if (m >= MIN_MAG) mags.push(m);
        }
        switch (p.metric) {
          case 'count':
            return mags.length;
          case 'count_ge': {
            const n = toNum(p.n);
            return n === null ? null : mags.length >= n ? 1 : 0;
          }
          case 'any': {
            const t = toNum(p.min_mag);
            return t === null ? null : mags.some((m) => m >= t) ? 1 : 0;
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

export const emscAdapter = createEmscAdapter();
