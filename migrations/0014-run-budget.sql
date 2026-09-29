-- Append-only schema change; legacy runs keep a null budget, not invented cost.
alter table gongzhi_runs add column if not exists budget jsonb;
create index if not exists gongzhi_runs_recent_idx on gongzhi_runs(created_at);
create or replace function gongzhi_run_budget_immutable() returns trigger language plpgsql as $$
begin
  if old.budget is distinct from new.budget then
    if old.budget is null or new.budget is null
      or old.budget->'limits' is distinct from new.budget->'limits'
      or old.budget->'reserved_microusd' is distinct from new.budget->'reserved_microusd'
      or old.budget->'currency' is distinct from new.budget->'currency' then
      raise exception 'immutable run budget reservation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists gongzhi_run_budget_immutable on gongzhi_runs;
create trigger gongzhi_run_budget_immutable before update on gongzhi_runs
  for each row execute function gongzhi_run_budget_immutable();
