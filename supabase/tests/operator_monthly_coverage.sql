begin;

-- Estrutura, compatibilidade e privilégios. A massa operacional é exercitada pelo
-- harness multissessão separado e toda execução termina em rollback.
do $$ begin
  assert exists(select 1 from information_schema.columns where table_schema='public' and table_name='parking_sessions' and column_name='entry_mode');
  assert exists(select 1 from information_schema.columns where table_schema='public' and table_name='parking_sessions' and column_name='financial_obligation');
  assert not exists(
    select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typname='parking_payment_status' and e.enumlabel='NOT_REQUIRED'
  );
  assert exists(select 1 from pg_indexes where schemaname='public' and indexname='monthly_entry_authorizations_one_open_idx');
  assert exists(select 1 from pg_indexes where schemaname='public' and indexname='parking_sessions_monthly_subscription_idx');
  assert exists(select 1 from pg_indexes where schemaname='public' and indexname='parking_sessions_monthly_billing_period_idx');
  assert (select relrowsecurity from pg_class where oid='public.monthly_entry_authorizations'::regclass);
end $$;

do $$ begin
  assert not has_table_privilege('anon','public.monthly_entry_authorizations','select');
  assert not has_table_privilege('authenticated','public.monthly_entry_authorizations','insert');
  assert not has_table_privilege('authenticated','public.monthly_entry_authorizations','update');
  assert has_table_privilege('authenticated','public.monthly_entry_authorizations','select');
  assert not has_function_privilege('authenticated','private.resolve_operator_monthly_context(uuid,uuid,timestamp with time zone)','execute');
  assert has_function_privilege('authenticated','public.preview_monthly_entry(uuid,text)','execute');
  assert has_function_privilege('authenticated','public.register_parking_entry_with_coverage(uuid,text,public.vehicle_type,text,uuid)','execute');
  assert not has_function_privilege('anon','public.register_parking_entry_with_coverage(uuid,text,public.vehicle_type,text,uuid)','execute');
end $$;

-- Defaults mantêm toda sessão legada/avulsa na semântica financeira anterior.
do $$ declare mode_default text; obligation_default text; begin
  select column_default into mode_default from information_schema.columns
    where table_schema='public' and table_name='parking_sessions' and column_name='entry_mode';
  select column_default into obligation_default from information_schema.columns
    where table_schema='public' and table_name='parking_sessions' and column_name='financial_obligation';
  assert mode_default like '%CASUAL%';
  assert obligation_default like '%REQUIRED%';
end $$;

rollback;
