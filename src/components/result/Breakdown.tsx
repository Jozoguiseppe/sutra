'use client';

import type { ResultQuestion } from '@/lib/api-types';
import { formatDays } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import { sortedQuestions, valueText } from './values';

function Points({ points }: { points: number }) {
  const icon = points > 0 ? '⏩' : points < 0 ? '⏪' : '⏸';
  const sign = points > 0 ? '+' : points < 0 ? '−' : '';
  const tone = points > 0 ? 'text-dawn-300' : points < 0 ? 'text-dusk-300' : 'text-muted';
  return (
    <span className={`num inline-flex items-center gap-1.5 text-lg font-extrabold ${tone}`}>
      <span aria-hidden>{icon}</span>
      {sign}
      {formatDays(Math.abs(points))}
    </span>
  );
}

export default function Breakdown({ questions }: { questions: ResultQuestion[] }) {
  return (
    <section aria-labelledby="breakdown-title" className="rise" style={{ animationDelay: '120ms' }}>
      <h2 id="breakdown-title" className="text-xl font-extrabold tracking-tight">{t('result.questions.title')}</h2>
      <ol className="mt-3 flex flex-col gap-3">
        {sortedQuestions(questions).map((q) => (
          <li
            key={q.id}
            className={`glass rounded-3xl p-4 ${q.my?.staked && !q.void ? 'border-dawn-500/70' : ''} ${q.void ? 'opacity-75' : ''}`}
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-extrabold text-muted">
                {q.position}
              </span>
              <h3 className="text-base font-bold leading-snug">{q.text}</h3>
            </div>

            {q.void || q.actual === null ? (
              <p className="mt-3 rounded-xl border border-dashed border-white/20 px-3 py-2 text-sm text-muted">
                {t('result.q.void')}
              </p>
            ) : (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-muted">{t('result.q.yourGuess')}</dt>
                    <dd className="num mt-0.5 text-lg font-extrabold">
                      {q.my ? valueText(q, q.my.value) : <span className="text-sm font-medium text-muted">{t('result.q.unanswered')}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-muted">{t('result.q.actual')}</dt>
                    <dd className="num mt-0.5 text-lg font-extrabold text-dusk-300">{valueText(q, q.actual)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Points points={q.my?.points ?? 0} />
                  {q.my?.staked ? (
                    <span className="rounded-full bg-dawn-500 px-2.5 py-0.5 text-xs font-extrabold text-night-950">
                      {t('result.q.staked')}
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
