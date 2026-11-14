'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorCode } from '@/lib/client/api';

type Slot<T> = { data: T | null; error: string | null; status: number | null };

/** GET `path` on mount (and on `reload`). Keeps the last data while reloading. */
export function useApiData<T>(path: string) {
  const [slot, setSlot] = useState<Slot<T>>({ data: null, error: null, status: null });

  const reload = useCallback(async () => {
    try {
      const data = await api<T>(path);
      setSlot({ data, error: null, status: 200 });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      setSlot((prev) => ({ data: prev.data, error: errorCode(e), status }));
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...slot, reload };
}
