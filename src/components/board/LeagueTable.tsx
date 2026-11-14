'use client';

import type { LeagueTableResponse } from '@/lib/api-types';
import { errorKey } from '@/lib/client/api';
import { formatQuantity, formatYear } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import Notice from '@/components/Notice';
import CopyButton from './CopyButton';
import { useApiData } from './useApiData';

export default function LeagueTable({ code, onBack }: { code: string; onBack: () => void }) {
  const { data, error, reload } = useApiData<LeagueTableResponse>(`/api/leagues/${encodeURIComponent(code)}`);

  return (
    <section className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] self-start rounded-xl bg-white/10 px-4 font-semibold text-mist transition-colors hover:bg-white/15"
      >
        ← {t('app.back')}
      </button>

      {!data ? (
        error ? (
          <Notice
            tone="error"
            message={t(error === 'league_not_found' ? 'league.error.notFound' : errorKey(error))}
            actionLabel={t('error.retry')}
            onAction={() => void reload()}
          />
        ) : (
          <p role="status" className="text-muted">{t('app.loading')}</p>
        )
      ) : (
        <>
          <header className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold [overflow-wrap:anywhere]">{data.name}</h2>
              <p className="num text-sm text-muted">{t('league.code.label')}: {data.code}</p>
            </div>
            <CopyButton text={data.code} label={t('league.code.copy')} copiedLabel={t('league.code.copied')} />
          </header>

          {data.table.length === 0 ? (
            <Notice message={t('league.table.empty')} />
          ) : (
            <ol className="flex flex-col gap-2">
              {data.table.map((row, i) => (
                <li
                  key={`${row.nickname}-${i}`}
                  aria-current={row.isMe ? 'true' : undefined}
                  className={`glass flex items-center gap-3 rounded-2xl p-3 ${row.isMe ? 'border-dawn-400/70 shadow-[0_0_0_1px_rgba(255,162,77,0.5)]' : ''}`}
                >
                  <span className="num w-7 shrink-0 text-center text-lg font-extrabold text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {row.nickname}
                      {row.isMe ? <span className="ml-2 text-xs font-bold uppercase text-dawn-300">{t('board.you')}</span> : null}
                    </p>
                    <p className="truncate text-sm text-muted">{row.cityName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-xl font-extrabold">{formatYear(row.displayYear)}</p>
                    <p className="text-xs text-muted">{formatQuantity(row.offsetPoints, null, t('unit.points'))}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
