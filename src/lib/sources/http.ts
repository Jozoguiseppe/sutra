// Tiny fetch-JSON helper: timeout + one retry, injectable fetch for tests. Never throws.

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

export interface FetchJsonOptions {
  fetchFn?: FetchLike;
  timeoutMs?: number;
  /** Number of retries after the first attempt (default 1). */
  retries?: number;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET url and parse JSON. Returns null on any network, HTTP (non-2xx) or parse failure. */
export async function fetchJson(url: string, opts: FetchJsonOptions = {}): Promise<unknown | null> {
  const fetchFn: FetchLike = opts.fetchFn ?? ((u, i) => fetch(u, i) as unknown as Promise<FetchResponseLike>);
  const timeoutMs = opts.timeoutMs ?? 8000;
  const retries = opts.retries ?? 1;
  const delay = opts.retryDelayMs ?? 400;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let retryable = true;
    try {
      const res = await fetchFn(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (res.ok) return await res.json();
      // 4xx (except 429) will not get better by retrying.
      retryable = res.status >= 500 || res.status === 429;
    } catch {
      retryable = true;
    } finally {
      clearTimeout(timer);
    }
    if (!retryable || attempt === retries) return null;
    if (delay > 0) await sleep(delay);
  }
  return null;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Finite number from a number or numeric string, else null. */
export function toNum(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
