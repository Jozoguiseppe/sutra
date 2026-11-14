import Link from 'next/link';
import { t } from '@/lib/i18n';

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function RulesPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pt-6">
      <header className="rise">
        <h1 className="text-3xl font-extrabold tracking-tight text-mist">{t('rules.title')}</h1>
        <p className="mt-2 text-base text-dawn-400">{t('rules.intro')}</p>
      </header>
      <ol className="flex flex-col gap-3">
        {STEPS.map((n) => (
          <li key={n} className="glass flex gap-4 rounded-2xl p-4">
            <span className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-mist" aria-hidden>
              {n}
            </span>
            <div>
              <h2 className="text-base font-bold text-mist">{t(`rules.${n}.title`)}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t(`rules.${n}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link
        href="/"
        className="mb-4 flex min-h-[52px] items-center justify-center rounded-2xl bg-dawn-400 px-4 text-base font-bold text-night-950"
      >
        {t('rules.back')}
      </Link>
    </main>
  );
}
