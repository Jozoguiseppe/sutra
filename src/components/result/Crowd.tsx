'use client';

import type { ResultQuestion } from '@/lib/api-types';
import { t } from '@/lib/i18n';
import { fmtQuantity, sortedQuestions, yesNo } from './values';

/** Did my guess land closer to the truth than the crowd average? null when it can't be said. */
function closerThanCrowd(q: ResultQuestion): boolean | null {
  if (q.kind !== 'number' || !q.my || q.actual === null || q.crowd.avg === null) return null;
  const mine = Math.abs(q.my.value - q.actual);
  const crowd = Math.abs(q.crowd.avg - q.actual);
  return mine === crowd ? null : mine < crowd;
}

export default function Crowd({ questions, players, hasMe }: { questions: ResultQuestion[]; players: number; hasMe: boolean }) {
  const list = sortedQuestions(questions);
  const any = list.some((q) => !q.void && q.crowd.count > 0);
  return (
    <section aria-labelledby="crowd-title" className="rise" style={{ animationDelay: '160ms' }}>
      <h2 id="crowd-title" className="text-xl font-extrabold tracking-tight">{t('crowd.title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('crowd.subtitle')}</p>
      <p className="num mt-1 text-xs font-bold uppercase tracking-wider text-dusk-300">{t('crowd.players', { n: players })}</p>

      {!any ? (
        <p className="glass mt-3 rounded-2xl p-4 text-muted">{t('crowd.empty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {list.map((q) => {
            if (q.void || q.actual === null || q.crowd.count === 0) return null;
            const closer = hasMe ? closerThanCrowd(q) : null;
            return (
              <li key={q.id} className="glass rounded-3xl p-4">
                <h3 className="text-base font-bold leading-snug">{q.text}</h3>
                {q.kind === 'yesno' && q.crowd.yesPct !== null ? (
                  <>
                    <p className="num mt-2 font-semibold text-mist">
                      {t('crowd.line.yesno', { pct: Math.round(q.crowd.yesPct), actual: yesNo(q.actual) })}
                    </p>
                    <div aria-hidden className="mt-2 h-2 overflow-hidden rounded-full bg-dusk-400/40">
                      <div className="h-full bg-dawn-500" style={{ width: `${Math.min(100, Math.max(0, q.crowd.yesPct))}%` }} />
                    </div>
                  </>
                ) : q.crowd.avg !== null ? (
                  <p className="num mt-2 font-semibold text-mist">
                    {t('crowd.line.number', {
                      avg: fmtQuantity(q.crowd.avg, q.unit, 1),
                      actual: fmtQuantity(q.actual, q.unit, 2),
                    })}
                  </p>
                ) : null}
                {q.crowdBeatPct !== null ? (
                  <p className="mt-1 text-sm font-semibold text-dawn-300">
                    {t('crowd.closer', { pct: Math.round(q.crowdBeatPct) })}
                  </p>
                ) : null}
                {closer !== null ? (
                  <p className={`mt-1 text-sm font-semibold ${closer ? 'text-dusk-300' : 'text-muted'}`}>
                    {t(closer ? 'crowd.you.closer' : 'crowd.you.farther')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
