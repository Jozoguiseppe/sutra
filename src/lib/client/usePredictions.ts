'use client';

import { useCallback, useRef, useState } from 'react';
import type { PredictionDTO, SavePredictionResponse } from '@/lib/api-types';
import { apiSend, errorCode } from './api';

export type SaveState = 'saving' | 'saved' | 'failed';

/**
 * Optimistic prediction state for one open round. The server response (all predictions of the
 * round) is the truth: after each save the list is replaced by what the server returned.
 */
export function usePredictions(initial: PredictionDTO[], onLocked: () => void) {
  const [predictions, setPredictions] = useState<PredictionDTO[]>(initial);
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const globalSeq = useRef(0);
  const perQuestionSeq = useRef<Record<string, number>>({});
  const lastRequest = useRef<Record<string, { value: number; staked: boolean }>>({});

  const save = useCallback(
    async (questionId: string, value: number, staked: boolean) => {
      const mySeq = ++globalSeq.current;
      const myQSeq = (perQuestionSeq.current[questionId] ?? 0) + 1;
      perQuestionSeq.current[questionId] = myQSeq;
      lastRequest.current[questionId] = { value, staked };

      setPredictions((prev) => {
        const others = prev
          .filter((p) => p.questionId !== questionId)
          .map((p) => (staked && p.staked ? { ...p, staked: false } : p));
        return [...others, { questionId, value, staked }];
      });
      setStatus((s) => ({ ...s, [questionId]: 'saving' }));

      try {
        const res = await apiSend<SavePredictionResponse>('/api/predictions', 'PUT', { questionId, value, staked });
        if (mySeq === globalSeq.current) setPredictions(res.predictions);
        if (perQuestionSeq.current[questionId] === myQSeq) setStatus((s) => ({ ...s, [questionId]: 'saved' }));
      } catch (e) {
        if (perQuestionSeq.current[questionId] === myQSeq) setStatus((s) => ({ ...s, [questionId]: 'failed' }));
        if (errorCode(e) === 'locked') onLocked();
      }
    },
    [onLocked],
  );

  const retry = useCallback(
    (questionId: string) => {
      const last = lastRequest.current[questionId];
      if (last) void save(questionId, last.value, last.staked);
    },
    [save],
  );

  return { predictions, status, save, retry };
}
