begin;

-- ACTIVE_PAID: snapshot imutável, zero devido, sem payment e saída física separada.
update public.monthly_billing_periods set status='PAID',paid_at=now()
where id='68000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select public.register_parking_entry_with_coverage('62000000-0000-0000-0000-000000000001','PAG1A11','CAR');
reset role;
do $$ declare s public.parking_sessions; begin
  select * into s from public.parking_sessions where plate_snapshot='PAG1A11';
  assert s.entry_mode='MONTHLY';
  assert s.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE';
  assert s.monthly_coverage_reason='ACTIVE_PAID';
  assert s.monthly_coverage_snapshot->>'subscription_id'='66000000-0000-0000-0000-000000000001';
  assert s.monthly_coverage_snapshot ? 'plan_name';
  assert s.monthly_coverage_snapshot ? 'contracted_price';
end $$;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select public.start_parking_exit((select id from public.parking_sessions where plate_snapshot='PAG1A11'));
reset role;
do $$ declare s public.parking_sessions; begin
  select * into s from public.parking_sessions where plate_snapshot='PAG1A11';
  assert s.status='PAID' and s.final_amount=0 and s.theoretical_amount is not null;
  assert s.exited_at is null;
  assert not exists(select 1 from public.payments where parking_session_id=s.id);
end $$;
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select public.complete_parking_exit((select id from public.parking_sessions where plate_snapshot='PAG1A11'));
reset role;
do $$ begin assert (select status='EXITED' and exited_at is not null from public.parking_sessions where plate_snapshot='PAG1A11'); end $$;

-- ACTIVE_WITHIN_GRACE.
update public.monthly_billing_periods set status='PENDING',paid_at=null,due_date=current_date-1,grace_until=current_date+1
where id='68000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select public.register_parking_entry_with_coverage('62000000-0000-0000-0000-000000000001','GRA1A11','CAR');
reset role;
do $$ begin assert (select entry_mode='MONTHLY_GRACE' and monthly_coverage_reason='ACTIVE_WITHIN_GRACE' from public.parking_sessions where plate_snapshot='GRA1A11'); end $$;

-- Vencido pode ser explicitamente avulso e preserva o contexto sem alterar assinatura.
update public.monthly_billing_periods set due_date=current_date-5,grace_until=current_date-1
where id='68000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);
set local role authenticated;
do $$ begin
  begin perform public.register_parking_entry_with_coverage('62000000-0000-0000-0000-000000000001','AUT1A11','CAR'); raise exception 'expected decision';
  exception when others then assert sqlerrm like 'MONTHLY_ENTRY_DECISION_REQUIRED:%'; end;
end $$;
select public.register_parking_entry_with_coverage('62000000-0000-0000-0000-000000000001','AUT1A11','CAR','CASUAL',null);
reset role;
do $$ declare s public.parking_sessions; begin
  select * into s from public.parking_sessions where plate_snapshot='AUT1A11';
  assert s.entry_mode='CASUAL' and s.financial_obligation='REQUIRED';
  assert s.monthly_subscription_id='66000000-0000-0000-0000-000000000001';
  assert s.monthly_coverage_reason='OVERDUE_OUTSIDE_GRACE';
  assert s.monthly_coverage_snapshot->>'operator_choice'='CASUAL';
  assert (select status='ACTIVE' from public.monthly_subscriptions where id=s.monthly_subscription_id);
end $$;

-- Suspenso, cancelado, sem competência e sem assinatura nunca ganham cobertura.
update public.monthly_subscriptions set status='SUSPENDED' where id='66000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);set local role authenticated;
do $$ begin assert (select reason='SUBSCRIPTION_SUSPENDED' and not covered from public.resolve_monthly_vehicle_coverage('64000000-0000-0000-0000-000000000005','62000000-0000-0000-0000-000000000001',now())); end $$;reset role;
update public.monthly_subscriptions set status='CANCELED' where id='66000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);set local role authenticated;
do $$ begin assert (select reason='SUBSCRIPTION_CANCELED' and not covered from public.resolve_monthly_vehicle_coverage('64000000-0000-0000-0000-000000000006','62000000-0000-0000-0000-000000000001',now())); end $$;reset role;
update public.monthly_subscriptions set status='ACTIVE' where id='66000000-0000-0000-0000-000000000001';
update public.monthly_billing_periods set reference_month=9,period_start='2026-09-01',period_end='2026-09-30',
  due_date='2026-09-10',grace_until='2026-09-15'
where id='68000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','61000000-0000-0000-0000-000000000003',true);set local role authenticated;
do $$ begin
  assert (select reason='NO_BILLING_PERIOD' and not covered from public.resolve_monthly_vehicle_coverage('64000000-0000-0000-0000-000000000007','62000000-0000-0000-0000-000000000001',now()));
  assert (select reason='VEHICLE_NOT_COVERED' and not covered from public.resolve_monthly_vehicle_coverage('64000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001',now()));
end $$;reset role;

-- Cliente/anon sem superfície operacional; escrita direta authenticated bloqueada.
do $$ begin
  assert not has_function_privilege('anon','public.preview_monthly_entry(uuid,text)','execute');
  assert not has_table_privilege('authenticated','public.monthly_entry_authorizations','insert');
end $$;

rollback;
