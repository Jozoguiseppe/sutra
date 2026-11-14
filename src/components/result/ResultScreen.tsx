'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RoundResultResponse } from '@/lib/api-types';
import { api, ApiError, errorKey } from '@/lib/client/api';
import { formatDate } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import Notice from '../Notice';
import Breakdown from './Breakdown';
import Crowd from './Crowd';
import Hero from './Hero';
import NextResults from './NextResults';
import ShareButton from './ShareButton';
import Standing from './Standing';
import Wildest from './Wildest';
import { parseYmd } from './dates';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: RoundResultResponse }
  | { kind: 'empty' }
  | { kind: 'error'; code: string };

export default function ResultScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const date = new URLSearchParams(window.location.search).get('date');
    const qs = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : '';
    api<RoundResultResponse>(`/api/round/result${qs}`)
      .then((data) => alive && setState({ kind: 'ready', data }))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setState({ kind: 'empty' });
        else setState({ kind: 'error', code: e instanceof ApiError ? e.code : 'unknown' });
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (state.kind === 'loading') {
    return (
      <main className="grid min-h-[70dvh] place-items-center px-4">
        <p role="status" className="text-center text-muted">{t('result.loading')}</p>
      </main>
    );
  }
  if (state.kind === 'empty') {
    return (
      <main className="mx-auto flex max-w-md flex-col items-start gap-4 px-4 pt-16">
        <div className="glass rounded-3xl p-5">
          <p className="text-lg font-bold">{t('result.empty')}</p>
        </div>
        <Link href="/" className="flex min-h-[44px] items-center rounded-xl bg-white/10 px-4 font-semibold text-mist">
          {t('nav.home')}
        </Link>
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

  const { data } = state;
  const me = data.me;
  const ymd = parseYmd(data.targetDate);
  const showMine = me !== null && me.played;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-7 px-4 pt-6">
      <div className="rise">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{t('result.title')}</p>
        {ymd ? <p className="mt-1 text-sm text-muted">{t('result.forDate', { date: formatDate(ymd) })}</p> : null}
      </div>

      {me ? <Hero me={me} targetDate={data.targetDate} /> : null}
      {me ? <Standing me={me} /> : null}
      {showMine ? <Breakdown questions={data.questions} /> : null}
      <Crowd questions={data.questions} players={data.players} hasMe={showMine} />
      <Wildest questions={data.questions} />
      {me && (me.played || me.missed) ? <ShareButton me={me} questions={data.questions} /> : null}
      <NextResults />
    </main>
  );
}
