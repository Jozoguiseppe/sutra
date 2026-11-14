'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { MeResponse } from '@/lib/api-types';
import { formatDays, formatYearBare, formatYearRange } from '@/lib/client/format';
import { pointsToYear } from '@/lib/scoring';
import { STATIONS, stationForYear } from '@/data/stations';
import { t } from '@/lib/i18n';

export default function Timeline({ me }: { me: MeResponse }) {
  const scroller = useRef<HTMLUListElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);
  const station = stationForYear(me.display.year);
  const idx = STATIONS.findIndex((s) => s.id === station.id);

  const { ahead, behind } = useMemo(() => {
    const next = STATIONS[idx + 1];
    const prev = STATIONS[idx - 1];
    return {
      ahead: next
        ? { year: next.fromYear, points: pointsToYear(me.today, me.player.offsetPoints, next.fromYear) }
        : null,
      behind: prev
        ? { year: prev.toYear, points: pointsToYear(me.today, me.player.offsetPoints, prev.toYear) }
        : null,
    };
  }, [idx, me.today, me.player.offsetPoints]);

  useEffect(() => {
    const box = scroller.current;
    const cur = currentRef.current;
    if (!box || !cur) return;
    box.scrollLeft = cur.offsetLeft - (box.clientWidth - cur.clientWidth) / 2;
  }, [idx]);

  return (
    <section aria-labelledby="timeline-title" className="rise" style={{ animationDelay: '60ms' }}>
      <h2 id="timeline-title" className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
        {t('home.timeline.title')}
      </h2>

      <div className="-mx-4 mt-2">
        <div className="flex items-center justify-between px-4 text-xs font-bold uppercase tracking-wider">
          <span className="text-dusk-300">&larr; {t('home.timeline.past')}</span>
          <span className="text-dawn-400">{t('home.timeline.future')} &rarr;</span>
        </div>

        <ul
          ref={scroller}
          tabIndex={0}
          aria-label={t('home.timeline.title')}
          className="hide-scrollbar mt-1 flex snap-x snap-proximity overflow-x-auto px-4 pb-2 pt-1"
        >
          {STATIONS.map((s, i) => {
            const state = i < idx ? 'past' : i > idx ? 'future' : 'now';
            return (
              <li
                key={s.id}
                ref={state === 'now' ? currentRef : undefined}
                aria-current={state === 'now' ? 'location' : undefined}
                className={`relative w-[7.5rem] shrink-0 snap-center pt-9 ${state === 'now' ? 'w-[8.5rem]' : ''}`}
              >
                {/* rail */}
                <span
                  aria-hidden
                  className={`absolute left-0 right-0 top-[1.15rem] h-0 border-t-2 ${
                    state === 'past'
                      ? 'border-dusk-500/70'
                      : state === 'future'
                        ? 'border-dashed border-dawn-500/60'
                        : 'border-dawn-500'
                  }`}
                />
                {/* node */}
                <span
                  aria-hidden
                  className={`absolute left-1/2 -translate-x-1/2 rounded-full ${
                    state === 'now'
                      ? 'pulse-ring top-[0.55rem] h-[1.4rem] w-[1.4rem] border-4 border-night-950 bg-dawn-500'
                      : state === 'past'
                        ? 'top-[0.9rem] h-3 w-3 bg-dusk-400'
                        : 'top-[0.9rem] h-3 w-3 border-2 border-dawn-400 bg-night-950'
                  }`}
                />
                {state === 'now' ? (
                  <span className="absolute left-1/2 top-[-0.45rem] -translate-x-1/2 rounded-full bg-dawn-500 px-2.5 py-0.5 text-xs font-extrabold text-night-950">
                    {t('app.you')}
                  </span>
                ) : null}

                <div
                  className={`mx-1 flex h-full flex-col rounded-2xl border p-2.5 ${
                    state === 'now'
                      ? 'border-dawn-500/70 bg-dawn-500/10'
                      : state === 'past'
                        ? 'border-dusk-500/25 bg-dusk-500/[0.07] opacity-80'
                        : 'border-dawn-500/25 bg-dawn-500/[0.06]'
                  }`}
                >
                  <span aria-hidden className="text-2xl leading-none">{s.emoji}</span>
                  <span className="mt-1.5 text-sm font-bold leading-tight">{t(s.titleKey)}</span>
                  <span
                    className={`num mt-1 text-[0.7rem] leading-tight ${
                      state === 'past' ? 'text-dusk-300' : 'text-dawn-300'
                    }`}
                  >
                    {formatYearRange(s.fromYear, s.toYear)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        {ahead ? (
          <p className="text-base font-semibold text-dawn-300">
            {t('result.near', { year: formatYearBare(ahead.year), days: formatDays(ahead.points) })}
          </p>
        ) : null}
        {behind ? (
          <p className="text-sm text-dusk-300">
            {t('result.near.back', { year: formatYearBare(behind.year), days: formatDays(behind.points) })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
