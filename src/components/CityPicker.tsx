'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CitiesResponse } from '@/lib/api-types';
import { api, errorCode, errorKey } from '@/lib/client/api';
import { filterCounties } from '@/lib/client/cities';
import { t } from '@/lib/i18n';
import Notice from './Notice';

export default function CityPicker({
  value, onChange, error, buttonRef,
}: {
  value: { id: number; name: string } | null;
  onChange: (city: { id: number; name: string }) => void;
  error: string | null;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const [counties, setCounties] = useState<CitiesResponse['counties'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    let alive = true;
    api<CitiesResponse>('/api/cities')
      .then((r) => alive && setCounties(r.counties))
      .catch((e: unknown) => alive && setLoadError(errorCode(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => (counties ? filterCounties(counties, query) : []), [counties, query]);

  if (loadError && !counties) {
    return (
      <Notice
        tone="error"
        message={t(errorKey(loadError))}
        actionLabel={t('error.retry')}
        onAction={() => {
          setLoadError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  const panelId = `${uid}-panel`;
  const errId = `${uid}-err`;

  return (
    <div>
      <span id={`${uid}-label`} className="mb-2 block text-sm font-semibold text-muted">
        {t('onboard.city.label')}
      </span>
      <button
        ref={buttonRef}
        type="button"
        aria-labelledby={`${uid}-label ${uid}-value`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-describedby={error ? errId : undefined}
        disabled={!counties}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl border bg-night-800/80 px-4 text-left text-lg transition-colors ${
          error ? 'border-danger' : 'border-white/15 hover:border-dusk-400/60'
        }`}
      >
        <span id={`${uid}-value`} className={value ? 'text-mist' : 'text-muted'}>
          {counties ? (value ? value.name : t('onboard.city.placeholder')) : t('app.loading')}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && counties ? (
        <div id={panelId} className="glass mt-2 overflow-hidden rounded-2xl">
          <label className="block border-b border-white/10 p-2">
            <span className="sr-only">{t('onboard.city.search')}</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('onboard.city.search')}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="min-h-[48px] w-full rounded-xl bg-night-950/70 px-3 text-base text-mist placeholder:text-muted/80"
            />
          </label>
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <p role="status" className="p-4 text-muted">{t('onboard.city.empty')}</p>
            ) : (
              filtered.map((county) => (
                <section key={county.id} aria-label={county.name}>
                  <h3 className="sticky top-0 bg-night-900/95 px-4 py-2 text-xs font-bold uppercase tracking-wider text-dusk-300">
                    {county.name}
                  </h3>
                  <ul>
                    {county.cities.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-pressed={value?.id === c.id}
                          onClick={() => {
                            onChange(c);
                            setOpen(false);
                            setQuery('');
                          }}
                          className={`flex min-h-[44px] w-full items-center px-4 text-left transition-colors hover:bg-white/10 ${
                            value?.id === c.id ? 'font-semibold text-dawn-400' : 'text-mist'
                          }`}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <p id={errId} role="alert" className="mt-2 text-sm text-danger">{error}</p>
      ) : null}
    </div>
  );
}
