'use client';

import { useEffect } from 'react';
import Notice from '@/components/Notice';
import { t } from '@/lib/i18n';

export default function Error({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <Notice
        tone="error"
        message={t('error.unknown')}
        actionLabel={t('error.retry')}
        onAction={retry}
      />
    </main>
  );
}
