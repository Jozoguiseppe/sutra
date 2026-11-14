// Pure time helpers for the game timezone (Europe/Zagreb). Never call Date.now() here.

const TZ = 'Europe/Zagreb';

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function zagrebParts(now: Date): Parts {
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Zagreb calendar date of an instant, YYYY-MM-DD. */
export function zagrebDate(now: Date): string {
  const { y, m, d } = zagrebParts(now);
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Zagreb wall-clock hour (0-23) of an instant. */
export function zagrebHour(now: Date): number {
  return zagrebParts(now).h;
}

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Add n (possibly negative) calendar days to a YYYY-MM-DD date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** UTC offset of Zagreb at a given instant, in ms (e.g. +3600000 winter). */
function offsetMs(instant: Date): number {
  const p = zagrebParts(instant);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instant at which Zagreb wall clock reads `date` `hour`:00 (hour is never in a DST gap). */
function zagrebWallToInstant(date: string, hour: number): Date {
  const [y, m, d] = parseDate(date);
  const local = Date.UTC(y, m - 1, d, hour, 0, 0);
  const guess = local - offsetMs(new Date(local - 3600_000));
  return new Date(local - offsetMs(new Date(guess)));
}

/** Zagreb midnight starting day D: the round for D is locked from this instant on. */
export function lockInstant(targetDate: string): Date {
  return zagrebWallToInstant(targetDate, 0);
}

/** 20:00 Zagreb on day D. */
export function settleInstant(targetDate: string): Date {
  return zagrebWallToInstant(targetDate, 20);
}

/** The round players can currently predict (tomorrow, Zagreb). */
export function openRoundDate(now: Date): string {
  return addDays(zagrebDate(now), 1);
}

/** The round that is locked and awaiting settlement (today, Zagreb). */
export function pendingRoundDate(now: Date): string {
  return zagrebDate(now);
}
