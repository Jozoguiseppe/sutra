import type { QuestionDraft, SourceAdapter } from './types';
import { hash01, shuffle } from './rng';

type Cat = QuestionDraft['category'];

interface NumTpl { id: string; category: Cat; hr: string; en: string; unit: string; min: number; max: number; step: number; scale: number }

const NUMBERS: NumTpl[] = [
  { id: 'temp_zagreb_14', category: 'weather', hr: 'Koliko će stupnjeva biti u Zagrebu u 14:00?', en: 'What will the temperature in Zagreb be at 14:00?', unit: '°C', min: -10, max: 40, step: 1, scale: 8 },
  { id: 'temp_split_max', category: 'weather', hr: 'Kolika će biti najviša dnevna temperatura u Splitu?', en: 'What will the daily high in Split be?', unit: '°C', min: -5, max: 42, step: 1, scale: 8 },
  { id: 'wind_rijeka', category: 'weather', hr: 'Koliki će biti najjači udar vjetra u Rijeci?', en: 'What will the strongest wind gust in Rijeka be?', unit: 'km/h', min: 0, max: 120, step: 5, scale: 40 },
  { id: 'sun_dubrovnik', category: 'weather', hr: 'Koliko će sati sunca imati Dubrovnik?', en: 'How many hours of sunshine will Dubrovnik get?', unit: 'h', min: 0, max: 14, step: 1, scale: 5 },
  { id: 'eurusd', category: 'money', hr: 'Koliki će biti tečaj eura prema dolaru (EUR/USD) u podne?', en: 'What will the EUR/USD rate be at noon?', unit: '$', min: 0.9, max: 1.4, step: 0.005, scale: 0.04 },
  { id: 'btc_eur', category: 'money', hr: 'Kolika će biti cijena jednog bitcoina u eurima u podne?', en: 'What will the price of one bitcoin in euros be at noon?', unit: '€', min: 30000, max: 150000, step: 500, scale: 10000 },
  { id: 'gold_oz', category: 'money', hr: 'Kolika će biti cijena unce zlata u dolarima?', en: 'What will the price of an ounce of gold in dollars be?', unit: '$', min: 1500, max: 5000, step: 10, scale: 250 },
  { id: 'hnl_goals', category: 'sport', hr: 'Koliko će ukupno golova pasti u utakmicama HNL-a?', en: 'How many goals will be scored in total in HNL matches?', unit: 'golova', min: 0, max: 30, step: 1, scale: 8 },
  { id: 'quakes_hr', category: 'misc', hr: 'Koliko će potresa biti zabilježeno u Hrvatskoj?', en: 'How many earthquakes will be recorded in Croatia?', unit: 'potresa', min: 0, max: 40, step: 1, scale: 12 },
];

interface YnTpl { id: string; category: Cat; hr: (t: number) => string; en: (t: number) => string; thr: [number, number] | null }

const YESNO: YnTpl[] = [
  { id: 'rain_split', category: 'weather', hr: () => 'Hoće li u Splitu pasti kiša?', en: () => 'Will it rain in Split?', thr: null },
  { id: 'fog_zagreb', category: 'weather', hr: () => 'Hoće li ujutro u Zagrebu biti magle?', en: () => 'Will there be morning fog in Zagreb?', thr: null },
  { id: 'osijek_above', category: 'weather', hr: (t) => `Hoće li u Osijeku temperatura u 14:00 biti viša od ${t} °C?`, en: (t) => `Will the temperature in Osijek at 14:00 be above ${t} °C?`, thr: [2, 24] },
  { id: 'eurusd_above', category: 'money', hr: (t) => `Hoće li tečaj EUR/USD u podne biti viši od ${t.toFixed(2)}?`, en: (t) => `Will the EUR/USD rate at noon be above ${t.toFixed(2)}?`, thr: [1.05, 1.2] },
  { id: 'btc_up', category: 'money', hr: () => 'Hoće li bitcoin u podne biti skuplji nego jučer u podne?', en: () => 'Will bitcoin at noon be pricier than yesterday at noon?', thr: null },
  { id: 'gold_up', category: 'money', hr: () => 'Hoće li zlato danas završiti u plusu?', en: () => 'Will gold close the day higher?', thr: null },
  { id: 'hnl_redcard', category: 'sport', hr: () => 'Hoće li u HNL-u biti pokazan barem jedan crveni karton?', en: () => 'Will at least one red card be shown in HNL?', thr: null },
  { id: 'hnl_goals_over', category: 'sport', hr: (t) => `Hoće li u HNL-u ukupno pasti više od ${t} golova?`, en: (t) => `Will more than ${t} goals be scored in HNL?`, thr: [6, 14] },
  { id: 'quake_3', category: 'misc', hr: () => 'Hoće li u Hrvatskoj biti zabilježen potres jačine 3 ili više?', en: () => 'Will an earthquake of magnitude 3 or more be recorded in Croatia?', thr: null },
];

export const mockAdapter: SourceAdapter = {
  key: 'mock',

  async propose(_targetDate, rng) {
    const drafts: QuestionDraft[] = [];
    for (const t of NUMBERS) {
      drafts.push({
        kind: 'number', category: t.category, source_key: 'mock',
        source_params: { id: t.id, kind: 'number', min: t.min, max: t.max, step: t.step },
        text_hr: t.hr, text_en: t.en, min: t.min, max: t.max, step: t.step, unit: t.unit, scale: t.scale,
      });
    }
    for (const t of YESNO) {
      const thr = t.thr ? Math.round((t.thr[0] + rng() * (t.thr[1] - t.thr[0])) * 100) / 100 : 0;
      const value = t.thr && t.thr[1] - t.thr[0] > 1 ? Math.round(thr) : thr;
      drafts.push({
        kind: 'yesno', category: t.category, source_key: 'mock',
        source_params: { id: t.id, kind: 'yesno', threshold: value },
        text_hr: t.hr(value), text_en: t.en(value),
      });
    }
    return shuffle(drafts, rng);
  },

  async resolve(targetDate, params) {
    const id = typeof params?.id === 'string' ? params.id : null;
    if (!id) return null;
    const u = hash01(`${targetDate}|${id}|${params.threshold ?? ''}`);
    if (params.kind === 'yesno') return u < 0.5 ? 0 : 1;
    const min = Number(params.min), max = Number(params.max), step = Number(params.step);
    if (![min, max, step].every(Number.isFinite) || max <= min || step <= 0) return null;
    const steps = Math.floor((max - min) / step + 1e-9);
    const k = Math.min(steps, Math.floor(u * (steps + 1)));
    const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)) + 2;
    return Number((min + k * step).toFixed(decimals));
  },
};
