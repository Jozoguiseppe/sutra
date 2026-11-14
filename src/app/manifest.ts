import type { MetadataRoute } from 'next';
import { t } from '@/lib/i18n';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t('app.name'),
    short_name: t('app.name'),
    description: t('app.tagline'),
    start_url: '/',
    display: 'standalone',
    background_color: '#060916',
    theme_color: '#060916',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
