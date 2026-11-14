'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OpenRoundResponse, PendingRoundResponse } from '@/lib/api-types';
import { api, errorCode } from './api';

type Slot<T> = { data: T | null; error: string | null };

/** Loads the open (tomorrow) and pending (today) rounds; `reload` refetches both without flicker. */
export function useRounds() {
  const [open, setOpen] = useState<Slot<OpenRoundResponse>>({ data: null, error: null });
  const [pending, setPending] = useState<Slot<PendingRoundResponse>>({ data: null, error: null });

  const reload = useCallback(async () => {
    const [o, p] = await Promise.allSettled([
      api<OpenRoundResponse>('/api/round/open'),
      api<PendingRoundResponse>('/api/round/pending'),
    ]);
    setOpen((prev) =>
      o.status === 'fulfilled' ? { data: o.value, error: null } : { data: prev.data, error: errorCode(o.reason) },
    );
    setPending((prev) =>
      p.status === 'fulfilled' ? { data: p.value, error: null } : { data: prev.data, error: errorCode(p.reason) },
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set after awaiting
    void reload();
  }, [reload]);

  return { open, pending, reload };
}
