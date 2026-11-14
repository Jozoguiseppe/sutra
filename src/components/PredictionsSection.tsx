'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenRoundResponse } from '@/lib/api-types';
import { useCountdown } from '@/lib/client/hooks';
import { formatCountdown } from '@/lib/client/format';
import { usePredictions } from '@/lib/client/usePredictions';
import { t } from '@/lib/i18n';
import PredictionCard from './PredictionCard';

export default function PredictionsSection({ round, onExpired }: { round: OpenRoundResponse; onExpired: () => void }) {
  const ms = useCountdown(round.lockAt);
  const [lockedByServer, setLockedByServer] = useState(false);
  const locked = ms <= 0 || lockedByServer;
  const onLocked = useCallback(() => setLockedByServer(true), []);
  const { predictions, status, save, retry } = usePredictions(round.predictions, onLocked);

  const expiredRef = useRef(onExpired);
  useEffect(() => {
    expiredRef.current = onExpired;
  }, [onExpired]);
  useEffect(() => {
    if (!locked) return;
    const first = setTimeout(() => expiredRef.current(), 1000);
    const again = setInterval(() => expiredRef.current(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(again);
    };
  }, [locked]);

  const questions = [...round.questions].sort((a, b) => a.position - b.position);
  const total = questions.length;
  const done = questions.filter((q) => predictions.some((p) => p.questionId === q.id)).length;

  return (
    <section aria-labelledby="predictions-title" className="rise" style={{ animationDelay: '120ms' }}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="predictions-title" className="text-2xl font-extrabold tracking-tight">
            {t('home.predictions.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('home.predictions.subtitle')}</p>
        </div>
        <div className="shrink-0 text-right" aria-label={t('home.progress', { done, total })}>
          <span className="num text-3xl font-extrabold text-dawn-400">
            {t('home.progress.short', { done, total })}
          </span>
        </div>
      </div>

      <div aria-hidden className="mt-3 flex gap-1.5">
        {questions.map((q) => (
          <span
            key={q.id}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              predictions.some((p) => p.questionId === q.id) ? 'bg-dawn-500' : 'bg-white/15'
            }`}
          />
        ))}
      </div>

      <p className="mt-3 text-sm text-muted">
        <span className="font-semibold text-dawn-300">{t('home.lock.label')}.</span>{' '}
        {locked ? null : (
          <span className="num font-semibold text-mist">{t('home.lock.countdown', { time: formatCountdown(ms) })}</span>
        )}
      </p>
      <p className="mt-1 text-xs text-muted">{t('home.stake.explain')}</p>

      {locked ? (
        <div role="status" className="glass mt-4 rounded-2xl border-dusk-500/40 p-4">
          <h3 className="font-bold text-dusk-300">{t('home.locked.title')}</h3>
          <p className="mt-1 text-sm text-muted">{t('home.locked.body')}</p>
        </div>
      ) : null}

      <ol className="mt-4 flex flex-col gap-4">
        {questions.map((q) => (
          <li key={q.id}>
            <PredictionCard
              question={q}
              prediction={predictions.find((p) => p.questionId === q.id) ?? null}
              status={status[q.id] ?? null}
              locked={locked}
              onValue={(value) => {
                const cur = predictions.find((p) => p.questionId === q.id);
                void save(q.id, value, cur?.staked ?? false);
              }}
              onStake={(on) => {
                const cur = predictions.find((p) => p.questionId === q.id);
                if (cur) void save(q.id, cur.value, on);
              }}
              onRetry={() => retry(q.id)}
            />
          </li>
        ))}
      </ol>

      {total > 0 && done === total && !locked ? (
        <p role="status" className="mt-4 rounded-2xl bg-dawn-500/10 p-3 text-center font-semibold text-dawn-300">
          {t('home.allSaved')}
        </p>
      ) : null}
    </section>
  );
}
