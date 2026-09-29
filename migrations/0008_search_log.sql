-- FR-40: a de-identified record of every search, one row per day per query shape.
--
-- unmet_queries holds only the searches that found nothing, and it has been empty since launch: the
-- board answers everything with something, so it taught us nothing about what agents actually ask
-- for. This table is the other half. It is the demand evidence BR-6 requires before relay is added.
--
-- BR-17 is what makes it publishable. There is no seeker column, no address, and no timestamp finer
-- than the day, so the table cannot answer "what did this agent search for" — that question is not
-- hard to ask here, it is impossible. n counts the searches of that shape; zero counts how many of
-- them returned nothing. Rows are purged after 365 days (housekeeping, minute 7).
create table if not exists search_log (
  day        date not null,
  q          text,               -- normalized and PII-stripped, capped at 200 chars; null for a bare listing
  kind       text,
  tags       text,               -- lower-cased, comma-joined, capped at 200 chars
  near       text,               -- rounded to ~0.5 degree cells (~50 km)
  radius_km  integer,
  source     text not null,      -- rest | mcp | feed
  n          integer not null default 0,
  zero       integer not null default 0
);

-- The shape key. Every column but day and source is nullable, and null <> null would defeat a plain
-- unique constraint, so uniqueness is enforced over coalesced expressions rather than by giving the
-- columns empty-string sentinels: the rows stay honest about "this search had no kind at all", and
-- bump_search infers this index by repeating the same expressions in its on conflict clause.
create unique index if not exists search_log_shape_idx on search_log
  (day, coalesce(q, ''), coalesce(kind, ''), coalesce(tags, ''), coalesce(near, ''), coalesce(radius_km, -1), source);
create index if not exists search_log_day_idx on search_log (day);

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'crier_app') then
    execute 'alter table search_log enable row level security';
    execute 'drop policy if exists crier_app_all on search_log';
    execute 'create policy crier_app_all on search_log for all to crier_app using (true) with check (true)';
    execute 'grant all privileges on all tables in schema public to crier_app';
    execute 'grant all privileges on all sequences in schema public to crier_app';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
  end if;
end $$;

-- Add one flushed batch of searches of a single shape to today's row. Mirrors bump_counter: the
-- caller has already collapsed the shape in process, so this is one upsert per distinct shape.
create or replace function bump_search(
  p_q text, p_kind text, p_tags text, p_near text, p_radius_km integer, p_source text,
  p_n integer default 1, p_zero integer default 0
) returns void language sql as $$
  insert into search_log (day, q, kind, tags, near, radius_km, source, n, zero)
  values (current_date, p_q, p_kind, p_tags, p_near, p_radius_km, p_source, p_n, p_zero)
  on conflict (day, coalesce(q, ''), coalesce(kind, ''), coalesce(tags, ''), coalesce(near, ''), coalesce(radius_km, -1), source)
  do update set n = search_log.n + excluded.n, zero = search_log.zero + excluded.zero;
$$;
