-- Metrics: distinct actors per day, flexible daily counters, unmet queries, registration attribution.

-- Who did what today. actor is a publisher id, an address hash, or an MCP client name; never a raw address.
create table if not exists daily_actors (
  day    date not null,
  role   text not null,          -- seeker | publisher | syndicator | mcp_client | registrant
  actor  text not null,
  n      integer not null default 1,
  primary key (day, role, actor)
);

-- Anything countable: route:<path>, mcp:initialize, mcp:tool:<name>, mcp:client:<name>, page:<class>, search:total, search:zero, register:client:<name>
create table if not exists daily_counters (
  day    date not null,
  key    text not null,
  n      bigint not null default 0,
  primary key (day, key)
);

-- Searches that returned nothing: the signal for what to seed. q is normalized and PII-stripped.
create table if not exists unmet_queries (
  id          bigserial primary key,
  day         date not null default current_date,
  q           text,
  kind        text,
  tags        text,
  near        text,               -- rounded to ~0.5 degree cells
  radius_km   real,
  seeker      text not null,      -- address hash or publisher id
  source      text not null,      -- rest | mcp | feed
  created_at  timestamptz not null default now()
);
create index if not exists unmet_queries_day_idx on unmet_queries (day desc);

alter table publishers add column if not exists client text;        -- declared by the registering agent, e.g. "claude-code"
alter table publishers add column if not exists user_agent text;    -- first 200 chars
alter table publishers add column if not exists internal boolean not null default false;  -- our own accounts, excluded from traction metrics

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'crier_app') then
    execute 'alter table daily_actors enable row level security';
    execute 'alter table daily_counters enable row level security';
    execute 'alter table unmet_queries enable row level security';
    execute 'drop policy if exists crier_app_all on daily_actors';
    execute 'create policy crier_app_all on daily_actors for all to crier_app using (true) with check (true)';
    execute 'drop policy if exists crier_app_all on daily_counters';
    execute 'create policy crier_app_all on daily_counters for all to crier_app using (true) with check (true)';
    execute 'drop policy if exists crier_app_all on unmet_queries';
    execute 'create policy crier_app_all on unmet_queries for all to crier_app using (true) with check (true)';
    execute 'grant all privileges on all tables in schema public to crier_app';
    execute 'grant all privileges on all sequences in schema public to crier_app';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
  end if;
end $$;

create or replace function bump_counter(p_key text, p_n bigint default 1) returns void language sql as $$
  insert into daily_counters (day, key, n) values (current_date, p_key, p_n)
  on conflict (day, key) do update set n = daily_counters.n + excluded.n;
$$;

create or replace function touch_actor(p_role text, p_actor text) returns void language sql as $$
  insert into daily_actors (day, role, actor, n) values (current_date, p_role, p_actor, 1)
  on conflict (day, role, actor) do update set n = daily_actors.n + 1;
$$;
