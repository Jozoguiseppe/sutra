'use client';

import type { CityBoardResponse } from '@/lib/api-types';
import { errorKey } from '@/lib/client/api';
import { formatNumber, formatQuantity, formatYear } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import Notice from '@/components/Notice';
import { useApiData } from './useApiData';

export default function CitiesTab({ myCityId }: { myCityId: number | null }) {
  const { data, error, reload } = useApiData<CityBoardResponse>('/api/leaderboard/cities');

  if (!data) {
    return error ? (
      <Notice tone="error" message={t(errorKey(error))} actionLabel={t('error.retry')} onAction={() => void reload()} />
    ) : (
      <p role="status" className="text-muted">{t('app.loading')}</p>
    );
  }
  if (data.cities.length === 0) return <Notice message={t('board.empty.cities')} />;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {data.cities.map((c, i) => {
          const mine = c.cityId === myCityId;
          return (
            <li
              key={c.cityId}
              aria-current={mine ? 'true' : undefined}
              className={`glass flex items-start gap-3 rounded-2xl p-4 ${mine ? 'border-dawn-400/70 shadow-[0_0_0_1px_rgba(255,162,77,0.5)]' : ''}`}
            >
              <span className="num w-8 shrink-0 pt-1 text-center text-lg font-extrabold text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p
                  className="num font-extrabold leading-tight text-mist [overflow-wrap:anywhere] [text-wrap:balance]"
                  style={{ fontSize: 'clamp(1.35rem, 6.5vw, 1.75rem)' }}
                >
                  {t('board.city.sentence', { city: c.cityName, year: formatYear(c.displayYear) })}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {t('board.city.stats', {
                    county: c.countyName,
                    n: formatNumber(c.players),
                    avg: formatQuantity(c.avgOffset, 0.1, t('unit.points')),
                  })}
                </p>
                {mine ? (
                  <p className="mt-2 inline-block rounded-full bg-dawn-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-dawn-300">
                    {t('board.yourCity')}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-sm text-muted">{t('board.note')}</p>
    </div>
  );
}
