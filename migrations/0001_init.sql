-- Crier schema v1.
-- Requires extensions: vector, pg_trgm, unaccent, pgcrypto (all available on Supabase).

create table if not exists publishers (
  id               text primary key,
  name             text not null,
  description      text,
  url              text,
  domain           text,
  domain_verified_at timestamptz,
  verify_token     text not null,
  api_key_hash     text not null unique,
  api_key_prefix   text not null,
  status           text not null default 'active' check (status in ('active','suspended')),
  post_count       integer not null default 0,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz
);
create index if not exists publishers_domain_idx on publishers (domain);

-- array_to_string is only STABLE; wrap it so it can be used in a generated column.
create or replace function tags_text(t text[]) returns text language sql immutable parallel safe as $$
  select coalesce(array_to_string(t, ' '), '')
$$;

create table if not exists posts (
  id               text primary key,
  publisher_id     text not null references publishers(id) on delete cascade,
  kind             text not null default 'announcement' check (kind in ('event','offer','request','announcement')),
  title            text not null check (char_length(title) between 1 and 200),
  body             text not null check (char_length(body) between 1 and 8000),
  url              text,
  tags             text[] not null default '{}',
  place_name       text,
  lat              double precision check (lat is null or (lat between -90 and 90)),
  lng              double precision check (lng is null or (lng between -180 and 180)),
  starts_at        timestamptz,
  ends_at          timestamptz,
  timezone         text,
  expires_at       timestamptz not null,
  source_url       text,
  source_key       text,
  syndicated       boolean not null default false,
  idempotency_key  text,
  metadata         jsonb not null default '{}'::jsonb,
  tsv              tsvector generated always as (
                     setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                     setweight(to_tsvector('simple',  tags_text(tags)), 'A') ||
                     setweight(to_tsvector('english', coalesce(body, '')), 'B') ||
                     setweight(to_tsvector('simple',  coalesce(place_name, '')), 'C')
                   ) stored,
  embedding        vector(1024),
  retrievals       bigint not null default 0,
  views            bigint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index if not exists posts_idempotency_idx on posts (publisher_id, idempotency_key) where idempotency_key is not null;
create index if not exists posts_tsv_idx        on posts using gin (tsv);
create index if not exists posts_tags_idx       on posts using gin (tags);
create index if not exists posts_live_idx       on posts (created_at desc) where deleted_at is null;
create index if not exists posts_expires_idx    on posts (expires_at);
create index if not exists posts_starts_idx     on posts (starts_at) where starts_at is not null;
create index if not exists posts_geo_idx        on posts (lat, lng) where lat is not null;
create index if not exists posts_source_idx     on posts (source_key) where source_key is not null;
create index if not exists posts_publisher_idx  on posts (publisher_id, created_at desc);
create index if not exists posts_embedding_idx  on posts using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

create table if not exists subscriptions (
  id               text primary key,
  publisher_id     text not null references publishers(id) on delete cascade,
  query            jsonb not null,
  query_embedding  vector(1024),
  webhook_url      text,
  secret           text not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  last_matched_at  timestamptz,
  last_polled_at   timestamptz,
  failures         integer not null default 0
);
create index if not exists subscriptions_active_idx on subscriptions (active) where active;

create table if not exists deliveries (
  id               bigserial primary key,
  subscription_id  text not null references subscriptions(id) on delete cascade,
  post_id          text not null references posts(id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending','delivered','failed','polled')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_status      integer,
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz,
  unique (subscription_id, post_id)
);
create index if not exists deliveries_pending_idx on deliveries (next_attempt_at) where status = 'pending';
create index if not exists deliveries_sub_idx on deliveries (subscription_id, id);

create table if not exists rate_limits (
  key              text primary key,
  window_start     timestamptz not null,
  count            integer not null default 0
);

create table if not exists cron_state (
  key              text primary key,
  value            jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

create table if not exists stats_daily (
  day              date primary key,
  searches         bigint not null default 0,
  posts            bigint not null default 0,
  registrations    bigint not null default 0,
  retrievals       bigint not null default 0,
  deliveries       bigint not null default 0
);

-- Maintain publisher post counts.
create or replace function posts_count_trigger() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update publishers set post_count = post_count + 1 where id = new.publisher_id;
  elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    update publishers set post_count = greatest(post_count - 1, 0) where id = new.publisher_id;
  elsif tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null then
    update publishers set post_count = post_count + 1 where id = new.publisher_id;
  end if;
  return null;
end $$;
drop trigger if exists posts_count on posts;
create trigger posts_count after insert or update of deleted_at on posts
  for each row execute function posts_count_trigger();

-- Bump a daily counter.
create or replace function bump_stat(col text, n bigint default 1) returns void language plpgsql as $$
begin
  execute format(
    'insert into stats_daily (day, %I) values (current_date, $1) on conflict (day) do update set %I = stats_daily.%I + $1',
    col, col, col) using n;
end $$;

-- Fixed-window rate limiter. Returns remaining allowance (negative = over).
create or replace function rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns integer language plpgsql as $$
declare
  v_count integer;
  v_start timestamptz;
begin
  insert into rate_limits (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning count into v_count;
  return p_limit - v_count;
end $$;

insert into cron_state (key, value) values ('board', jsonb_build_object('launched', to_char(now(), 'YYYY-MM-DD')))
on conflict (key) do nothing;
