'use client';

import { useEffect, useState } from 'react';
import type { MeResponse } from '@/lib/api-types';
import { api, ApiError, errorKey } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import Home from './Home';
import Onboarding from './Onboarding';
import Notice from './Notice';

type State =
  | { kind: 'loading' }
  | { kind: 'onboarding' }
  | { kind: 'home'; me: MeResponse }
  | { kind: 'error'; code: string };

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    api<MeResponse>('/api/me')
      .then((me) => alive && setState({ kind: 'home', me }))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) setState({ kind: 'onboarding' });
        else setState({ kind: 'error', code: e instanceof ApiError ? e.code : 'unknown' });
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (state.kind === 'onboarding') document.body.dataset.onboarding = '';
    else delete document.body.dataset.onboarding;
    return () => {
      delete document.body.dataset.onboarding;
    };
  }, [state.kind]);

  async function refreshMe() {
    try {
      const me = await api<MeResponse>('/api/me');
      setState({ kind: 'home', me });
    } catch {
      /* keep showing the last known state */
    }
  }

  if (state.kind === 'loading') {
    return (
      <main className="grid min-h-[70dvh] place-items-center">
        <p role="status" className="text-muted">{t('app.loading')}</p>
      </main>
    );
  }
  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-md px-4 pt-16">
        <Notice
          tone="error"
          message={t(errorKey(state.code))}
          actionLabel={t('error.retry')}
          onAction={() => {
            setState({ kind: 'loading' });
            setAttempt((n) => n + 1);
          }}
        />
      </main>
    );
  }
  if (state.kind === 'onboarding') {
    return <Onboarding onDone={(me) => setState({ kind: 'home', me })} />;
  }
  return <Home me={state.me} onRefreshMe={refreshMe} />;
}
