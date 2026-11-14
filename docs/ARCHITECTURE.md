# Sutra — architecture & contracts (Z1)

Working title "Sutra" (final name TBD — never hardcode the name; use the `app.name` message key).
Daily prediction game: every day players give 4 predictions about TOMORROW's real-world numbers.
Results arrive at 20:00 the next day. Progress = time travel: good predictions throw you into the
future, bad ones into the past. Croatia first (HR), English later (all UI text in message files).

## 1. Stack

- Next.js (App Router, TypeScript, Tailwind), deployed on Vercel. Mobile-first web.
- Postgres (Supabase in production). **All DB access is server-side only** through `src/lib/db`.
  The browser never talks to the database. RLS is enabled on every table with NO policies
  (deny-all for anon/authenticated keys); the server connects with a direct Postgres connection string.
- Drivers behind one interface: `postgres` (postgres.js, `prepare:false`) when `DATABASE_URL` is set,
  otherwise `@electric-sql/pglite` (in-process Postgres; used for local dev and tests, data dir `.pglite/`,
  in-memory for tests).
- Tests: vitest.
- No accounts. A player = nickname + city + secret device token in an httpOnly cookie.

## 2. Time model (Europe/Zagreb is the only game timezone)

A **round** is identified by its `target_date` D (the day the predictions are about).

| Moment (Zagreb) | Event |
|---|---|
| D-2 18:00 | generator proposes questions for round D (`questions.status='proposed'`) |
| D-2 18:00 → D-1 00:00 | admin may approve / replace; anything still `proposed` at D-1 00:00 is auto-approved on first read |
| D-1 00:00 → D 00:00 | round D is **open**: players predict / change predictions |
| D 00:00 | **lock** — purely time-derived, no cron needed: server rejects writes when `now >= lockInstant(D)` |
| D 20:00 | **settlement**: actual values fetched, all players scored, round becomes `settled` |

So on any day T a player sees: round T+1 (open, predict now) and round T (locked, results at 20:00).
Every question must be resolvable from its source by **19:30 Zagreb on D**.

`rounds.status` in DB: `draft` → `ready` → `settled`. "open"/"locked" are derived from the clock.

Helpers (`src/lib/time.ts`, pure, take `now: Date` explicitly — never call `Date.now()` inside):
`zagrebDate(now): string` (YYYY-MM-DD), `zagrebHour(now): number`, `addDays(date, n): string`,
`lockInstant(targetDate): Date` (Zagreb midnight starting D), `settleInstant(targetDate): Date` (20:00 Zagreb on D),
`openRoundDate(now) = addDays(zagrebDate(now), 1)`, `pendingRoundDate(now) = zagrebDate(now)`.
Must be DST-correct (use `Intl.DateTimeFormat` with `timeZone:'Europe/Zagreb'`).

Server "now" comes from `src/lib/now.ts` → `getNow()`; it honours env `FAKE_NOW` (ISO string) when
`NODE_ENV !== 'production'` so the whole flow can be tested.

## 3. Scoring (`src/lib/scoring.ts`, pure functions)

Unit = **shift points** ("dani pomaka"). Per question:

- `number` (slider): `e = |guess - actual|`. If `e < step/2` → **+30**. Else `s = min(e/scale, 1)`,
  points = `round(30 - 40*s)` → range **-10 … +30**. `scale` is per-question ("error at which you get -10").
- `yesno` (value 1 = yes, 0 = no): correct **+15**, wrong **-10**.
- Unanswered question: 0. Void question (no actual value): 0 for everyone.
- **Stake (ulog)**: at most one staked prediction per player per round; its points are ×2 (so -20 … +60).
  Stake on a void question has no effect.
- Round delta = sum of the four. A player who was eligible (`first_round <= D`)
  and submitted **zero** predictions for the round gets `MISSED_ROUND_DELTA = -1` (the calendar eats one day).
- `players.offset_points` = running sum of all deltas. Starts at 0.

