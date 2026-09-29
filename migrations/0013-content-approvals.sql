-- Human approval binds one exact public Agent upload, without storing a draft.
-- Existing Post/Publisher/experience histories and authorization grants stay intact.
create table gongzhi_content_approvals (
  id text primary key,
  human_owner_id text not null references gongzhi_owners(id),
  agent_id text not null references gongzhi_owners(id),
  action text not null check (action in ('publish_experience','experience_feedback')),
  visibility text not null check (visibility='public'),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null,
  fingerprint text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  consumed_at timestamptz,
  record_id text references posts(id),
  created_at timestamptz not null default now(),
  unique(human_owner_id,idempotency_key),
  check ((consumed_at is null) = (record_id is null))
);
create index gongzhi_content_approvals_owner on gongzhi_content_approvals(human_owner_id,created_at desc);
alter table gongzhi_content_approvals enable row level security;
revoke all on gongzhi_content_approvals from public;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on gongzhi_content_approvals from %I',r); end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='crier_app') then
    grant select,insert,update on gongzhi_content_approvals to crier_app;
    create policy gongzhi_server on gongzhi_content_approvals to crier_app using(true) with check(true);
  end if;
end $$;

create function gongzhi_content_approval_immutable() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'immutable content approval'; end if;
  if (to_jsonb(new)-array['revoked_at','consumed_at','record_id']) is distinct from
     (to_jsonb(old)-array['revoked_at','consumed_at','record_id']) or
     (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) or
     (old.consumed_at is not null and (new.consumed_at is distinct from old.consumed_at or new.record_id is distinct from old.record_id)) then
    raise exception 'immutable content approval';
  end if;
  return new;
end $$;
create trigger gongzhi_content_approval_history before update or delete on gongzhi_content_approvals for each row execute function gongzhi_content_approval_immutable();
revoke execute on function gongzhi_content_approval_immutable() from public;
