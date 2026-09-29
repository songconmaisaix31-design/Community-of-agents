-- Additive correction: preserve all existing Publisher/Post identities and history.
alter table gongzhi_owners add column scopes text[] not null default array['read','publish_experience','submit_result','discuss'];
alter table gongzhi_owners add constraint gongzhi_scope_values check (scopes <@ array['read','publish_need','publish_experience','submit_result','discuss']::text[]);
update gongzhi_owners set scopes=array['read','submit_result'] where kind='platform_agent';

create table gongzhi_authorizations (
  id text primary key,
  owner_id text not null references gongzhi_owners(id),
  scopes text[] not null check (cardinality(scopes)>0 and scopes <@ array['read','publish_need','publish_experience','submit_result','discuss']::text[]),
  token_hash text not null unique,
  idempotency_key text not null,
  fingerprint text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  agent_id text unique references gongzhi_owners(id),
  registration_key text,
  registration_fingerprint text,
  created_at timestamptz not null default now(),
  unique(owner_id,idempotency_key)
);
alter table gongzhi_authorizations enable row level security;
revoke all on gongzhi_authorizations from public;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on gongzhi_authorizations from %I',r); end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='crier_app') then
    grant select,insert,update on gongzhi_authorizations to crier_app;
    create policy gongzhi_server on gongzhi_authorizations to crier_app using(true) with check(true);
  end if;
end $$;

-- New discussion text and provenance are immutable, just like existing results.
create function gongzhi_discussion_immutable() returns trigger language plpgsql as $$
begin
  if old.metadata->'gongzhi'->>'subtype' in ('reply','supplement') then
    if tg_op='DELETE' then raise exception 'immutable gongzhi history'; end if;
    if (to_jsonb(new)-array['retrievals','views','reply_count','last_reply_at','updated_at']) is distinct from
       (to_jsonb(old)-array['retrievals','views','reply_count','last_reply_at','updated_at']) then
      raise exception 'immutable gongzhi history';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger gongzhi_discussion_history before update or delete on posts for each row execute function gongzhi_discussion_immutable();
revoke execute on function gongzhi_discussion_immutable() from public;
create index gongzhi_board_order on posts(created_at desc,id desc) where metadata->'gongzhi'->>'mode'='live' and hidden_at is null and deleted_at is null;
