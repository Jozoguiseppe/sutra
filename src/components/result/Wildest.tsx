'use client';

import type { ResultQuestion } from '@/lib/api-types';
import { t } from '@/lib/i18n';
import { fmtQuantity, sortedQuestions } from './values';

export default function Wildest({ questions }: { questions: ResultQuestion[] }) {
  const items = sortedQuestions(questions).filter((q) => !q.void && q.actual !== null && q.wildest !== null);
  return (
    <section aria-labelledby="wildest-title" className="rise" style={{ animationDelay: '200ms' }}>
      <h2 id="wildest-title" className="text-xl font-extrabold tracking-tight">
        <span aria-hidden>🎪 </span>
        {t('wildest.title')}
      </h2>
      {items.length === 0 ? (
        <p className="glass mt-3 rounded-2xl p-4 text-muted">{t('wildest.none')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((q) => (
            <li key={q.id} className="glass rounded-3xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">{t('wildest.question', { text: q.text })}</p>
              <p className="num mt-2 text-base font-semibold leading-snug">
                {t('wildest.line', {
                  nick: q.wildest!.nickname,
                  value: fmtQuantity(q.wildest!.value, q.unit, 2),
                  actual: fmtQuantity(q.actual!, q.unit, 2),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
