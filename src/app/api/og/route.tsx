import { ImageResponse } from 'next/og';
import { MAX_YEAR, MIN_YEAR } from '@/data/stations';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Integer within [lo, hi], or `fallback` when missing/invalid. */
function clampInt(raw: string | null, lo: number, hi: number, fallback: number): number {
  if (raw === null || !/^-?\d{1,12}$/.test(raw)) return fallback;
  return Math.min(hi, Math.max(lo, Number(raw)));
}

/** ASCII-only nickname (the built-in font has no diacritics), max 20 chars. */
function cleanNickname(raw: string | null): string {
  return (raw ?? '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
    .trim();
}

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const year = clampInt(sp.get('y'), MIN_YEAR, MAX_YEAR, new Date().getFullYear());
  const delta = clampInt(sp.get('d'), -1_000_000, 1_000_000, 0);
  const nick = cleanNickname(sp.get('n'));
  const hasDelta = sp.get('d') !== null && /^-?\d{1,12}$/.test(sp.get('d') ?? '');

  const yearText =
    year <= 0
      ? t('year.format.bc', { year: group(1 - year), era: t('era.bc') })
      : t('year.format', { year: group(year) });
  const big = t('home.position', { year: yearText.replace(/\.$/, '') });
  const deltaText = `${delta > 0 ? '+' : delta < 0 ? '-' : ''}${t('unit.days.other', { n: group(Math.abs(delta)) })}`;
  const bigSize = big.length > 22 ? 84 : big.length > 16 ? 108 : 140;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          color: '#e9edff',
          backgroundColor: '#0b1024',
          backgroundImage:
            'radial-gradient(ellipse 120% 60% at 50% 120%, rgba(255,138,61,0.55), rgba(255,138,61,0) 65%), radial-gradient(ellipse 70% 50% at 10% -10%, rgba(102,188,243,0.28), rgba(102,188,243,0) 60%), linear-gradient(180deg, #080c1f 0%, #0b1024 55%, #1a1230 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 40, fontWeight: 800, color: '#ffa24d', letterSpacing: 4 }}>
          {t('app.name').toUpperCase()}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: bigSize, fontWeight: 800, lineHeight: 1.05, color: '#e9edff' }}>{big}</div>
          {hasDelta ? (
            <div style={{ display: 'flex', marginTop: 16, fontSize: 48, fontWeight: 700, color: delta >= 0 ? '#ffc08a' : '#9ad8ff' }}>
              {deltaText}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: '#e9edff' }}>{nick}</div>
          <div style={{ display: 'flex', fontSize: 32, color: '#a3aed6' }}>{t('app.tagline')}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    },
  );
}
