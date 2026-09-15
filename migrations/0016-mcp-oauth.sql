-- Additive OAuth AS records. Tokens/codes/browser secrets are stored only as hashes.
create table gongzhi_oauth_clients (
  id text primary key, name text not null, redirect_uris text[] not null,
  created_at timestamptz not null default now(), revoked_at timestamptz
);
create table gongzhi_oauth_requests (
  id text primary key, browser_hash text not null, csrf_hash text,
  client_id text not null references gongzhi_oauth_clients(id), redirect_uri text not null,
  issuer text not null, resource text not null, scopes text[] not null, state text,
  challenge text not null, user_id uuid, expires_at timestamptz not null, consumed_at timestamptz
);
create table gongzhi_oauth_codes (
  code_hash text primary key, client_id text not null references gongzhi_oauth_clients(id),
  redirect_uri text not null, issuer text not null, resource text not null, scopes text[] not null,
  challenge text not null, agent_id text not null references gongzhi_owners(id),
  grant_id text not null references gongzhi_authorizations(id), credential_version integer not null,
  expires_at timestamptz not null, consumed_at timestamptz
);
create table gongzhi_oauth_tokens (
  token_hash text primary key, client_id text not null references gongzhi_oauth_clients(id),
  issuer text not null, resource text not null, scopes text[] not null,
  agent_id text not null references gongzhi_owners(id), grant_id text not null references gongzhi_authorizations(id),
  credential_version integer not null, expires_at timestamptz not null, revoked_at timestamptz
);
create index gongzhi_oauth_token_agent on gongzhi_oauth_tokens(agent_id);
alter table gongzhi_web_states add column mcp_request_id text references gongzhi_oauth_requests(id);
do $$ declare t text; r text; begin
  foreach t in array array['gongzhi_oauth_clients','gongzhi_oauth_requests','gongzhi_oauth_codes','gongzhi_oauth_tokens'] loop
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
