-- Sutra initial schema. Runs on Supabase Postgres and PGlite.
-- All access is server-side via a direct connection; RLS is enabled with NO policies (deny-all for API keys).

create table counties (
  id   smallint primary key,
  name text not null unique
);

create table cities (
  id        int primary key,
  name      text not null,
  county_id smallint not null references counties(id)
);
create index cities_county_idx on cities(county_id);

create table players (
  id              uuid primary key default gen_random_uuid(),
  nickname        text not null,
  nickname_lower  text not null unique,
  city_id         int not null references cities(id),
  token_hash      text not null unique,
  offset_points   int not null default 0,
  first_round     date not null,
  created_at      timestamptz not null default now()
);
create index players_city_idx on players(city_id);

create table rounds (
  target_date date primary key,
  status      text not null default 'draft' check (status in ('draft', 'ready', 'settled')),
  settled_at  timestamptz
);

create table questions (
  id            uuid primary key default gen_random_uuid(),
  round_date    date not null references rounds(target_date),
  position      smallint not null check (position between 1 and 8),
  kind          text not null check (kind in ('number', 'yesno')),
  category      text not null,
  source_key    text not null,
  source_params jsonb not null default '{}'::jsonb,
  text_hr       text not null,
  text_en       text not null,
  min           numeric,
  max           numeric,
  step          numeric,
  unit          text,
  scale         numeric,
  status        text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'void')),
  actual_value  numeric,
  resolved_at   timestamptz
);
create index questions_round_idx on questions(round_date);

create table predictions (
  player_id   uuid not null references players(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  round_date  date not null references rounds(target_date),
  value       numeric not null,
  staked      boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (player_id, question_id)
);
create index predictions_round_idx on predictions(round_date);
create unique index one_stake_per_round on predictions(player_id, round_date) where staked;

create table settlements (
  player_id    uuid not null references players(id) on delete cascade,
  round_date   date not null references rounds(target_date),
  delta        int not null,
  missed       boolean not null,
  offset_after int not null,
  detail       jsonb not null,
  primary key (player_id, round_date)
);
create index settlements_round_idx on settlements(round_date);

create table leagues (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  owner_id   uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table league_members (
  league_id uuid not null references leagues(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  primary key (league_id, player_id)
);
create index league_members_player_idx on league_members(player_id);

alter table counties       enable row level security;
alter table cities         enable row level security;
alter table players        enable row level security;
alter table rounds         enable row level security;
alter table questions      enable row level security;
alter table predictions    enable row level security;
alter table settlements    enable row level security;
alter table leagues        enable row level security;
alter table league_members enable row level security;
