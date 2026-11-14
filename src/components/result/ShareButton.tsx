'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoundResultResponse } from '@/lib/api-types';
import { buildShareText, shareGrid } from '@/lib/client/share';
import { t } from '@/lib/i18n';
import { sortedQuestions } from './values';

type Me = NonNullable<RoundResultResponse['me']>;

export default function ShareButton({ me, questions }: { me: Me; questions: RoundResultResponse['questions'] }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shareQs = sortedQuestions(questions).map((q) => ({ void: q.void, points: q.my?.points ?? null }));

  function flash(s: 'copied' | 'failed') {
    setStatus(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2500);
  }

  async function onShare() {
    const text = buildShareText({
      year: me.displayAfter.year,
      delta: me.delta,
      questions: shareQs,
      url: window.location.origin,
    });
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('share.title'), text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        // otherwise fall back to the clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      flash('copied');
    } catch {
      flash('failed');
    }
  }

  return (
    <section aria-labelledby="share-title" className="rise" style={{ animationDelay: '240ms' }}>
      <h2 id="share-title" className="sr-only">{t('share.title')}</h2>
      <div className="glass rounded-3xl p-4 text-center">
        <p aria-hidden className="text-3xl tracking-[0.3em]">{shareGrid(shareQs)}</p>
        <button
          type="button"
          onClick={() => void onShare()}
          className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-dawn-500 to-dawn-400 px-6 text-lg font-extrabold text-night-950 shadow-[0_8px_30px_rgba(255,138,61,0.35)] transition-transform active:scale-[0.98]"
        >
          {t('share.button')}
        </button>
        <p role="status" aria-live="polite" className={`mt-2 min-h-[1.25rem] text-sm font-semibold ${status === 'failed' ? 'text-danger' : 'text-dusk-300'}`}>
          {status === 'copied' ? t('share.copied') : status === 'failed' ? t('share.failed') : ''}
        </p>
      </div>
    </section>
  );
}
