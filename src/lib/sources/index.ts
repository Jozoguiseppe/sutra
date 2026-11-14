import type { SourceAdapter } from './types';
import { mockAdapter } from './mock';
import { liveAdapters } from './live';

export { makeRng, hash01, hashString, shuffle } from './rng';

/** Adapters used to PROPOSE questions: live ones when SOURCES=live, else the mock. */
export function activeAdapters(): SourceAdapter[] {
  return process.env.SOURCES === 'live' ? [...liveAdapters] : [mockAdapter];
}

/** Any adapter by key, for resolving. The mock is always available. */
export function getAdapter(key: string): SourceAdapter | undefined {
  if (key === mockAdapter.key) return mockAdapter;
  return liveAdapters.find((a) => a.key === key);
}

export { mockAdapter };
