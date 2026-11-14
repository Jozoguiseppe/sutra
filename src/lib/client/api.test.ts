import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, apiSend, errorKey } from './api';

afterEach(() => vi.unstubAllGlobals());

function stub(res: Response | Error) {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('api', () => {
  it('returns parsed JSON', async () => {
    stub(Response.json({ a: 1 }));
    expect(await api<{ a: number }>('/x')).toEqual({ a: 1 });
  });
  it('throws ApiError with the server code', async () => {
    stub(Response.json({ error: 'nickname_taken' }, { status: 409 }));
    await expect(api('/x')).rejects.toMatchObject({ code: 'nickname_taken', status: 409 });
  });
  it('falls back to unknown for non-JSON errors', async () => {
    stub(new Response('boom', { status: 500 }));
    const err = (await api('/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('unknown');
  });
  it('maps network failures', async () => {
    stub(new TypeError('failed'));
    await expect(api('/x')).rejects.toMatchObject({ code: 'network', status: 0 });
  });
  it('sends JSON bodies with content-type', async () => {
    const fn = stub(Response.json({ ok: true }));
    await apiSend('/x', 'PUT', { v: 1 });
    const init = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[1].method).toBe('PUT');
    expect(init[1].body).toBe('{"v":1}');
    expect((init[1].headers as Headers).get('content-type')).toBe('application/json');
  });
  it('maps error codes to message keys', () => {
    expect(errorKey('nickname_taken')).toBe('onboard.nickname.error.taken');
    expect(errorKey('locked')).toBe('error.locked');
    expect(errorKey('???')).toBe('error.unknown');
  });
});
