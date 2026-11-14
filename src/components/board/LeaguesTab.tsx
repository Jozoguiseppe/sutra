'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import type { LeagueRef, MyLeaguesResponse } from '@/lib/api-types';
import { apiSend, errorCode, errorKey } from '@/lib/client/api';
import { t } from '@/lib/i18n';
import Notice from '@/components/Notice';
import CopyButton, { copyText } from './CopyButton';
import LeagueTable from './LeagueTable';
import { useApiData } from './useApiData';

const CODE_LEN = 6;
const inputClass = 'min-h-[52px] w-full rounded-2xl border border-white/15 bg-night-800/80 px-4 text-lg text-mist placeholder:text-muted/70';
const primaryClass =
  'min-h-[52px] rounded-2xl bg-gradient-to-r from-dawn-500 to-dawn-400 px-6 text-lg font-extrabold text-night-950 shadow-[0_8px_30px_rgba(255,138,61,0.35)] transition-transform active:scale-[0.98] disabled:opacity-60';

function joinErrorMessage(code: string): string {
  if (code === 'league_not_found') return t('league.error.notFound');
  if (code === 'already_member') return t('league.error.alreadyMember');
  if (code === 'network') return t('error.network');
  if (code === 'no_player') return t('error.unauthorized');
  return t('league.error.generic');
}

function createErrorMessage(code: string): string {
  if (code === 'network') return t('error.network');
  if (code === 'no_player') return t('error.unauthorized');
  return t('league.error.generic');
}

