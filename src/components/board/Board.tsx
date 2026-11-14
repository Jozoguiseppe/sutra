'use client';

import { useEffect, useState } from 'react';
import type { MeResponse } from '@/lib/api-types';
import { api } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import CitiesTab from './CitiesTab';
import LeaguesTab from './LeaguesTab';

type Tab = 'cities' | 'leagues';

export default function Board() {
  const [tab, setTab] = useState<Tab>('cities');
  const [myCityId, setMyCityId] = useState<number | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<MeResponse>('/api/me')
      .then((me) => alive && setMyCityId(me.player.cityId))
      .catch(() => {
        /* not onboarded: no highlight */
      });
    const liga = new URLSearchParams(window.location.search).get('liga')?.trim().toUpperCase();
    if (liga) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep link is only readable on the client
      setInvite(liga.slice(0, 6));
      setTab('leagues');
    }
    return () => {
      alive = false;
    };
  }, []);

  function dismissInvite() {
    setInvite(null);
    window.history.replaceState(null, '', window.location.pathname);
  }

  const tabs: { id: Tab; key: string }[] = [
    { id: 'cities', key: 'board.tab.cities' },
    { id: 'leagues', key: 'board.tab.leagues' },
  ];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <h1 className="rise text-3xl font-extrabold tracking-tight">{t('board.title')}</h1>

      <div role="tablist" aria-label={t('board.title')} className="glass flex gap-1 rounded-2xl p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`board-tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls="board-panel"
            onClick={() => setTab(x.id)}
            className={`min-h-[48px] flex-1 rounded-xl font-bold transition-colors ${
              tab === x.id ? 'bg-dawn-500 text-night-950' : 'text-muted hover:text-mist'
            }`}
          >
            {t(x.key)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="board-panel" aria-labelledby={`board-tab-${tab}`} className="rise">
        {tab === 'cities' ? (
          <CitiesTab myCityId={myCityId} />
        ) : (
          <LeaguesTab inviteCode={invite} onInviteHandled={dismissInvite} />
        )}
      </div>
    </main>
  );
}
