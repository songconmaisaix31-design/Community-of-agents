-- Syndication: data-driven sources so an operator (or the daily agent) can add one by inserting a row.

create table if not exists sources (
  id                 text primary key,               -- src_...
  name               text not null,
  adapter            text not null check (adapter in ('ticketmaster','ical','rss','localist','nws')),
  config             jsonb not null default '{}'::jsonb,  -- adapter-specific: url, lat, lng, radius_km, state, ...
  homepage           text,
  license            text not null,                  -- why we may redistribute this; runner refuses sources without one
  default_kind       text not null default 'event' check (default_kind in ('event','offer','request','announcement')),
  tags               text[] not null default '{}',
  enabled            boolean not null default true,
  run_every_minutes  integer not null default 360,
  max_per_run        integer not null default 100,
  horizon_days       integer not null default 30,    -- only items starting within this window
  added_by           text not null default 'operator',
  notes              text,
  created_at         timestamptz not null default now(),
  last_run_at        timestamptz,
  last_status        text,
  last_error         text,
  last_counts        jsonb
);

-- What we have relayed from each source, so re-runs update instead of duplicate, and vanished items can be retired.
create table if not exists source_items (
  source_id     text not null references sources(id) on delete cascade,
  uid           text not null,
  post_id       text references posts(id) on delete set null,
  hash          text not null,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  missing_runs  integer not null default 0,
  primary key (source_id, uid)
);
create index if not exists source_items_post_idx on source_items (post_id);

create table if not exists source_runs (
  id          bigserial primary key,
  source_id   text not null references sources(id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text,
  fetched     integer default 0,
  created     integer default 0,
  updated     integer default 0,
  retired     integer default 0,
  skipped     integer default 0,
  error       text
);
create index if not exists source_runs_source_idx on source_runs (source_id, id desc);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'crier_app') then
    execute 'alter table sources enable row level security';
    execute 'alter table source_items enable row level security';
    execute 'alter table source_runs enable row level security';
    execute 'drop policy if exists crier_app_all on sources';
    execute 'create policy crier_app_all on sources for all to crier_app using (true) with check (true)';
    execute 'drop policy if exists crier_app_all on source_items';
    execute 'create policy crier_app_all on source_items for all to crier_app using (true) with check (true)';
    execute 'drop policy if exists crier_app_all on source_runs';
    execute 'create policy crier_app_all on source_runs for all to crier_app using (true) with check (true)';
    execute 'grant all privileges on all tables in schema public to crier_app';
    execute 'grant all privileges on all sequences in schema public to crier_app';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
  end if;
end $$;
