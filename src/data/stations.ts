/** Time stations: displayed-year ranges (inclusive) with Croatian/English flavour texts. */
export interface Station {
  id: string;
  fromYear: number;
  toYear: number; // inclusive displayed-year range
  titleKey: string;
  descKey: string;
  emoji: string;
}

export const MIN_YEAR = -70000000;
export const MAX_YEAR = 100000;

function s(id: string, fromYear: number, toYear: number, emoji: string): Station {
  return { id, fromYear, toYear, titleKey: `station.${id}.title`, descKey: `station.${id}.desc`, emoji };
}

export const STATIONS: Station[] = [
  s('dinosauri', -70000000, -1000001, '🦖'),
  s('kameno', -1000000, -3001, '🔥'),
  s('iliri', -3000, -168, '🏺'),
  s('rim', -167, 475, '🏛️'),
  s('srednji', 476, 1357, '🏰'),
  s('republika', 1358, 1807, '⚓'),
  s('xix', 1808, 1899, '🚂'),
  s('xx_rano', 1900, 1944, '🚋'),
  s('jugoslavija', 1945, 1979, '📺'),
  s('osamdesete', 1980, 1989, '🎧'),
  s('devedesete', 1990, 1999, '🎮'),
  s('nulte', 2000, 2009, '📞'),
  s('desete', 2010, 2022, '🤳'),
  s('rane20', 2023, 2025, '💶'),
  s('sadasnjost', 2026, 2026, '📍'),
  s('kasne20', 2027, 2029, '🤖'),
  s('tridesete', 2030, 2039, '🧊'),
  s('cetrdesete', 2040, 2049, '🍲'),
  s('pola', 2050, 2099, '🚀'),
  s('xxii', 2100, 2199, '🌆'),
  s('daleka', 2200, 2999, '⏳'),
  s('tisucu', 3000, 9999, '🗿'),
  s('svemir', 10000, MAX_YEAR, '🌌'),
];

/** Station for a displayed year; years outside the range are clamped to the first/last station. */
export function stationForYear(year: number): Station {
  if (year <= MIN_YEAR) return STATIONS[0];
  if (year >= MAX_YEAR) return STATIONS[STATIONS.length - 1];
  let lo = 0;
  let hi = STATIONS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (STATIONS[mid].fromYear <= year) lo = mid;
    else hi = mid - 1;
  }
  return STATIONS[lo];
}
