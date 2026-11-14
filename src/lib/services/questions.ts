import type { Db } from '../db';
import type { QuestionDraft } from '../sources/types';
import { activeAdapters, mockAdapter, makeRng, shuffle } from '../sources';

const MIN_DRAFTS = 8;
const MIN_MAIN = 4;

async function collectDrafts(targetDate: string): Promise<QuestionDraft[]> {
  const drafts: QuestionDraft[] = [];
  for (const a of activeAdapters()) {
    try {
      drafts.push(...(await a.propose(targetDate, makeRng(`propose:${a.key}:${targetDate}`))));
    } catch {
      // a failing adapter must not block generation
    }
  }
  const live = process.env.SOURCES === 'live';
  if (live) {
    // Never mix invented (mock) questions into a live game: fewer spares is fine, fewer than 4 is a failure.
    if (drafts.length < MIN_MAIN) throw new Error('not_enough_live_drafts');
    return drafts;
  }
  // Mock data has invented "actual" values. In production it must be switched on explicitly (demo deployments).
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK !== '1') throw new Error('mock_sources_disabled');
  if (drafts.length < MIN_DRAFTS) {
    return mockAdapter.propose(targetDate, makeRng(`propose:mock:${targetDate}`));
  }
  return drafts;
}

/** Choose 8 drafts: positions 1-4 = 2 number + 2 yesno with mixed categories, 5-8 spares. */
export function selectDrafts(all: QuestionDraft[], rng: () => number): QuestionDraft[] {
  const seen = new Set<string>();
  const unique = all.filter((d) => {
    const k = JSON.stringify([d.source_key, d.source_params]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pool = shuffle(unique, rng);
  const chosen: QuestionDraft[] = [];
  const cats = new Set<string>();

  const take = (kind: QuestionDraft['kind'], n: number) => {
    for (let i = 0; i < n; i++) {
      let idx = pool.findIndex((d) => d.kind === kind && !cats.has(d.category));
      if (idx < 0) idx = pool.findIndex((d) => d.kind === kind);
      if (idx < 0) idx = 0;
      if (pool.length === 0) return;
      const [d] = pool.splice(idx, 1);
      cats.add(d.category);
      chosen.push(d);
    }
  };
  take('number', 2);
  take('yesno', 2);
  const main = shuffle(chosen, rng);
  const spares: QuestionDraft[] = [];
  const spareCats = new Set<string>();
  while (spares.length < 4 && pool.length) {
    let idx = pool.findIndex((d) => !spareCats.has(d.category));
    if (idx < 0) idx = 0;
    const [d] = pool.splice(idx, 1);
    spareCats.add(d.category);
    spares.push(d);
  }
  return [...main, ...spares];
}

/** Creates the round row if missing and inserts 8 proposals. Idempotent: no-op if the round already has questions. */
export async function generateProposals(db: Db, _now: Date, targetDate: string): Promise<{ created: boolean }> {
  await db.query('insert into rounds (target_date) values ($1) on conflict do nothing', [targetDate]);
  const existing = await db.query('select 1 from questions where round_date = $1 limit 1', [targetDate]);
  if (existing.length) return { created: false };

  // Network/adapters run before the transaction.
  const drafts = selectDrafts(await collectDrafts(targetDate), makeRng(`select:${targetDate}`));

  return db.tx(async (t) => {
    await t.query('select 1 from rounds where target_date = $1 for update', [targetDate]);
    const again = await t.query('select 1 from questions where round_date = $1 limit 1', [targetDate]);
    if (again.length) return { created: false };
    let pos = 1;
    for (const d of drafts) {
      const number = d.kind === 'number';
      await t.query(
        `insert into questions (round_date, position, kind, category, source_key, source_params, text_hr, text_en, min, max, step, unit, scale)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          targetDate, pos++, d.kind, d.category, d.source_key, d.source_params ?? {}, d.text_hr, d.text_en,
          number ? d.min ?? null : null, number ? d.max ?? null : null, number ? d.step ?? null : null,
          number ? d.unit ?? null : null, number ? d.scale ?? null : null,
        ],
      );
    }
    return { created: true };
  });
}
