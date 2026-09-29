-- Operator task tracking tables. Contents are private; nothing is seeded here.

create table if not exists strategy_items (
  id           text primary key,          -- short slug, e.g. 'registry-official-mcp'
  channel      text not null,             -- registries | site | content | community | packages | direct | measurement
  title        text not null,
  detail       text,                      -- what "done" means, links, exact steps
  owner        text not null check (owner in ('agent','clayton','both')),
  status       text not null default 'todo' check (status in ('todo','in_progress','blocked','done','dropped')),
  priority     integer not null default 3, -- 1 highest
  phase        integer not null default 1, -- 1 now, 2 after M0 holds, 3 after first strangers
  blocked_on   text,                      -- free text: what unblocks it
  evidence     text,                      -- URL or note proving it's done
  ref_tag      text,                      -- the ?ref= value used for links from this channel
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text not null default 'operator'
);

create table if not exists strategy_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor       text not null,              -- daily-brief | weekly-review | operator | claude-session
  item_id     text references strategy_items(id) on delete set null,
  action      text not null,              -- status_change | note | review | added | dropped
  detail      text
);
create index if not exists strategy_log_at_idx on strategy_log (at desc);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'crier_app') then
    execute 'alter table strategy_items enable row level security';
    execute 'alter table strategy_log enable row level security';
    execute 'drop policy if exists crier_app_all on strategy_items';
    execute 'create policy crier_app_all on strategy_items for all to crier_app using (true) with check (true)';
    execute 'drop policy if exists crier_app_all on strategy_log';
    execute 'create policy crier_app_all on strategy_log for all to crier_app using (true) with check (true)';
    execute 'grant all privileges on all tables in schema public to crier_app';
    execute 'grant all privileges on all sequences in schema public to crier_app';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
  end if;
end $$;

