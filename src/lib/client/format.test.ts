import { describe, expect, it } from 'vitest';
import {
  displayYear, formatCountdown, formatDate, formatDays, formatNumber, formatQuantity, formatYear,
  formatYearBare, nicknameProblem, normalizeSearch, pluralCategory, stepDecimals,
} from './format';
import { filterCounties } from './cities';

describe('dates', () => {
  it('formats a modern date', () => {
    expect(formatDate({ year: 2026, month: 11, day: 14 })).toBe('14. studenoga 2026.');
  });
  it('formats BC dates as 1 - year', () => {
    expect(formatDate({ year: 0, month: 3, day: 1 })).toBe('1. ožujka 1. pr. Kr.');
    expect(formatDate({ year: -44, month: 3, day: 15 })).toBe('15. ožujka 45. pr. Kr.');
  });
  it('groups large years', () => {
    expect(formatYear(12000)).toBe('12 000.');
    expect(formatYear(-70000000)).toBe('70 000 001. pr. Kr.');
    expect(formatYear(2026)).toBe('2026.');
  });
  it('bare year drops the trailing dot only', () => {
    expect(formatYearBare(1358)).toBe('1358');
    expect(formatYearBare(-3000)).toBe('3001. pr. Kr');
  });
  it('displayYear', () => {
    expect(displayYear(0)).toBe(1);
    expect(displayYear(-1)).toBe(2);
    expect(displayYear(5)).toBe(5);
  });
});

describe('plural', () => {
  it('follows Croatian rules', () => {
    expect(pluralCategory(1)).toBe('one');
    expect(pluralCategory(21)).toBe('one');
    expect(pluralCategory(11)).toBe('other');
    expect(pluralCategory(2)).toBe('few');
    expect(pluralCategory(24)).toBe('few');
    expect(pluralCategory(12)).toBe('other');
    expect(pluralCategory(14)).toBe('other');
    expect(pluralCategory(0)).toBe('other');
    expect(pluralCategory(100)).toBe('other');
    expect(pluralCategory(101)).toBe('one');
  });
  it('formats days', () => {
    expect(formatDays(1)).toBe('1 dan');
    expect(formatDays(3)).toBe('3 dana');
    expect(formatDays(11)).toBe('11 dana');
    expect(formatDays(12345)).toBe('12 345 dana');
  });
});

describe('countdown', () => {
  it('formats h:mm:ss', () => {
    expect(formatCountdown(0)).toBe('0:00:00');
    expect(formatCountdown(-5000)).toBe('0:00:00');
    expect(formatCountdown(61_000)).toBe('0:01:01');
    expect(formatCountdown(3_661_999)).toBe('1:01:01');
    expect(formatCountdown(23 * 3600_000 + 59 * 60_000 + 59_000)).toBe('23:59:59');
  });
});

describe('numbers', () => {
  it('derives decimals from step', () => {
    expect(stepDecimals(0.1)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(5)).toBe(0);
    expect(stepDecimals(null)).toBe(0);
    expect(stepDecimals(1e-7)).toBe(6);
  });
  it('uses decimal comma and grouping', () => {
    expect(formatNumber(12.5, 0.1)).toBe('12,5');
    expect(formatNumber(-3.04, 0.1)).toBe('-3,0');
    expect(formatNumber(1500000, 1)).toBe('1 500 000');
    expect(formatNumber(-0.01, 0.1)).toBe('0,0');
  });
  it('appends unit', () => {
    expect(formatQuantity(21, 1, '°C')).toBe('21 °C');
    expect(formatQuantity(21, 1, null)).toBe('21');
  });
});

describe('nickname & search', () => {
  it('validates nickname', () => {
    expect(nicknameProblem('ab')).toBe('short');
    expect(nicknameProblem('  ab  ')).toBe('short');
    expect(nicknameProblem('a'.repeat(21))).toBe('long');
    expect(nicknameProblem('Putnik_1-x č')).toBeNull();
    expect(nicknameProblem('bad!!')).toBe('invalid');
  });
  it('normalizes search text', () => {
    expect(normalizeSearch('  Đakovo ')).toBe('dakovo');
    expect(normalizeSearch('Šibenik')).toBe('sibenik');
  });
  it('filters counties', () => {
    const counties = [
      { id: 1, name: 'Zagrebačka', cities: [{ id: 1, name: 'Velika Gorica' }, { id: 2, name: 'Samobor' }] },
      { id: 2, name: 'Splitsko-dalmatinska', cities: [{ id: 3, name: 'Šibenik' }] },
    ];
    expect(filterCounties(counties, '')).toBe(counties);
    expect(filterCounties(counties, 'sibe')).toEqual([{ id: 2, name: 'Splitsko-dalmatinska', cities: [{ id: 3, name: 'Šibenik' }] }]);
    expect(filterCounties(counties, 'zagreb')[0].cities).toHaveLength(2);
    expect(filterCounties(counties, 'xyz')).toEqual([]);
  });
});
