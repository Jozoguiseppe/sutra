'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import type { MeResponse } from '@/lib/api-types';
import { useRounds } from '@/lib/client/useRounds';
import { errorKey } from '@/lib/client/api';
import { formatDate } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import { stationForYear } from '@/data/stations';
import Notice from './Notice';
import PendingSection from './PendingSection';
import PredictionsSection from './PredictionsSection';
import Timeline from './Timeline';

export default function Home({ me, onRefreshMe }: { me: MeResponse; onRefreshMe: () => void | Promise<void> }) {
  const { open, pending, reload } = useRounds();
  const station = stationForYear(me.display.year);
  const date = formatDate(me.display);

  const refreshMeRef = useRef(onRefreshMe);
  useEffect(() => {
    refreshMeRef.current = onRefreshMe;
  }, [onRefreshMe]);
  const handleExpired = useCallback(() => {
    void reload();
    void refreshMeRef.current();
  }, [reload]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-7 px-4 pt-6">
      <header className="rise">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">{t('home.greeting', { nick: me.player.nickname })}</p>
          <Link href="/pravila" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-dawn-400 underline underline-offset-4">
            {t('rules.link')}
          </Link>
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-dawn-400">
          {t('home.position.label')}
        </p>
        <h1
          className="num mt-1 font-extrabold leading-[1.02] tracking-tight text-mist [overflow-wrap:anywhere] [text-wrap:balance]"
          style={{ fontSize: 'clamp(2.25rem, 12vw, 3.5rem)' }}
        >
          {date}
        </h1>

        <div className="glass mt-4 flex gap-4 rounded-3xl p-4">
          <span aria-hidden className="text-5xl leading-none">{station.emoji}</span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">{t(station.titleKey)}</h2>
            <p className="mt-1 text-sm leading-snug text-muted">{t(station.descKey)}</p>
          </div>
        </div>
      </header>

      <Timeline me={me} />

      {open.data ? (
        <PredictionsSection key={open.data.targetDate} round={open.data} onExpired={handleExpired} />
      ) : open.error ? (
        <Notice tone="error" message={t(errorKey(open.error))} actionLabel={t('error.retry')} onAction={() => void reload()} />
      ) : (
        <p role="status" className="text-muted">{t('app.loading')}</p>
      )}

      {pending.data ? (
        <PendingSection pending={pending.data} onReload={reload} />
      ) : pending.error ? (
        <Notice tone="error" message={t(errorKey(pending.error))} actionLabel={t('error.retry')} onAction={() => void reload()} />
      ) : null}
    </main>
  );
}
