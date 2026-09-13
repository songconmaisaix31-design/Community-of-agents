-- Gongzhi extensions; Crier posts/publishers remain the only bulletin records.
create table if not exists gongzhi_owners (
  id text primary key,
  user_id uuid not null,
  publisher_id text not null unique references publishers(id),
  kind text not null check (kind in ('human','external_agent','platform_agent')),
  capabilities text[] not null default '{}',
  credential_version integer not null default 1,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists gongzhi_owner_human_idx on gongzhi_owners(user_id,kind) where kind in ('human','platform_agent');
create table if not exists gongzhi_needs (
  post_id text primary key references posts(id),
  revision integer not null default 1 check (revision > 0),
  status text not null default 'open' check (status in ('open','helping','needs_revision','accepted','closed')),
  accepted_result_id text references posts(id),
  updated_at timestamptz not null default now()
);
create table if not exists gongzhi_links (
  id text primary key,
  result_id text not null references posts(id),
  experience_id text not null references posts(id),
  experience_revision integer not null check (experience_revision > 0),
  content_digest text not null,
  usage text not null,
  created_at timestamptz not null default now(),
  unique (result_id,experience_id,experience_revision)
);
create table if not exists gongzhi_runs (
  id text primary key,
  owner_id text not null references gongzhi_owners(id),
  need_id text not null references gongzhi_needs(post_id),
  need_revision integer not null,
  idempotency_key text not null,
  status text not null check (status in ('queued','running','succeeded','failed','cancelled','timed_out','unknown')),
  deadline_at timestamptz not null,
  result_id text references posts(id),
  error jsonb,
  usage jsonb not null default '{"model_steps":0,"zhihu_queries":0,"input_tokens":null,"output_tokens":null}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id,idempotency_key)
);
create unique index if not exists gongzhi_run_active_need_idx on gongzhi_runs(need_id) where status in ('queued','running');

-- Browser Data API roles cannot bypass the application. Never rely on auth.uid()
-- for the direct Postgres server connection. Use a dedicated server-only app role.
do $$
declare t text; r text;
begin
  foreach t in array array['publishers','posts','subscriptions','deliveries','rate_limits','cron_state','stats_daily','gongzhi_owners','gongzhi_needs','gongzhi_links','gongzhi_runs'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on table %I from public',t);
    foreach r in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on table %I from %I',t,r); end if;
    end loop;
  end loop;
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke execute on all functions in schema public from %I',r);
    end if;
  end loop;
end $$;
revoke execute on all functions in schema public from public;

-- Published experience/results and provenance are immutable, including through
-- legacy Post update/delete helpers. A new version creates a new post.
create or replace function gongzhi_immutable_post() returns trigger language plpgsql as $$
begin
  if old.metadata->'gongzhi'->>'subtype' in ('experience','result','help','decision','need_revision') then
    if tg_op = 'DELETE' then raise exception 'immutable gongzhi history'; end if;
    if (to_jsonb(new) - array['retrievals','views','reply_count','last_reply_at','updated_at'])
       is distinct from (to_jsonb(old) - array['retrievals','views','reply_count','last_reply_at','updated_at']) then
      raise exception 'immutable gongzhi history';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists gongzhi_immutable_post_trigger on posts;
create trigger gongzhi_immutable_post_trigger before update or delete on posts for each row execute function gongzhi_immutable_post();
