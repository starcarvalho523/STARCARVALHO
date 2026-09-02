do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'monthly_billing_periods'
  ) then
    alter publication supabase_realtime add table public.monthly_billing_periods;
  end if;
end
$$;
