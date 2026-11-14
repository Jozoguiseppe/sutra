import { describe, it, expect } from 'vitest';
import {
  MISSED_ROUND_DELTA, scoreNumber, scoreYesNo, scoreRound, warpDays, displayDate, pointsToYear, type RoundItem,
} from './scoring';

describe('scoreNumber', () => {
  it('exact hit', () => expect(scoreNumber(10, 10, 5, 1)).toBe(30));
  it('within half a step is a hit', () => {
    expect(scoreNumber(10.4, 10, 5, 1)).toBe(30);
    expect(scoreNumber(9.6, 10, 5, 1)).toBe(30);
  });
  it('exactly half a step is not a hit', () => {
    // e = 0.5 -> s = 0.1 -> 30 - 4 = 26
    expect(scoreNumber(10.5, 10, 5, 1)).toBe(26);
  });
  it('float noise at 0.1 steps', () => {
    expect(scoreNumber(0.3, 0.1 + 0.2, 1, 0.1)).toBe(30);
    expect(scoreNumber(0.7, 0.1 * 7, 1, 0.1)).toBe(30);
    // true half-step difference (0.35 vs 0.3) must not count as hit even with noise
    expect(scoreNumber(0.35, 0.3, 1, 0.1)).toBeLessThan(30);
    expect(scoreNumber(0.25, 0.3, 1, 0.1)).toBeLessThan(30);
  });
  it('half-scale gives 10', () => expect(scoreNumber(15, 10, 10, 1)).toBe(10));
  it('at scale gives -10', () => expect(scoreNumber(20, 10, 10, 1)).toBe(-10));
  it('beyond scale clamps at -10', () => {
    expect(scoreNumber(1000, 10, 10, 1)).toBe(-10);
    expect(scoreNumber(-1000, 10, 10, 1)).toBe(-10);
  });
  it('symmetric above/below', () => expect(scoreNumber(7, 10, 10, 1)).toBe(scoreNumber(13, 10, 10, 1)));
  it('rounding', () => {
    // e=1, scale=8 -> s=.125 -> 25
    expect(scoreNumber(11, 10, 8, 0.5)).toBe(25);
    // e=1, scale=3 -> 30-13.333=16.67 -> 17
    expect(scoreNumber(11, 10, 3, 0.5)).toBe(17);
    // e=1, scale=7 -> 30-5.714=24.29 -> 24
    expect(scoreNumber(11, 10, 7, 0.5)).toBe(24);
    // 17.5 exactly rounds up: s=0.3125 -> e=2.5, scale=8
    expect(scoreNumber(12.5, 10, 8, 0.5)).toBe(18);
  });
  it('range is -10..30', () => {
    for (let g = 0; g <= 100; g += 3) {
      const p = scoreNumber(g, 40, 30, 1);
      expect(p).toBeGreaterThanOrEqual(-10);
      expect(p).toBeLessThanOrEqual(30);
    }
  });
});

describe('scoreYesNo', () => {
  it('correct/wrong', () => {
    expect(scoreYesNo(1, 1)).toBe(15);
    expect(scoreYesNo(0, 0)).toBe(15);
    expect(scoreYesNo(1, 0)).toBe(-10);
    expect(scoreYesNo(0, 1)).toBe(-10);
  });
});

const num = (id: string, guess: number | null, actual: number | null, staked = false): RoundItem => ({
  questionId: id, kind: 'number', guess, actual, scale: 10, step: 1, staked,
});
const yn = (id: string, guess: number | null, actual: number | null, staked = false): RoundItem => ({
  questionId: id, kind: 'yesno', guess, actual, scale: null, step: null, staked,
});

