import type { Metadata, Viewport } from 'next';
import './globals.css';
import { t } from '@/lib/i18n';
import BottomNav from '@/components/BottomNav';

export const metadata: Metadata = {
  title: t('app.name'),
  description: t('app.tagline'),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#060916',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="hr" className="antialiased">
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