export default function LeaguesTab({ inviteCode, onInviteHandled }: { inviteCode: string | null; onInviteHandled: () => void }) {
  const { data, error, status, reload } = useApiData<MyLeaguesResponse>('/api/leagues');
  const [selected, setSelected] = useState<string | null>(null);
  const [created, setCreated] = useState<LeagueRef | null>(null);

  const [name, setName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinedNotice, setJoinedNotice] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const uid = useId();

  useEffect(() => {
    if (inviteCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill the join form from the deep link
      setCode(inviteCode);
    }
  }, [inviteCode]);

  if (status === 401) {
    return (
      <div className="glass flex flex-col gap-3 rounded-2xl p-4">
        <p role="alert" className="text-mist">{t('error.unauthorized')}</p>
        <Link
          href="/"
          className="flex min-h-[44px] items-center self-start rounded-xl bg-white/10 px-4 font-semibold text-mist transition-colors hover:bg-white/15"
        >
          {t('nav.home')}
        </Link>
      </div>
    );
  }

  if (selected) return <LeagueTable code={selected} onBack={() => setSelected(null)} />;

  async function join(rawCode: string) {
    if (joining) return;
    const c = rawCode.trim().toUpperCase();
    setJoinError(null);
    setJoinedNotice(false);
    if (c.length !== CODE_LEN) {
      setJoinError(t('league.error.codeInvalid'));
      return;
    }
    setJoining(true);
    try {
      const league = await apiSend<LeagueRef>('/api/leagues/join', 'POST', { code: c });
      setCode('');
      setJoinedNotice(true);
      onInviteHandled();
      void reload();
      setSelected(league.code);
    } catch (e) {
      setJoinError(joinErrorMessage(errorCode(e)));
    } finally {
      setJoining(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    const n = name.trim();
    setCreateError(null);
    if (n.length < 3) return setCreateError(t('league.error.nameTooShort'));
    if (n.length > 30) return setCreateError(t('league.error.nameTooLong'));
    setCreating(true);
    try {
      const league = await apiSend<LeagueRef>('/api/leagues', 'POST', { name: n });
      setCreated(league);
      setName('');
      void reload();
    } catch (err) {
      setCreateError(createErrorMessage(errorCode(err)));
    } finally {
      setCreating(false);
    }
  }

  async function share(league: LeagueRef) {
    const text = t('league.share.text', { name: league.name, code: league.code });
    setShareNote(null);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, url: `${window.location.origin}/ljestvica?liga=${league.code}` });
      } catch {
        /* dismissed by the user */
      }
    } else if (await copyText(`${text} ${window.location.origin}/ljestvica?liga=${league.code}`)) {
      setShareNote(t('league.code.copied'));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {inviteCode ? (
        <section className="glass flex flex-col gap-3 rounded-2xl border-dawn-400/50 p-4">
          <p className="text-mist">{t('league.invite.prompt', { code: inviteCode })}</p>
          <div className="flex gap-2">
            <button type="button" disabled={joining} onClick={() => void join(inviteCode)} className={`${primaryClass} flex-1`}>
              {t('league.join.button')}
            </button>
            <button
              type="button"
              onClick={onInviteHandled}
              className="min-h-[52px] rounded-2xl bg-white/10 px-4 font-semibold text-mist hover:bg-white/15"
            >
              {t('league.invite.dismiss')}
            </button>
          </div>
        </section>
      ) : null}

      {joinedNotice ? <Notice message={t('league.join.success')} /> : null}

      <section aria-labelledby={`${uid}-mine`} className="flex flex-col gap-3">
        <h2 id={`${uid}-mine`} className="text-xl font-bold">{t('league.title')}</h2>
        {!data ? (
          error ? (
            <Notice tone="error" message={t(errorKey(error))} actionLabel={t('error.retry')} onAction={() => void reload()} />
          ) : (
            <p role="status" className="text-muted">{t('app.loading')}</p>
          )
        ) : data.leagues.length === 0 ? (
          <Notice message={t('league.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.leagues.map((l) => (
              <li key={l.code} className="glass flex items-center gap-2 rounded-2xl p-2 pl-4">
                <button type="button" onClick={() => setSelected(l.code)} className="min-h-[56px] min-w-0 flex-1 text-left">
                  <span className="block truncate text-lg font-bold">{l.name}</span>
                  <span className="num block text-sm text-muted">
                    {l.code} · {t('league.members', { n: l.members })}
                  </span>
                </button>
                <CopyButton text={l.code} label={t('league.code.copy')} copiedLabel={t('league.code.copied')} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${uid}-create`} className="glass rounded-3xl p-5">
        <h2 id={`${uid}-create`} className="text-xl font-bold">{t('league.create.title')}</h2>
        {created ? (
          <div className="mt-4 flex flex-col gap-3" role="status">
            <p className="text-mist">{t('league.create.success')}</p>
            <p className="text-sm text-muted">{t('league.code.label')}</p>
            <p className="num text-center text-5xl font-extrabold tracking-[0.2em] text-dawn-400">{created.code}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton
                className="flex-1"
                text={created.code}
                label={t('league.code.copy')}
                copiedLabel={t('league.code.copied')}
              />
              <button
                type="button"
                onClick={() => void share(created)}
                className="min-h-[44px] flex-1 rounded-xl bg-dawn-500 px-4 text-sm font-bold text-night-950 active:scale-[0.98]"
              >
                {t('league.share.button')}
              </button>
            </div>
            {shareNote ? <p role="status" className="text-sm text-muted">{shareNote}</p> : null}
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setShareNote(null);
              }}
              className="min-h-[44px] self-start rounded-xl px-2 text-sm font-semibold text-muted underline"
            >
              {t('league.create.button')}
            </button>
          </div>
        ) : (
          <form onSubmit={create} noValidate className="mt-4 flex flex-col gap-4">
            <div>
              <label htmlFor={`${uid}-name`} className="mb-2 block text-sm font-semibold text-muted">
                {t('league.create.name.label')}
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                value={name}
                maxLength={30}
                onChange={(e) => {
                  setName(e.target.value);
                  setCreateError(null);
                }}
                placeholder={t('league.create.name.placeholder')}
                aria-invalid={createError ? true : undefined}
                className={inputClass}
              />
              {createError ? <p role="alert" className="mt-2 text-sm text-danger">{createError}</p> : null}
            </div>
            <button type="submit" disabled={creating} className={primaryClass}>
              {t('league.create.button')}
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby={`${uid}-join`} className="glass rounded-3xl p-5">
        <h2 id={`${uid}-join`} className="text-xl font-bold">{t('league.join.title')}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void join(code);
          }}
          noValidate
          className="mt-4 flex flex-col gap-4"
        >
          <div>
            <label htmlFor={`${uid}-code`} className="mb-2 block text-sm font-semibold text-muted">
              {t('league.join.code.label')}
            </label>
            <input
              id={`${uid}-code`}
              type="text"
              value={code}
              maxLength={CODE_LEN}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setJoinError(null);
              }}
              placeholder={t('league.join.code.placeholder')}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={joinError ? true : undefined}
              className={`${inputClass} num tracking-[0.2em]`}
            />
            {joinError ? <p role="alert" className="mt-2 text-sm text-danger">{joinError}</p> : null}
          </div>
          <button type="submit" disabled={joining} className={primaryClass}>
            {t('league.join.button')}
          </button>
        </form>
      </section>
    </div>
  );
}
