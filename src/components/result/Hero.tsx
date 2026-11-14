'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RoundResultResponse } from '@/lib/api-types';
import { formatDate, formatDays, formatYearBare } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import { STATIONS, stationForYear } from '@/data/stations';
import { pointsToYear } from '@/lib/scoring';
import { daysToYmd, easeOutCubic, ymdToDays } from './dates';

type Me = NonNullable<RoundResultResponse['me']>;
const DURATION_MS = 1500;

function useJumpProgress(key: string, skip: boolean): number {
  const [state, setState] = useState({ key, p: 0 });
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const x = reduced || skip ? 1 : Math.min(1, Math.max(0, (now - start) / DURATION_MS));
      setState({ key, p: easeOutCubic(x) });
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, skip]);
  return state.key === key ? state.p : 0;
}

export default function Hero({ me, targetDate }: { me: Me; targetDate: string }) {
  const from = ymdToDays(me.displayBefore);
  const to = ymdToDays(me.displayAfter);
  const progress = useJumpProgress(`${from}:${to}`, from === to);
  const shown = daysToYmd(Math.round(from + (to - from) * progress));
  const finalDate = formatDate(me.displayAfter);

  const before = stationForYear(me.displayBefore.year);
  const after = stationForYear(me.displayAfter.year);
  const changed = before.id !== after.id;

  const near = useMemo(() => {
    const next = STATIONS[STATIONS.findIndex((s) => s.id === after.id) + 1];
    if (!next) return null;
    const points = pointsToYear(targetDate, me.offsetAfter, next.fromYear);
    return points > 0 ? { year: next.fromYear, points } : null;
  }, [after.id, targetDate, me.offsetAfter]);

  const dir = me.delta > 0 ? 'forward' : me.delta < 0 ? 'backward' : 'none';
  const headline =
    dir === 'forward'
      ? t('result.hero.forward', { days: formatDays(me.delta) })
      : dir === 'backward'
        ? t('result.hero.backward', { days: formatDays(-me.delta) })
        : t('result.jump.none');

  return (
    <header className="rise">
      <p
        className={`text-sm font-extrabold uppercase tracking-[0.14em] ${
          dir === 'forward' ? 'text-dawn-300' : dir === 'backward' ? 'text-dusk-300' : 'text-muted'
        }`}
      >
        {headline}
      </p>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-dawn-400">{t('result.era.title')}</p>
      <h1
        className="num mt-1 font-extrabold leading-[1.02] tracking-tight text-mist [overflow-wrap:anywhere] [text-wrap:balance]"
        style={{ fontSize: 'clamp(2.25rem, 12vw, 3.5rem)' }}
      >
        <span aria-hidden>{formatDate(shown)}</span>
        <span className="sr-only">{finalDate}</span>
      </h1>
      <p className="mt-1 text-sm text-muted">{t('result.oldDate', { date: formatDate(me.displayBefore) })}</p>

      <div className="glass mt-4 flex gap-4 rounded-3xl p-4">
        <span aria-hidden className="text-5xl leading-none">{after.emoji}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{t(after.titleKey)}</h2>
          <p className="mt-1 text-sm leading-snug text-muted">{t(after.descKey)}</p>
        </div>
      </div>

      {changed ? (
        <p
          role="status"
          className="pulse-ring rise mt-3 inline-block rounded-full bg-dawn-500 px-4 py-1.5 text-sm font-extrabold text-night-950"
          style={{ animationDelay: '1.4s' }}
        >
          {t('result.stationChanged', { from: t(before.titleKey) })}
        </p>
      ) : null}

      {near ? (
        <p className="mt-3 text-base font-semibold text-dawn-300">
          {t('result.near', { year: formatYearBare(near.year), days: formatDays(near.points) })}
        </p>
      ) : null}
    </header>
  );
}
