'use client';

import { useEffect, useState } from 'react';

/** Wall-clock milliseconds, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Milliseconds until an ISO instant (never below 0), ticking each second. */
export function useCountdown(iso: string | null): number {
  const now = useNow(1000);
  if (!iso) return 0;
  return Math.max(0, new Date(iso).getTime() - now);
}
