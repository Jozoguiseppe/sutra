'use client';

import type { RoundResultResponse } from '@/lib/api-types';
import { t } from '@/lib/i18n';

type Me = NonNullable<RoundResultResponse['me']>;

/** "Bolji si od X % igrača" or the missed-round card. */
export default function Standing({ me }: { me: Me }) {
  if (me.missed) {
    return (
      <section className="glass rise rounded-3xl border-danger/40 p-4" style={{ animationDelay: '80ms' }}>
        <h2 className="text-lg font-extrabold text-danger">{t('result.missed.title')}</h2>
        <p className="mt-1 text-sm leading-snug text-muted">{t('result.missed.body')}</p>
      </section>
    );
  }
  if (me.beatPct === null) return null;
  return (
    <section className="rise rounded-3xl bg-gradient-to-br from-dawn-500/25 to-dusk-500/15 p-4 ring-1 ring-dawn-500/40" style={{ animationDelay: '80ms' }}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-dawn-400">{t('result.beat.label')}</p>
      <p className="mt-1 text-xl font-extrabold leading-snug">
        {t('result.beat', { pct: Math.round(me.beatPct) })}
      </p>
    </section>
  );
}
