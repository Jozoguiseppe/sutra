'use client';

import Link from 'next/link';
import { useNow } from '@/lib/client/hooks';
import { formatCountdown } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import { nextResultsMs } from './dates';

export default function NextResults() {
  const now = useNow(1000);
  const ms = nextResultsMs(now) - now;
  return (
    <section aria-labelledby="next-title" className="rise flex flex-col gap-3" style={{ animationDelay: '280ms' }}>
      <h2 id="next-title" className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{t('result.next.label')}</h2>
      <p className="num -mt-2 text-lg font-semibold text-mist">
        {t('result.next.countdown', { time: formatCountdown(ms) })}
      </p>
      <Link
        href="/"
        className="flex min-h-[56px] items-center justify-center rounded-2xl border-2 border-dawn-500 px-6 text-lg font-extrabold text-dawn-300 transition-transform active:scale-[0.98]"
      >
        {t('result.playAgain')}
      </Link>
    </section>
  );
}
