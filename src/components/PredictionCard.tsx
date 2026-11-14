'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { PredictionDTO, QuestionDTO } from '@/lib/api-types';
import type { SaveState } from '@/lib/client/usePredictions';
import { formatNumber, stepDecimals } from '@/lib/client/format';
import { t } from '@/lib/i18n';

interface Props {
  question: QuestionDTO;
  prediction: PredictionDTO | null;
  status: SaveState | null;
  locked: boolean;
  onValue: (value: number) => void;
  onStake: (on: boolean) => void;
  onRetry: () => void;
}

export default function PredictionCard({ question, prediction, status, locked, onValue, onStake, onRetry }: Props) {
  const titleId = useId();
  const answered = prediction !== null;
  const staked = prediction?.staked ?? false;

  return (
    <article
      aria-labelledby={titleId}
      className={`glass rounded-3xl p-4 transition-colors ${
        staked ? 'border-dawn-500/70 shadow-[0_0_0_1px_rgba(255,138,61,0.5),0_10px_40px_rgba(255,138,61,0.15)]' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`num grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
            answered ? 'bg-dawn-500 text-night-950' : 'bg-white/10 text-muted'
          }`}
        >
          {question.position}
        </span>
        <h3 id={titleId} className="text-lg font-bold leading-snug">{question.text}</h3>
      </div>

      <div className="mt-4">
        {question.kind === 'number' ? (
          <NumberInput
            question={question}
            value={prediction?.value ?? null}
            disabled={locked}
            labelledBy={titleId}
            onCommit={onValue}
          />
        ) : (
          <YesNoInput value={prediction?.value ?? null} disabled={locked} labelledBy={titleId} onPick={onValue} />
        )}
      </div>

      <div className="mt-4 flex min-h-[44px] items-center justify-between gap-3">
        <button
          type="button"
          aria-pressed={staked}
          disabled={locked || !answered}
          onClick={() => onStake(!staked)}
          className={`flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors disabled:opacity-40 ${
            staked
              ? 'border-dawn-500 bg-dawn-500 text-night-950'
              : 'border-white/20 bg-white/5 text-mist hover:bg-white/10'
          }`}
        >
          <span aria-hidden>{staked ? '★' : '☆'}</span>
          <span>{staked ? t('home.stake.on') : t('home.stake.off')}</span>
        </button>

        <div aria-live="polite" className="min-w-0 text-right text-sm">
          {status === 'saving' ? <span className="text-muted">{t('home.saving')}</span> : null}
          {status === 'saved' ? <span className="text-dusk-300">{t('home.saved')}</span> : null}
          {status === 'failed' ? (
            <span className="inline-flex flex-wrap items-center justify-end gap-2 text-danger">
              <span>{t('home.saveFailed')}</span>
              <button
                type="button"
                onClick={onRetry}
                className="min-h-[44px] rounded-full bg-white/10 px-3 font-semibold text-mist"
              >
                {t('error.retry')}
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function YesNoInput({
  value, disabled, labelledBy, onPick,
}: {
  value: number | null;
  disabled: boolean;
  labelledBy: string;
  onPick: (v: number) => void;
}) {
  const opt = (v: number, label: string, on: string) => (
    <button
      type="button"
      aria-pressed={value === v}
      disabled={disabled}
      onClick={() => onPick(v)}
      className={`min-h-[60px] flex-1 rounded-2xl border-2 text-xl font-extrabold transition-all active:scale-[0.97] disabled:opacity-50 ${
        value === v ? on : 'border-white/15 bg-white/5 text-mist hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex gap-3">
      {opt(1, t('home.yes'), 'border-dawn-500 bg-dawn-500 text-night-950 shadow-[0_6px_24px_rgba(255,138,61,0.35)]')}
      {opt(0, t('home.no'), 'border-dusk-400 bg-dusk-400 text-night-950 shadow-[0_6px_24px_rgba(102,188,243,0.3)]')}
    </div>
  );
}

function NumberInput({
  question, value, disabled, labelledBy, onCommit,
}: {
  question: QuestionDTO;
  value: number | null;
  disabled: boolean;
  labelledBy: string;
  onCommit: (v: number) => void;
}) {
  const min = question.min ?? 0;
  const max = question.max ?? 100;
  const step = question.step ?? 1;
  const decimals = stepDecimals(step);
  const unit = question.unit;

  const [draft, setDraft] = useState<number | null>(null);
  const pointerActive = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown = draft ?? value;
  const mid = Number((min + Math.round((max - min) / 2 / step) * step).toFixed(decimals));
  const sliderValue = shown ?? mid;
  const pct = max > min ? ((sliderValue - min) / (max - min)) * 100 : 0;

  function commit(v: number) {
    clearTimeout(timer.current);
    setDraft(null);
    if (value !== null && v === value) return;
    onCommit(v);
  }

  return (
    <div>
      <div className="min-h-[3.75rem] text-center" aria-hidden>
        {shown === null ? (
          <p className="pt-3 text-sm font-medium text-dusk-300">{t('home.slider.hint')}</p>
        ) : (
          <p>
            <span className="num text-5xl font-extrabold leading-none text-dawn-300">{formatNumber(shown, step)}</span>
            {unit ? <span className="ml-2 text-lg font-semibold text-muted">{unit}</span> : null}
          </p>
        )}
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        disabled={disabled}
        data-empty={shown === null}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        aria-labelledby={labelledBy}
        aria-valuetext={
          shown === null
            ? t('home.slider.hint')
            : t('home.slider.value', { value: formatNumber(shown, step), unit: unit ?? '' }).trim()
        }
        onPointerDown={() => {
          pointerActive.current = true;
        }}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDraft(v);
          if (!pointerActive.current) {
            // keyboard / assistive tech: save shortly after the last change
            clearTimeout(timer.current);
            timer.current = setTimeout(() => commit(v), 500);
          }
        }}
        onPointerUp={(e) => {
          pointerActive.current = false;
          commit(Number(e.currentTarget.value));
        }}
        onPointerCancel={(e) => {
          pointerActive.current = false;
          commit(Number(e.currentTarget.value));
        }}
        onBlur={() => {
          if (draft !== null) commit(draft);
        }}
      />
      <div className="num flex justify-between text-sm text-muted" aria-hidden>
        <span>
          {formatNumber(min, step)}
          {unit ? ` ${unit}` : ''}
        </span>
        <span>
          {formatNumber(max, step)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
    </div>
  );
}
