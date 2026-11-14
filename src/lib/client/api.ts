/** Thin fetch wrapper for the JSON API. Errors carry the server `{error}` code. */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers });
  } catch {
    throw new ApiError('network', 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : 'unknown';
    throw new ApiError(code, res.status);
  }
  return body as T;
}

/** JSON request with a body, e.g. apiSend('/api/player', 'POST', {...}). */
export function apiSend<T>(path: string, method: 'POST' | 'PUT', payload: unknown): Promise<T> {
  return api<T>(path, { method, body: JSON.stringify(payload) });
}

const ERROR_KEYS: Record<string, string> = {
  nickname_short: 'onboard.nickname.error.tooShort',
  nickname_long: 'onboard.nickname.error.tooLong',
  nickname_invalid: 'onboard.nickname.error.invalid',
  nickname_taken: 'onboard.nickname.error.taken',
  city_invalid: 'onboard.city.error.required',
  locked: 'error.locked',
  invalid_value: 'error.invalidValue',
  no_player: 'error.unauthorized',
  network: 'error.network',
  not_found: 'error.notFound',
  question_not_found: 'error.notFound',
  no_result: 'error.notFound',
  bad_token: 'error.forbidden',
};

/** Message key for an API error code (falls back to `error.unknown`). */
export function errorKey(code: string): string {
  return ERROR_KEYS[code] ?? 'error.unknown';
}

export function errorCode(e: unknown): string {
  return e instanceof ApiError ? e.code : 'unknown';
}
