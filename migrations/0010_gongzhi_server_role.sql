-- The operator creates the dedicated login separately. No credentials in SQL.
-- The development integration database already has crier_app, a non-superuser
-- without BYPASSRLS. These policies are intentionally server-role-only.
do $$
declare t text;
begin
  if exists(select 1 from pg_roles where rolname='crier_app') then
    grant usage on schema public to crier_app;
    foreach t in array array['publishers','posts','subscriptions','deliveries','rate_limits','cron_state','stats_daily','gongzhi_owners','gongzhi_needs','gongzhi_links','gongzhi_runs'] loop
      execute format('grant select,insert,update on table %I to crier_app',t);
      execute format('drop policy if exists gongzhi_server on %I',t);
      execute format('create policy gongzhi_server on %I to crier_app using (true) with check (true)',t);
    end loop;
    grant usage,select on all sequences in schema public to crier_app;
    grant execute on all functions in schema public to crier_app;
  end if;
end $$;
