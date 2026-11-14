import Link from 'next/link';
import { t } from '@/lib/i18n';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <div className="glass flex flex-col gap-4 rounded-2xl p-6">
        <p className="text-lg text-mist">{t('error.notFound')}</p>
        <Link
          href="/"
          className="flex min-h-[44px] items-center self-start rounded-xl bg-white/10 px-4 font-semibold text-mist transition-colors hover:bg-white/15"
        >
          {t('app.back')}
        </Link>
      </div>
    </main>
  );
}
