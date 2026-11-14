import { describe, it, expect, afterEach } from 'vitest';
import { zagrebDate, zagrebHour, addDays, lockInstant, settleInstant, openRoundDate, pendingRoundDate } from './time';
import { getNow } from './now';

const iso = (d: Date) => d.toISOString();

describe('zagrebDate / zagrebHour', () => {
  it('winter is UTC+1', () => {
    const d = new Date('2026-01-15T23:30:00Z');
    expect(zagrebDate(d)).toBe('2026-01-16');
    expect(zagrebHour(d)).toBe(0);
  });
  it('summer is UTC+2', () => {
    const d = new Date('2026-07-15T21:59:59Z');
    expect(zagrebDate(d)).toBe('2026-07-15');
    expect(zagrebHour(d)).toBe(23);
    expect(zagrebDate(new Date('2026-07-15T22:00:00Z'))).toBe('2026-07-16');
  });
  it('March transition (2026-03-29 01:00Z)', () => {
    expect(zagrebHour(new Date('2026-03-29T00:59:59Z'))).toBe(1);
    expect(zagrebHour(new Date('2026-03-29T01:00:00Z'))).toBe(3);
  });
  it('October transition (2026-10-25 01:00Z)', () => {
    expect(zagrebHour(new Date('2026-10-25T00:59:59Z'))).toBe(2);
    expect(zagrebHour(new Date('2026-10-25T01:00:00Z'))).toBe(2);
    expect(zagrebHour(new Date('2026-10-25T02:00:00Z'))).toBe(3);
  });
  it('year boundary', () => {
    expect(zagrebDate(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });
});

describe('addDays', () => {
  it('basic and negative', () => {
    expect(addDays('2026-11-14', 1)).toBe('2026-11-15');
    expect(addDays('2026-11-14', -14)).toBe('2026-10-31');
    expect(addDays('2026-11-14', 0)).toBe('2026-11-14');
  });
  it('month / year / leap boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
  it('is unaffected by DST days', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });
  it('rejects bad input', () => {
    expect(() => addDays('nope', 1)).toThrow();
  });
});

describe('lockInstant / settleInstant', () => {
  it('winter day: midnight = 23:00Z previous day, 20:00 = 19:00Z', () => {
    expect(iso(lockInstant('2026-01-15'))).toBe('2026-01-14T23:00:00.000Z');
    expect(iso(settleInstant('2026-01-15'))).toBe('2026-01-15T19:00:00.000Z');
  });
  it('summer day: midnight = 22:00Z previous day, 20:00 = 18:00Z', () => {
    expect(iso(lockInstant('2026-07-15'))).toBe('2026-07-14T22:00:00.000Z');
    expect(iso(settleInstant('2026-07-15'))).toBe('2026-07-15T18:00:00.000Z');
  });
  it('March DST day 2026-03-29: lock still CET, settle CEST', () => {
    expect(iso(lockInstant('2026-03-29'))).toBe('2026-03-28T23:00:00.000Z');
    expect(iso(settleInstant('2026-03-29'))).toBe('2026-03-29T18:00:00.000Z');
    // day after: both CEST
    expect(iso(lockInstant('2026-03-30'))).toBe('2026-03-29T22:00:00.000Z');
  });
  it('October DST day 2026-10-25: lock still CEST, settle CET', () => {
    expect(iso(lockInstant('2026-10-25'))).toBe('2026-10-24T22:00:00.000Z');
    expect(iso(settleInstant('2026-10-25'))).toBe('2026-10-25T19:00:00.000Z');
    expect(iso(lockInstant('2026-10-26'))).toBe('2026-10-25T23:00:00.000Z');
  });
  it('round trip: lock is exactly Zagreb 00:00 of D, one ms before is D-1', () => {
    for (const d of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26', '2027-03-28', '2026-06-01']) {
      const l = lockInstant(d);
      expect(zagrebDate(l)).toBe(d);
      expect(zagrebHour(l)).toBe(0);
      expect(zagrebDate(new Date(l.getTime() - 1))).toBe(addDays(d, -1));
      const s = settleInstant(d);
      expect(zagrebDate(s)).toBe(d);
      expect(zagrebHour(s)).toBe(20);
      expect(zagrebHour(new Date(s.getTime() - 1))).toBe(19);
    }
  });
  it('day length is 23h on March DST day and 25h on October DST day', () => {
    expect(lockInstant('2026-03-30').getTime() - lockInstant('2026-03-29').getTime()).toBe(23 * 3600_000);
    expect(lockInstant('2026-10-26').getTime() - lockInstant('2026-10-25').getTime()).toBe(25 * 3600_000);
  });
});

describe('openRoundDate / pendingRoundDate', () => {
  it('open = tomorrow Zagreb, pending = today Zagreb', () => {
    const now = new Date('2026-11-14T10:00:00Z');
    expect(pendingRoundDate(now)).toBe('2026-11-14');
    expect(openRoundDate(now)).toBe('2026-11-15');
  });
  it('uses Zagreb date near UTC midnight', () => {
    const now = new Date('2026-11-14T23:30:00Z'); // 00:30 Zagreb on the 15th
    expect(pendingRoundDate(now)).toBe('2026-11-15');
    expect(openRoundDate(now)).toBe('2026-11-16');
  });
  it('open round is not yet locked, pending is', () => {
    const now = new Date('2026-03-28T23:30:00Z'); // 00:30 CET on 03-29
    expect(now.getTime() >= lockInstant(pendingRoundDate(now)).getTime()).toBe(true);
    expect(now.getTime() < lockInstant(openRoundDate(now)).getTime()).toBe(true);
  });
});

describe('getNow', () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { f: env.FAKE_NOW, n: env.NODE_ENV };
  afterEach(() => {
    if (saved.f === undefined) delete env.FAKE_NOW; else env.FAKE_NOW = saved.f;
    env.NODE_ENV = saved.n;
  });
  it('honours FAKE_NOW outside production', () => {
    env.NODE_ENV = 'test';
    env.FAKE_NOW = '2026-11-14T10:00:00Z';
    expect(iso(getNow())).toBe('2026-11-14T10:00:00.000Z');
  });
  it('ignores FAKE_NOW in production', () => {
    env.NODE_ENV = 'production';
    env.FAKE_NOW = '2020-01-01T00:00:00Z';
    expect(getNow().getUTCFullYear()).toBeGreaterThanOrEqual(2025);
  });
  it('ignores an invalid FAKE_NOW', () => {
    env.NODE_ENV = 'test';
    env.FAKE_NOW = 'garbage';
    expect(Number.isNaN(getNow().getTime())).toBe(false);
  });
});
