import { describe, expect, it } from 'vitest';
import hr from '../../messages/hr.json';
import en from '../../messages/en.json';
import { MAX_YEAR, MIN_YEAR, STATIONS, stationForYear } from './stations';

const hrMap = hr as Record<string, string>;
const enMap = en as Record<string, string>;

describe('stations', () => {
  it('covers the full range without gaps or overlaps', () => {
    expect(STATIONS[0].fromYear).toBe(MIN_YEAR);
    expect(STATIONS[STATIONS.length - 1].toYear).toBe(MAX_YEAR);
    for (let i = 0; i < STATIONS.length; i++) {
      expect(STATIONS[i].fromYear).toBeLessThanOrEqual(STATIONS[i].toYear);
      if (i > 0) expect(STATIONS[i].fromYear).toBe(STATIONS[i - 1].toYear + 1);
    }
    expect(STATIONS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(STATIONS.map((x) => x.id)).size).toBe(STATIONS.length);
  });

  it('stationForYear works at every boundary', () => {
    for (const st of STATIONS) {
      expect(stationForYear(st.fromYear)).toBe(st);
      expect(stationForYear(st.toYear)).toBe(st);
    }
    expect(stationForYear(0).id).toBe('rim');
    expect(stationForYear(MIN_YEAR - 5).id).toBe(STATIONS[0].id);
    expect(stationForYear(MAX_YEAR + 5).id).toBe(STATIONS[STATIONS.length - 1].id);
  });

  it('present station is exactly 2026', () => {
    const p = stationForYear(2026);
    expect(p.id).toBe('sadasnjost');
    expect(p.fromYear).toBe(2026);
    expect(p.toYear).toBe(2026);
    expect(stationForYear(2025).id).not.toBe(p.id);
    expect(stationForYear(2027).id).not.toBe(p.id);
  });

  it('every station key exists in both message files', () => {
    for (const st of STATIONS) {
      for (const key of [st.titleKey, st.descKey]) {
        expect(hrMap[key], `hr ${key}`).toBeTruthy();
        expect(enMap[key], `en ${key}`).toBeTruthy();
      }
      expect(st.emoji).toBeTruthy();
    }
  });
});

describe('messages', () => {
  it('have identical key sets', () => {
    expect(Object.keys(hrMap).sort()).toEqual(Object.keys(enMap).sort());
  });

  it('use the same placeholders in both languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(hrMap)) {
      expect(vars(hrMap[key]), key).toEqual(vars(enMap[key]));
    }
  });

  it('keep app name and tagline', () => {
    expect(hrMap['app.name']).toBe('Sutra');
    expect(hrMap['app.tagline']).toBe('Koliko si ispred vremena?');
    for (let m = 1; m <= 12; m++) expect(hrMap[`month.${m}`]).toBeTruthy();
    expect(hrMap['era.bc']).toBe('pr. Kr.');
  });
});
