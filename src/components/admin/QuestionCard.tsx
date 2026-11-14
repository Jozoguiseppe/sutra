'use client';

import type { AdminQuestionsResponse } from '@/lib/api-types';
import { formatNumber } from '@/lib/client/format';
import { t } from '@/lib/i18n';

type AdminQuestion = AdminQuestionsResponse['questions'][number];

const BADGE: Record<string, string> = {
  approved: 'bg-dawn-500/25 text-dawn-300',
  proposed: 'bg-dusk-500/25 text-dusk-300',
  spare: 'bg-white/10 text-muted',
  rejected: 'bg-danger/20 text-danger',
  void: 'bg-white/10 text-muted',
};

export default function QuestionCard({
  q, busy, confirming, onAskReject, onCancel, onReject,
}: {
  q: AdminQuestion;
  busy: boolean;
  confirming: boolean;
  onAskReject: () => void;
  onCancel: () => void;
  onReject: () => void;
}) {
  const badge = q.status === 'proposed' && q.position > 4 ? 'spare' : q.status;
  const canReject = q.status === 'proposed' || q.status === 'approved';
  const hasRange = q.kind === 'number' && q.min !== null && q.max !== null;

  return (
    <li className="glass flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="num rounded-full bg-white/10 px-2.5 py-1 font-bold">{t('admin.position', { n: q.position })}</span>
        <span className={`rounded-full px-2.5 py-1 font-bold uppercase tracking-wider ${BADGE[badge] ?? BADGE.spare}`}>
          {t(`admin.status.${badge}`)}
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-muted">{t(`admin.kind.${q.kind}`)}</span>
      </div>

      <div>
        <p className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{q.text}</p>
        <p className="mt-1 text-sm leading-snug text-muted [overflow-wrap:anywhere]">{q.textEn}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">{t('admin.category')}</dt>
        <dd className="[overflow-wrap:anywhere]">{q.category}</dd>
        <dt className="text-muted">{t('admin.source')}</dt>
        <dd className="[overflow-wrap:anywhere]">{q.sourceKey}</dd>
        {hasRange ? (
          <>
            <dt className="text-muted">↔</dt>
            <dd className="num">
              {t('admin.range', {
                min: formatNumber(q.min as number, q.step),
                max: formatNumber(q.max as number, q.step),
                step: q.step === null ? '–' : formatNumber(q.step, q.step),
              })}
              {q.unit ? ` (${q.unit})` : ''}
            </dd>
          </>
        ) : null}
        {q.scale !== null ? (
          <>
            <dt className="text-muted">σ</dt>
            <dd className="num">{t('admin.scale', { n: formatNumber(q.scale, 0.01) })}</dd>
          </>
        ) : null}
      </dl>

      {confirming ? (
        <div role="alertdialog" aria-label={t('admin.confirm.reject')} className="flex flex-col gap-3 rounded-xl border border-danger/40 p-3">
          <p className="text-danger">{t('admin.confirm.reject')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="min-h-[52px] flex-1 rounded-xl bg-danger px-4 font-extrabold text-night-950 active:scale-[0.98] disabled:opacity-60"
            >
              {t('admin.reject.confirm')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[52px] flex-1 rounded-xl bg-white/10 px-4 font-semibold text-mist hover:bg-white/15"
            >
              {t('app.cancel')}
            </button>
          </div>
        </div>
      ) : canReject ? (
        <button
          type="button"
          disabled={busy}
          onClick={onAskReject}
          className="min-h-[48px] self-end rounded-xl bg-white/10 px-5 font-semibold text-danger transition-colors hover:bg-white/15 disabled:opacity-60"
        >
          {t('admin.reject')}
        </button>
      ) : null}
    </li>
  );
}
