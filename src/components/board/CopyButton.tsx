'use client';

import { useEffect, useRef, useState } from 'react';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function CopyButton({
  text, label, copiedLabel, className = '',
}: { text: string; label: string; copiedLabel: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function onClick() {
    if (!(await copyText(text))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      aria-live="polite"
      className={`min-h-[44px] rounded-xl bg-white/10 px-4 text-sm font-semibold text-mist transition-colors hover:bg-white/15 active:scale-[0.98] ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
