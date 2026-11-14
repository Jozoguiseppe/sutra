'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import type { MeResponse } from '@/lib/api-types';
import { apiSend, errorCode, errorKey } from '@/lib/client/api';
import { nicknameProblem, type NicknameProblem } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import CityPicker from './CityPicker';

const PROBLEM_KEY: Record<Exclude<NicknameProblem, null>, string> = {
  short: 'onboard.nickname.error.tooShort',
  long: 'onboard.nickname.error.tooLong',
  invalid: 'onboard.nickname.error.invalid',
};

export default function Onboarding({ onDone }: { onDone: (me: MeResponse) => void }) {
  const [nickname, setNickname] = useState('');
  const [touched, setTouched] = useState(false);
  const [city, setCity] = useState<{ id: number; name: string } | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [serverNickError, setServerNickError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nickRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLButtonElement>(null);
  const uid = useId();

  const problem = nicknameProblem(nickname);
  const liveError =
    serverNickError ?? (touched && problem ? t(PROBLEM_KEY[problem]) : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setTouched(true);
    setFormError(null);
    if (problem) {
      nickRef.current?.focus();
      return;
    }
    if (!city) {
      setCityError(t('onboard.city.error.required'));
      cityRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const me = await apiSend<MeResponse>('/api/player', 'POST', { nickname: nickname.trim(), cityId: city.id });
      onDone(me);
    } catch (err) {
      const code = errorCode(err);
      if (code.startsWith('nickname_')) {
        setServerNickError(t(errorKey(code)));
        nickRef.current?.focus();
      } else if (code === 'city_invalid') {
        setCityError(t(errorKey(code)));
      } else {
        setFormError(code === 'network' ? t('error.network') : t('onboard.error'));
      }
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <header className="rise mb-8 text-center">
        <h1 className="num bg-gradient-to-r from-dusk-300 via-mist to-dawn-400 bg-clip-text text-7xl font-extrabold tracking-tight text-transparent">
          {t('app.name')}
        </h1>
        <p className="mt-2 text-lg font-medium text-dawn-300">{t('app.tagline')}</p>
      </header>

      <section className="rise glass rounded-3xl p-5" style={{ animationDelay: '80ms' }}>
        <h2 className="text-xl font-bold">{t('onboard.title')}</h2>
        <p className="mt-1 text-muted">{t('onboard.subtitle')}</p>

        <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-5">
          <div>
            <label htmlFor={`${uid}-nick`} className="mb-2 block text-sm font-semibold text-muted">
              {t('onboard.nickname.label')}
            </label>
            <input
              ref={nickRef}
              id={`${uid}-nick`}
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setServerNickError(null);
              }}
              onBlur={() => nickname && setTouched(true)}
              placeholder={t('onboard.nickname.placeholder')}
              autoComplete="nickname"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={liveError ? true : undefined}
              aria-describedby={`${uid}-hint${liveError ? ` ${uid}-nick-err` : ''}`}
              className={`min-h-[52px] w-full rounded-2xl border bg-night-800/80 px-4 text-lg text-mist placeholder:text-muted/70 ${
                liveError ? 'border-danger' : 'border-white/15'
              }`}
            />
            <p id={`${uid}-hint`} className="mt-2 text-sm text-muted">{t('onboard.nickname.hint')}</p>
            {liveError ? (
              <p id={`${uid}-nick-err`} role="alert" className="mt-1 text-sm text-danger">{liveError}</p>
            ) : null}
          </div>

          <CityPicker
            value={city}
            buttonRef={cityRef}
            error={cityError}
            onChange={(c) => {
              setCity(c);
              setCityError(null);
            }}
          />

          {formError ? (
            <p role="alert" className="text-sm text-danger">{formError}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="min-h-[56px] rounded-2xl bg-gradient-to-r from-dawn-500 to-dawn-400 px-6 text-lg font-extrabold text-night-950 shadow-[0_8px_30px_rgba(255,138,61,0.35)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? t('onboard.starting') : t('onboard.start')}
          </button>
        </form>
      </section>

      <p className="mt-5 text-center text-sm text-muted">{t('onboard.note')}</p>
      <p className="mt-3 text-center">
        <Link href="/pravila" className="inline-flex min-h-[44px] items-center px-3 text-sm font-semibold text-dawn-400 underline underline-offset-4">
          {t('rules.link')}
        </Link>
      </p>
    </main>
  );
}
