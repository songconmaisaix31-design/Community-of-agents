-- Safety: reports, flags, hidden posts, terms acceptance, webhook consent, publisher deletion.

alter table posts add column if not exists flags text[] not null default '{}';
alter table posts add column if not exists hidden_at timestamptz;
alter table posts add column if not exists hidden_reason text;
alter table posts add column if not exists report_count integer not null default 0;
create index if not exists posts_hidden_idx on posts (hidden_at) where hidden_at is not null;
create index if not exists posts_embedding_null_idx on posts (created_at) where embedding is null and deleted_at is null;

alter table publishers add column if not exists terms_accepted_at timestamptz;
alter table publishers add column if not exists terms_version text;
alter table publishers add column if not exists suspended_reason text;
alter table publishers add column if not exists deleted_at timestamptz;
alter table publishers drop constraint if exists publishers_status_check;
alter table publishers add constraint publishers_status_check check (status in ('active','suspended','deleted'));

alter table subscriptions add column if not exists webhook_verified_at timestamptz;
alter table subscriptions add column if not exists webhook_challenge text;

create table if not exists reports (
  id               bigserial primary key,
  post_id          text not null references posts(id) on delete cascade,
  reason           text not null check (reason in ('spam','scam','illegal','harassment','privacy','copyright','injection','other')),
  details          text,
  reporter_hash    text not null,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolution       text,
  unique (post_id, reporter_hash)
);
create index if not exists reports_open_idx on reports (created_at desc) where resolved_at is null;

alter table reports enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'crier_app') then
    execute 'drop policy if exists crier_app_all on reports';
    execute 'create policy crier_app_all on reports for all to crier_app using (true) with check (true)';
    execute 'grant all privileges on all tables in schema public to crier_app';
    execute 'grant all privileges on all sequences in schema public to crier_app';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
  end if;
end $$;

-- Keep report_count on the post in sync.
create or replace function reports_count_trigger() returns trigger language plpgsql as $$
begin
  update posts set report_count = (select count(*) from reports where post_id = coalesce(new.post_id, old.post_id)) where id = coalesce(new.post_id, old.post_id);
  return null;
end $$;
drop trigger if exists reports_count on reports;
create trigger reports_count after insert or delete on reports for each row execute function reports_count_trigger();
