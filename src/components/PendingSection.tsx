'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { PendingRoundResponse, QuestionDTO, PredictionDTO } from '@/lib/api-types';
import { useCountdown } from '@/lib/client/hooks';
import { formatCountdown, formatQuantity } from '@/lib/client/format';
import { t } from '@/lib/i18n';

function guessText(q: QuestionDTO, p: PredictionDTO): string {
  return q.kind === 'yesno' ? t(p.value === 1 ? 'home.yes' : 'home.no') : formatQuantity(p.value, q.step, q.unit);
}

export default function PendingSection({ pending, onReload }: { pending: PendingRoundResponse; onReload: () => void }) {
  const ms = useCountdown(pending.settleAt);
  const waiting = !pending.settled;
  const due = waiting && pending.settleAt !== null && ms <= 0;

  // After 20:00, keep polling until the server reports the round as settled.
  const reloadRef = useRef(onReload);
  useEffect(() => {
    reloadRef.current = onReload;
  }, [onReload]);
  useEffect(() => {
    if (!due) return;
    const id = setInterval(() => reloadRef.current(), 20000);
    return () => clearInterval(id);
  }, [due]);

  if (!pending.targetDate) return null;
  const questions = [...pending.questions].sort((a, b) => a.position - b.position);

  return (
    <section aria-labelledby="pending-title" className="rise" style={{ animationDelay: '180ms' }}>
      <h2 id="pending-title" className="text-xl font-extrabold tracking-tight">{t('home.pending.title')}</h2>

      {pending.settled ? (
        <div className="mt-3 rounded-3xl bg-gradient-to-br from-dawn-500/25 to-dusk-500/15 p-4 ring-1 ring-dawn-500/40">
          <p className="text-lg font-extrabold text-dawn-300">{t('home.pending.settled')}</p>
          <Link
            href="/rezultat"
            className="mt-3 flex min-h-[56px] items-center justify-center rounded-2xl bg-gradient-to-r from-dawn-500 to-dawn-400 px-6 text-lg font-extrabold text-night-950 shadow-[0_8px_30px_rgba(255,138,61,0.35)] transition-transform active:scale-[0.98]"
          >
            {t('home.lastResult')}
          </Link>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">
          <span className="font-semibold text-dusk-300">{t('home.pending.results')}.</span>{' '}
          {pending.settleAt && !due ? (
            <span className="num font-semibold text-mist">{t('home.pending.countdown', { time: formatCountdown(ms) })}</span>
          ) : null}
        </p>
      )}

      {pending.predictions.length === 0 ? (
        <p className="mt-3 text-muted">{t('home.pending.empty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {questions.map((q) => {
            const p = pending.predictions.find((x) => x.questionId === q.id);
            return (
              <li key={q.id} className="glass rounded-2xl p-3">
                <p className="text-sm leading-snug text-mist">{q.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                  {p ? (
                    <>
                      <span className="num font-bold text-dawn-300">
                        {t('home.pending.yourGuess', { value: guessText(q, p) })}
                      </span>
                      {p.staked ? (
                        <span className="rounded-full bg-dawn-500 px-2 py-0.5 text-xs font-extrabold text-night-950">
                          {t('result.q.staked')}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted">{t('home.pending.noGuess')}</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