API:
```ts
export const MISSED_ROUND_DELTA = -1;
export function scoreNumber(guess: number, actual: number, scale: number, step: number): number;
export function scoreYesNo(guess: 0|1, actual: 0|1): number;
export interface RoundItem { questionId: string; kind: 'number'|'yesno'; guess: number|null; actual: number|null; scale: number|null; step: number|null; staked: boolean; }
export interface RoundScore { delta: number; missed: boolean; perQuestion: { questionId: string; points: number; staked: boolean; void: boolean; answered: boolean }[] }
export function scoreRound(items: RoundItem[]): RoundScore;
```

### Time warp (points → displayed date)

Displayed position is a calendar date: `today + warpDays(offset_points)` where
`warpDays(x) = sign(x) * (|x| + floor(x*x / 100))` days. Near zero 1 point ≈ 1 day; far away time accelerates
(≈ +300 pts → ~2030, ≈ +690 → ~2041, ≈ -1000 → ~1996, ≈ -5000 → Middle Ages).
```ts
export function warpDays(offset: number): number;
export function displayDate(today: string, offset: number): { year: number; month: number; day: number }; // proleptic Gregorian, year may be <= 0
export function pointsToYear(today: string, offset: number, targetYear: number): number; // how many more points (>=0) until displayDate reaches Jan 1 of targetYear (if targetYear is ahead) or Dec 31 of targetYear (if behind) — for "do 2030. ti fali N"
```
Stations (`src/data/stations.ts`, Z7) are keyed by **year ranges**.

## 4. Database schema (migration `supabase/migrations/0001_init.sql`)

```
counties(id smallint pk, name text unique)
cities(id int pk, name text, county_id smallint fk)             -- seeded from data/cities.json
players(id uuid pk default gen_random_uuid(), nickname text, nickname_lower text unique,
        city_id int fk, token_hash text unique,                  -- sha256 of cookie token
        offset_points int not null default 0, first_round date not null,  -- first round the player could play
        created_at timestamptz default now())
rounds(target_date date pk, status text check in ('draft','ready','settled') default 'draft',
       settled_at timestamptz)
questions(id uuid pk default gen_random_uuid(), round_date date fk rounds, position smallint,   -- 1..4 = the set; 5..8 = spares
          kind text check in ('number','yesno'), category text,       -- 'weather'|'sport'|'money'|'misc'
          source_key text, source_params jsonb not null default '{}', -- what the resolver needs
          text_hr text not null, text_en text not null,
          min numeric, max numeric, step numeric, unit text, scale numeric,  -- number kind only
          status text check in ('proposed','approved','rejected','void') default 'proposed',
          actual_value numeric, resolved_at timestamptz)
predictions(player_id uuid fk, question_id uuid fk, round_date date fk, value numeric not null,
            staked boolean not null default false, updated_at timestamptz default now(),
            primary key(player_id, question_id))
  unique index one_stake_per_round on predictions(player_id, round_date) where staked
settlements(player_id uuid fk, round_date date fk, delta int not null, missed boolean not null,
            offset_after int not null, detail jsonb not null, primary key(player_id, round_date))
leagues(id uuid pk default gen_random_uuid(), code text unique, name text, owner_id uuid fk players, created_at timestamptz default now())
league_members(league_id uuid fk, player_id uuid fk, primary key(league_id, player_id))
```
Indexes for: predictions by round_date, players by city_id, settlements by round_date, questions by round_date.
RLS enabled on all tables, no policies.

DB interface (`src/lib/db/index.ts`):
```ts
export interface Db { query<T = any>(sql: string, params?: unknown[]): Promise<T[]>; tx<T>(fn: (db: Db) => Promise<T>): Promise<T>; }
export async function getDb(): Promise<Db>;          // singleton (survive Next dev hot reload via globalThis); with pglite it runs migrations + seeds cities
export async function createTestDb(): Promise<Db>;   // fresh in-memory pglite with migrations + seed applied
```
Use `$1,$2` placeholders. Dates returned as 'YYYY-MM-DD' strings, numerics as JS numbers, jsonb as parsed objects
(normalise in the driver wrappers so both drivers behave identically).

