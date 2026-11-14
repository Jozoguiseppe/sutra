'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminQuestionsResponse } from '@/lib/api-types';
import { api, errorCode, errorKey } from '@/lib/client/api';
import { formatDate } from '@/lib/client/format';
import { t } from '@/lib/i18n';
import Notice from '@/components/Notice';
import QuestionCard from './QuestionCard';

const TOKEN_KEY = 'sutra_admin_token';
const PATH = '/api/admin/questions';

type Slot = { key: string; data: AdminQuestionsResponse | null; error: string | null };

function shiftDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function formatIso(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return formatDate({ year, month, day });
}

export default function AdminApp() {
  const [token, setToken] = useState<string | null>(null); // null = not read yet
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stored = '';
    try {
      stored = window.localStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable on the client
    setToken(stored);
  }, []);

  const key = `${token}|${date ?? ''}|${attempt}`;

  const forgetToken = useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken('');
    setSlot(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const url = date ? `${PATH}?date=${date}` : PATH;
    api<AdminQuestionsResponse>(url, { headers: { 'x-admin-token': token } })
      .then((data) => alive && setSlot({ key, data, error: null }))
      .catch((e: unknown) => {
        if (!alive) return;
        const code = errorCode(e);
        if (code === 'bad_token') {
          forgetToken();
          setInvalid(true);
        } else {
          setSlot({ key, data: null, error: code });
        }
      });
    return () => {
      alive = false;
    };
  }, [token, date, key, forgetToken]);

  function saveToken(e: React.FormEvent) {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    try {
      window.localStorage.setItem(TOKEN_KEY, v);
    } catch {
      /* keep in memory only */
    }
    setInvalid(false);
    setDraft('');
    setToken(v);
  }

  async function act(body: Record<string, unknown>) {
    if (!token || busy) return;
    setBusy(true);
    setActionError(null);
    setConfirmId(null);
    try {
      const data = await api<AdminQuestionsResponse>(PATH, {
        method: 'POST',
        headers: { 'x-admin-token': token },
        body: JSON.stringify(body),
      });
      setSlot({ key, data, error: null });
    } catch (e) {
      const code = errorCode(e);
      if (code === 'bad_token') {
        forgetToken();
        setInvalid(true);
      } else {
        setActionError(code === 'round_open' ? t('admin.error.roundOpen') : t(errorKey(code)));
      }
    } finally {
      setBusy(false);
    }
  }

  if (token === null) {
    return (
      <main className="grid min-h-[70dvh] place-items-center">
        <p role="status" className="text-muted">{t('app.loading')}</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-10">
        <h1 className="text-2xl font-extrabold">{t('admin.title')}</h1>
        <form onSubmit={saveToken} className="glass flex flex-col gap-4 rounded-3xl p-5">
          <p className="text-muted">{t('admin.token.prompt')}</p>
          <label htmlFor="admin-token" className="text-sm font-semibold text-muted">{t('admin.token.label')}</label>
          <input
            id="admin-token"
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('admin.token.placeholder')}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={invalid ? true : undefined}
            className="min-h-[52px] w-full rounded-2xl border border-white/15 bg-night-800/80 px-4 text-lg text-mist placeholder:text-muted/70"
          />
          {invalid ? <p role="alert" className="text-sm text-danger">{t('admin.token.invalid')}</p> : null}
          <button
            type="submit"
            className="min-h-[56px] rounded-2xl bg-gradient-to-r from-dawn-500 to-dawn-400 px-6 text-lg font-extrabold text-night-950 active:scale-[0.98]"
          >
            {t('admin.token.save')}
          </button>
        </form>
      </main>
    );
  }

  const current = slot && slot.key === key ? slot : null;
  const shownDate = date ?? current?.data?.targetDate ?? null;
  const questions = current?.data?.questions ?? [];
  const set = questions.filter((q) => q.position <= 4);
  const spare = questions.filter((q) => q.position > 4);
  const toApprove = set.filter((q) => q.status === 'proposed').length;

  const navBtn =
    'grid min-h-[52px] min-w-[52px] place-items-center rounded-2xl bg-white/10 text-2xl font-bold text-mist transition-colors hover:bg-white/15 active:scale-[0.96] disabled:opacity-40';

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-32 pt-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">{t('admin.title')}</h1>
        <button
          type="button"
          onClick={forgetToken}
          className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-muted underline"
        >
          {t('admin.token.forget')}
        </button>
      </header>

      <div className="glass flex items-center gap-2 rounded-3xl p-2" role="group" aria-label={t('admin.date.label')}>
        <button
          type="button"
          className={navBtn}
          disabled={!shownDate}
          aria-label={t('admin.date.prev')}
          onClick={() => shownDate && setDate(shiftDate(shownDate, -1))}
        >
          ‹
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-dawn-400">{t('admin.date.label')}</p>
          <p className="num text-lg font-extrabold leading-tight">{shownDate ? formatIso(shownDate) : '…'}</p>
        </div>
        <button
          type="button"
          className={navBtn}
          disabled={!shownDate}
          aria-label={t('admin.date.next')}
          onClick={() => shownDate && setDate(shiftDate(shownDate, 1))}
        >
          ›
        </button>
      </div>

      {actionError ? <Notice tone="error" message={actionError} /> : null}

      {!current ? (
        <p role="status" className="text-muted">{t('app.loading')}</p>
      ) : current.error ? (
        <Notice
          tone="error"
          message={t(errorKey(current.error))}
          actionLabel={t('error.retry')}
          onAction={() => setAttempt((n) => n + 1)}
        />
      ) : questions.length === 0 ? (
        <div className="flex flex-col gap-4">
          <Notice message={t('admin.empty')} />
          <button
            type="button"
            disabled={busy || !shownDate}
            onClick={() => shownDate && void act({ action: 'generate', date: shownDate })}
            className="min-h-[56px] rounded-2xl bg-gradient-to-r from-dawn-500 to-dawn-400 px-6 text-lg font-extrabold text-night-950 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? t('app.loading') : t('admin.generate')}
          </button>
        </div>
      ) : (
        <>
          {[
            { id: 'set', title: t('admin.group.set'), items: set },
            { id: 'spare', title: t('admin.group.spare'), items: spare },
          ].map((g) =>
            g.items.length === 0 ? null : (
              <section key={g.id} aria-label={g.title} className="flex flex-col gap-3">
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-dawn-400">{g.title}</h2>
                <ul className="flex flex-col gap-3">
                  {g.items.map((q) => (
                    <QuestionCard
                      key={q.id}
                      q={q}
                      busy={busy}
                      confirming={confirmId === q.id}
                      onAskReject={() => setConfirmId(q.id)}
                      onCancel={() => setConfirmId(null)}
                      onReject={() => void act({ action: 'reject', questionId: q.id })}
                    />
                  ))}
                </ul>
              </section>
            ),
          )}

          <div
            className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-night-950/90 px-4 pt-3 backdrop-blur-md"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto max-w-md">
              {toApprove > 0 && shownDate ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act({ action: 'approveAll', date: shownDate })}
                  className="min-h-[60px] w-full rounded-2xl bg-gradient-to-r from-dawn-500 to-dawn-400 px-6 text-xl font-extrabold text-night-950 shadow-[0_8px_30px_rgba(255,138,61,0.35)] active:scale-[0.98] disabled:opacity-60"
                >
                  {t('admin.approveAll')}
                </button>
              ) : (
                <p className="grid min-h-[60px] place-items-center text-lg font-bold text-dusk-300">{t('admin.done')}</p>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