describe('scoreRound', () => {
  it('sums four questions', () => {
    const r = scoreRound([num('a', 10, 10), num('b', 15, 10), yn('c', 1, 1), yn('d', 0, 1)]);
    expect(r.perQuestion.map((q) => q.points)).toEqual([30, 10, 15, -10]);
    expect(r.delta).toBe(45);
    expect(r.missed).toBe(false);
    expect(r.perQuestion.every((q) => q.answered && !q.void)).toBe(true);
  });
  it('stake doubles positive points', () => {
    const r = scoreRound([num('a', 10, 10, true), yn('b', 1, 1)]);
    expect(r.perQuestion[0]).toMatchObject({ points: 60, staked: true });
    expect(r.delta).toBe(75);
  });
  it('stake doubles negative points', () => {
    const r = scoreRound([num('a', 100, 10, true), yn('b', 0, 1, false)]);
    expect(r.perQuestion[0].points).toBe(-20);
    expect(r.delta).toBe(-30);
    const r2 = scoreRound([yn('a', 0, 1, true), yn('b', 1, 1)]);
    expect(r2.perQuestion[0].points).toBe(-20);
    expect(r2.delta).toBe(-5);
  });
  it('void items give 0 and are flagged', () => {
    const r = scoreRound([num('a', 10, null), yn('b', 1, 1)]);
    expect(r.perQuestion[0]).toMatchObject({ points: 0, void: true, answered: true });
    expect(r.delta).toBe(15);
    expect(r.missed).toBe(false);
  });
  it('stake on void has no effect', () => {
    const r = scoreRound([yn('a', 1, null, true), yn('b', 1, 1)]);
    expect(r.perQuestion[0].points).toBe(0);
    expect(r.delta).toBe(15);
  });
  it('all unanswered -> missed round', () => {
    const r = scoreRound([num('a', null, 10), num('b', null, 10, true), yn('c', null, 1), yn('d', null, null)]);
    expect(r.missed).toBe(true);
    expect(r.delta).toBe(MISSED_ROUND_DELTA);
    expect(r.delta).toBe(-1);
    expect(r.perQuestion.every((q) => q.points === 0 && !q.answered)).toBe(true);
  });
  it('missed even when unanswered items are void', () => {
    expect(scoreRound([num('a', null, null)]).missed).toBe(true);
  });
  it('answered but all void is NOT missed, delta 0', () => {
    const r = scoreRound([num('a', 5, null), yn('b', 1, null)]);
    expect(r.missed).toBe(false);
    expect(r.delta).toBe(0);
  });
  it('partially answered: unanswered counts 0, not missed', () => {
    const r = scoreRound([num('a', 10, 10), num('b', null, 10), yn('c', null, 1), yn('d', 0, 1)]);
    expect(r.missed).toBe(false);
    expect(r.delta).toBe(20);
    expect(r.perQuestion.map((q) => q.answered)).toEqual([true, false, false, true]);
  });
  it('a lone wrong answer is not "missed"', () => {
    const r = scoreRound([yn('a', 0, 1), yn('b', null, 1)]);
    expect(r.missed).toBe(false);
    expect(r.delta).toBe(-10);
  });
  it('preserves order and ids', () => {
    expect(scoreRound([yn('x', 1, 1), yn('y', 1, 1)]).perQuestion.map((q) => q.questionId)).toEqual(['x', 'y']);
  });
});

describe('warpDays', () => {
  it('known values', () => {
    expect(warpDays(0)).toBe(0);
    expect(warpDays(1)).toBe(1);
    expect(warpDays(-1)).toBe(-1);
    expect(warpDays(10)).toBe(11);
    expect(warpDays(100)).toBe(200);
    expect(warpDays(-100)).toBe(-200);
    expect(Object.is(warpDays(0), 0)).toBe(true);
  });
  it('symmetric', () => {
    for (let x = 0; x <= 2000; x += 7) expect(warpDays(-x) === -warpDays(x)).toBe(true);
  });
  it('strictly monotonic', () => {
    for (let x = -3000; x < 3000; x++) expect(warpDays(x + 1)).toBeGreaterThan(warpDays(x));
  });
});