## 5. Domain services (`src/lib/services/*.ts`) — all take `(db, now, ...)`, no globals

- `players.ts`: `createPlayer(db, now, {nickname, cityId}) → {player, token}` (nickname 3–20 chars, letters/digits/space/_-, unique case-insensitive; `first_round = openRoundDate(now)`), `getPlayerByToken(db, token)`.
- `rounds.ts`: `getOpenRound(db, now, playerId?)` → `{ targetDate, lockAt, questions[4], predictions }` (ensures the round has questions: if none exist it calls `generateProposals`; if no approved set exists, promotes positions 1–4 from proposed to approved; sets round `ready`), `savePrediction(db, now, playerId, {questionId, value, staked})` (validates open, range/step, yes/no ∈ {0,1}; setting `staked:true` clears stake on the player's other predictions for the round, in one tx), `getPendingRound(db, now, playerId)` (today's locked round, my predictions, `settleAt`).
- `questions.ts` (generator, Z11): `generateProposals(db, now, targetDate)` → inserts 8 proposals (positions 1–8) via source adapters; idempotent per round (no-op if the round already has questions). Mix: 2 number + 2 yes/no in positions 1–4, mixed categories.
- `settle.ts` (Z12): `settleRound(db, now, targetDate)`.
- `results.ts`: `getRoundResult(db, now, playerId, targetDate?)` → my per-question points, actual values, crowd average per question (and % yes), share of players I beat that round, "najluđa prognoza" (largest error per number question, with nickname), my offset before/after, displayed dates before/after.
- `leaderboard.ts`: `cityLeaderboard(db)` (avg offset_points per city, with player count), `createLeague(db, playerId, name)` (6-char code), `joinLeague(db, playerId, code)`, `leagueTable(db, code)`, `myLeagues(db, playerId)`.
- `admin.ts`: `listProposals(db, targetDate)`, `approveAll(db, targetDate)`, `reject(db, questionId)` (marks rejected and promotes the first spare into its position).

### Settlement algorithm (must be idempotent and atomic)
1. Refuse if `now < settleInstant(D)` (`{tooEarly:true}`). If round already `settled` → return `{alreadySettled:true}` and change nothing. If the round does not exist or has no approved questions → `{nothingToSettle:true}`.
2. For every approved question of D without `actual_value`: call the adapter's `resolve`. On failure/null → mark question `void`. (Resolving happens BEFORE the transaction; network calls never run inside a tx.)
3. In ONE transaction: `update rounds set status='settled', settled_at=$now where target_date=$D and status<>'settled' returning` — if no row returned, abort (someone else settled). Then for every player with `first_round <= D`: compute `scoreRound`, insert `settlements`, `offset_points += delta`.
4. Running it twice must not change any number (test this).

### Source adapters (`src/lib/sources/*.ts`)
```ts
export interface QuestionDraft { kind: 'number'|'yesno'; category: string; source_key: string; source_params: any; text_hr: string; text_en: string; min?: number; max?: number; step?: number; unit?: string; scale?: number; }
export interface SourceAdapter { key: string; propose(targetDate: string, rng: () => number): Promise<QuestionDraft[]>; resolve(targetDate: string, params: any): Promise<number | null>; }
export function getAdapter(key: string): SourceAdapter | undefined; export function activeAdapters(): SourceAdapter[];
```
A deterministic `mock` adapter (seeded by date, both propose and resolve) must exist so dev/tests work offline;
real adapters are active only when env `SOURCES=live`. Real sources are listed in `docs/DATA_SOURCES.md` (Z2).

## 6. HTTP API (route handlers under `src/app/api`, JSON; errors `{error: code}` with proper status)

