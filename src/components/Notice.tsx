'use client';

export default function Notice({
  message, tone = 'info', actionLabel, onAction,
}: {
  message: string;
  tone?: 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`glass flex flex-col gap-3 rounded-2xl p-4 ${tone === 'error' ? 'border-danger/40' : ''}`}
    >
      <p className={tone === 'error' ? 'text-danger' : 'text-mist'}>{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="min-h-[44px] self-start rounded-xl bg-white/10 px-4 font-semibold text-mist transition-colors hover:bg-white/15"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
