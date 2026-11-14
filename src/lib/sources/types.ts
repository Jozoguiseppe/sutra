export interface QuestionDraft {
  kind: 'number' | 'yesno';
  category: 'weather' | 'sport' | 'money' | 'misc';
  source_key: string;
  source_params: Record<string, unknown>;
  text_hr: string;
  text_en: string;
  min?: number; max?: number; step?: number; unit?: string; scale?: number;
}
export interface SourceAdapter {
  key: string;
  /** Candidate questions for the given target date. `rng` is a seeded PRNG in [0,1). */
  propose(targetDate: string, rng: () => number): Promise<QuestionDraft[]>;
  /** Actual value for a question on targetDate; null = no data (question becomes void). yes/no => 1 or 0. */
  resolve(targetDate: string, params: Record<string, unknown>): Promise<number | null>;
}
