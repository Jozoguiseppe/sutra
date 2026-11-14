'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';

const icon = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'h-6 w-6',
  viewBox: '0 0 24 24',
};

const ITEMS: { href: string; key: string; icon: ReactNode }[] = [
  {
    href: '/',
    key: 'nav.home',
    icon: (
      <svg {...icon}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v9.5h13V10" />
      </svg>
    ),
  },
  {
    href: '/rezultat',
    key: 'nav.result',
    icon: (
      <svg {...icon}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    href: '/ljestvica',
    key: 'nav.board',
    icon: (
      <svg {...icon}>
        <path d="M4 20V11h5v9M9.5 20V5h5v15M15 20v-7h5v7" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;
  return (
    <nav
      aria-label={t('nav.label')}
      className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-night-950/85 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map((it) => {
          const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                  active ? 'text-dawn-400' : 'text-muted hover:text-mist'
                }`}
              >
                {it.icon}
                <span>{t(it.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