| Route | Purpose |
|---|---|
| `POST /api/player` `{nickname, cityId}` | create player, set cookie `sutra_token` (httpOnly, SameSite=Lax, 1 year) |
| `GET /api/me` | player + offset + displayed date, or 401 |
| `GET /api/cities` | cities grouped by county |
| `GET /api/round/open` | open round + my predictions |
| `PUT /api/predictions` `{questionId, value, staked}` | save/replace one prediction; 409 `locked` after lock |
| `GET /api/round/pending` | today's locked round + my predictions + settleAt |
| `GET /api/round/result?date=` | result of a settled round (default: latest settled) |
| `GET /api/leaderboard/cities` | city table |
| `GET/POST /api/leagues` `{name}` · `POST /api/leagues/join` `{code}` · `GET /api/leagues/[code]` | private leagues |
| `GET/POST /api/admin/questions` | review proposals; header `x-admin-token: $ADMIN_TOKEN` |
| `GET /api/cron/generate` · `GET /api/cron/settle` | header `Authorization: Bearer $CRON_SECRET`. Vercel cron is UTC-only, so settle is scheduled at 18:05 and 19:05 UTC and the handler itself checks `zagrebHour(now) >= 20`; generate at 16:05 and 17:05 UTC with guard `>= 18` (generates round today+2) |
| `GET /api/og?y=2041&n=nick` | share card image |

Shared server helper `src/lib/server.ts`: `getContext()` → `{db, now, player|null}` (reads cookie), `json()`, `error()`.

## 7. UI (pages under `src/app`), mobile-first, Croatian by default

- `/` — if no player: onboarding (nickname + city). Else home: my date (big), timeline, "Prognoze za sutra" (4 cards), countdown to lock, pending round with countdown to 20:00, link to last result.
- `/rezultat` — result screen (the real product): animated jump, new date + era description, "do {year} ti fali N", per-question breakdown with arrows, Mudrost naroda (crowd avg vs reality), Najluđa prognoza dana, share (text grid of ⏩⏪ + OG card).
- `/ljestvica` — cities + my leagues (create / join by code).
- `/admin` — proposals review (token entered once, kept in localStorage).

i18n: `messages/hr.json`, `messages/en.json`, flat dotted keys, `t(key, vars)` from `src/lib/i18n.ts` with `{var}` interpolation. No user-visible string literal in components.

## 8. File ownership (to avoid conflicts between parallel tasks)

Nobody edits `package.json` except Z3 (all deps are installed up-front). Each task edits only its own files; if it
needs a change elsewhere it reports it instead of editing.

## 9. Exact API shapes and conventions (added after wave 1)

- **`src/lib/api-types.ts` is the source of truth for every request/response shape.** Route handlers and UI both import its types. Do not change it; report if something is missing.
- `src/lib/sources/types.ts` holds `QuestionDraft` / `SourceAdapter`. `src/lib/sources/live.ts` exports `liveAdapters`.
- UI pages are **client components** that fetch the JSON API (no server data fetching in pages, no `cacheComponents`). Route handlers must be dynamic (they read cookies / the clock).
- Next.js is version 16 — read `AGENTS.md` and the docs in `node_modules/next/dist/docs/` before using any Next API (cookies(), route handler signatures, params are async, etc.).
- DB quirks: inside `db.tx(fn)` use ONLY the `db` passed to the callback (PGlite deadlocks otherwise). For jsonb params pass plain objects; `JSON.stringify` arrays.
- Plurals: Croatian needs `unit.days.one/few/other` from the message files; write a small `plural(n)` helper in the UI. Years <= 0 are displayed as `1 - year` + `era.bc`.
- Message keys live in `messages/hr.json` (256 keys, prefixes app., nav., onboard., home., result., crowd., wildest., share., board., league., admin., error., month., era., unit., station.). Use existing keys; if one is truly missing, add it to BOTH files at the end of the file.