describe('displayDate from 2026-11-14', () => {
  const T = '2026-11-14';
  it('offset 0', () => expect(displayDate(T, 0)).toEqual({ year: 2026, month: 11, day: 14 }));
  it('offset +1 / -1', () => {
    expect(displayDate(T, 1)).toEqual({ year: 2026, month: 11, day: 15 });
    expect(displayDate(T, -1)).toEqual({ year: 2026, month: 11, day: 13 });
  });
  it('rolls over month and year', () => {
    expect(displayDate('2026-12-31', 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(displayDate('2026-01-01', -1)).toEqual({ year: 2025, month: 12, day: 31 });
    expect(displayDate('2027-02-28', 1)).toEqual({ year: 2027, month: 3, day: 1 });
    expect(displayDate('2028-02-28', 1)).toEqual({ year: 2028, month: 2, day: 29 });
  });
  it('+300, +690', () => {
    expect(displayDate(T, 300).year).toBe(2030);
    expect(displayDate(T, 690).year).toBeGreaterThanOrEqual(2040);
    expect(displayDate(T, 690).year).toBeLessThanOrEqual(2042);
  });
  it('-1000 (~1996), -5000 (medieval)', () => {
    const a = displayDate(T, -1000).year;
    expect(a).toBeGreaterThanOrEqual(1994);
    expect(a).toBeLessThanOrEqual(1998);
    const b = displayDate(T, -5000).year;
    expect(b).toBeGreaterThan(1000);
    expect(b).toBeLessThan(1500);
  });
  it('-20000 is before year 0', () => {
    const d = displayDate(T, -20000);
    expect(d.year).toBeLessThanOrEqual(0);
    expect(d.month).toBeGreaterThanOrEqual(1);
    expect(d.month).toBeLessThanOrEqual(12);
    expect(d.day).toBeGreaterThanOrEqual(1);
    expect(d.day).toBeLessThanOrEqual(31);
  });
  it('matches JS Date for in-range dates', () => {
    for (const off of [-3000, -777, -50, 0, 33, 250, 500]) {
      const days = warpDays(off);
      const js = new Date(Date.UTC(2026, 10, 14 + days));
      expect(displayDate(T, off)).toEqual({ year: js.getUTCFullYear(), month: js.getUTCMonth() + 1, day: js.getUTCDate() });
    }
  });
  it('proleptic Gregorian known anchors', () => {
    expect(displayDate('0001-01-01', -1)).toEqual({ year: 0, month: 12, day: 31 });
    // year 0 is a leap year (proleptic): Dec 31 of year 0 minus 305 days stays in year 0
    expect(displayDate('0001-01-01', -1).year).toBe(0);
    expect(displayDate('0000-03-01', -1)).toEqual({ year: 0, month: 2, day: 29 });
    expect(displayDate('0000-01-01', -1)).toEqual({ year: -1, month: 12, day: 31 });
  });
});

describe('pointsToYear', () => {
  const T = '2026-11-14';
  const cases: [number, number][] = [
    [0, 2027], [0, 2030], [0, 2041], [0, 2100], [250, 2100], [-300, 2026], [-300, 2030],
    [0, 1996], [0, 1500], [0, 1000], [0, 1], [0, -50], [-5000, 1000], [-5000, 900], [800, 3000], [5, 2026],
  ];
  it('returns 0 when already in target year', () => {
    expect(pointsToYear(T, 0, 2026)).toBe(0);
  });
  for (const [offset, year] of cases) {
    it(`offset ${offset} -> ${year}`, () => {
      const p = pointsToYear(T, offset, year);
      expect(p).toBeGreaterThanOrEqual(0);
      const cur = displayDate(T, offset).year;
      if (cur === year) {
        expect(p).toBe(0);
      } else if (year > cur) {
        const d = displayDate(T, offset + p);
        expect(d.year).toBeGreaterThanOrEqual(year);
        expect(p).toBeGreaterThan(0);
        expect(displayDate(T, offset + p - 1).year).toBeLessThan(year);
      } else {
        const d = displayDate(T, offset - p);
        expect(d.year).toBeLessThanOrEqual(year);
        expect(p).toBeGreaterThan(0);
        expect(displayDate(T, offset - p + 1).year).toBeGreaterThan(year);
      }
    });
  }
  it('is monotone in target year (ahead)', () => {
    let prev = 0;
    for (let y = 2027; y < 2200; y += 13) {
      const p = pointsToYear(T, 0, y);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
  it('2030 from today requires roughly 250ish points', () => {
    const p = pointsToYear(T, 0, 2030);
    expect(p).toBeGreaterThan(100);
    expect(p).toBeLessThan(400);
  });
});
