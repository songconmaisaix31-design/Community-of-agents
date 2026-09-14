-- App-local identities; do not merge by email/name or modify existing Auth/owners.
create table gongzhi_web_users (
  id uuid primary key,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
create table gongzhi_web_subjects (
  provider text not null check(provider='zhihu'),
  subject text not null,
  kind text not null check(kind in ('hash','uid')),
  user_id uuid not null references gongzhi_web_users(id),
  primary key(provider,subject),
  unique(provider,user_id,kind)
);
create table gongzhi_web_states (
  state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),
  browser_hash text not null check(browser_hash ~ '^[0-9a-f]{64}$'),
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create table gongzhi_web_sessions (
  session_hash text primary key check(session_hash ~ '^[0-9a-f]{64}$'),
  browser_hash text not null check(browser_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references gongzhi_web_users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index gongzhi_web_states_expiry on gongzhi_web_states(expires_at);
create index gongzhi_web_sessions_expiry on gongzhi_web_sessions(expires_at);
-- No browser role can read state/session digests or provider identifiers.
do $$ declare t text; r text; begin
  foreach t in array array['gongzhi_web_users','gongzhi_web_subjects','gongzhi_web_states','gongzhi_web_sessions'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on table %I from public',t);
    foreach r in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on table %I from %I',t,r); end if;
    end loop;
    if exists(select 1 from pg_roles where rolname='crier_app') then
      execute format('grant select,insert,update on table %I to crier_app',t);
      execute format('create policy gongzhi_server on %I to crier_app using(true) with check(true)',t);
    end if;
  end loop;
end $$;
-- Provider subjects are permanent identity links, never reassigned by a login.
create function gongzhi_web_subject_immutable() returns trigger language plpgsql as $$
begin raise exception 'immutable provider identity'; end $$;
create trigger gongzhi_web_subject_history before update or delete on gongzhi_web_subjects
  for each row execute function gongzhi_web_subject_immutable();
revoke execute on function gongzhi_web_subject_immutable() from public;
