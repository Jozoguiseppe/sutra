import { describe, expect, it } from 'vitest';
import { buildShareText, formatSignedDays, shareGrid } from './share';

describe('share', () => {
  it('maps points to symbols and never leaks answers', () => {
    expect(
      shareGrid([
        { void: false, points: 30 },
        { void: false, points: -10 },
        { void: false, points: 0 },
        { void: true, points: 0 },
      ]),
    ).toBe('⏩⏪⏸✖');
  });
  it('treats unanswered as neutral', () => {
    expect(shareGrid([{ void: false, points: null }])).toBe('⏸');
  });
  it('signs deltas with correct plurals', () => {
    expect(formatSignedDays(1)).toBe('+1 dan');
    expect(formatSignedDays(3)).toBe('+3 dana');
    expect(formatSignedDays(-21)).toBe('−21 dan');
    expect(formatSignedDays(0)).toBe('0 dana');
  });
  it('builds the text', () => {
    const text = buildShareText({
      year: 2041,
      delta: 12,
      questions: [
        { void: false, points: 30 },
        { void: false, points: -10 },
        { void: false, points: 0 },
        { void: false, points: 15 },
      ],
      url: 'https://sutra.example',
    });
    expect(text).toBe('Sutra · Ja sam u 2041. (+12 dana)\n⏩⏪⏸⏩\nhttps://sutra.example');
  });
  it('shows BC years as 1 - year', () => {
    const text = buildShareText({ year: 0, delta: -5, questions: [], url: 'u' });
    expect(text).toContain('Ja sam u 1. pr. Kr.');
  });
});
