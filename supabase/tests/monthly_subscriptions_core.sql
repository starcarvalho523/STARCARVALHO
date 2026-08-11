begin;

-- Executado após a migration em banco descartável/local. A massa é sempre revertida.
do $$
begin
  assert private.monthly_due_date(2026,2,31)=date '2026-02-28';
  assert private.monthly_due_date(2028,2,31)=date '2028-02-29';
  assert private.monthly_due_date(2026,4,31)=date '2026-04-30';
  assert private.monthly_due_date(2026,8,10)=date '2026-08-10';
end $$;

-- Massa sintética isolada; IDs reservados apenas para este rollback.
insert into auth.users(id,aud,role,email,created_at,updated_at)
values
 ('41000000-0000-0000-0000-000000000001','authenticated','authenticated','phase4-owner@example.invalid',now(),now()),
 ('41000000-0000-0000-0000-000000000002','authenticated','authenticated','phase4-customer@example.invalid',now(),now()),
 ('41000000-0000-0000-0000-000000000003','authenticated','authenticated','phase4-other@example.invalid',now(),now()),
 ('41000000-0000-0000-0000-000000000004','authenticated','authenticated','phase4-operator@example.invalid',now(),now());
insert into public.profiles(id,full_name) values
 ('41000000-0000-0000-0000-000000000001','Phase Four Owner'),
 ('41000000-0000-0000-0000-000000000003','Phase Four Other'),
 ('41000000-0000-0000-0000-000000000004','Phase Four Operator') on conflict(id) do nothing;
insert into public.customer_profiles(user_id,full_name) values
 ('41000000-0000-0000-0000-000000000002','Phase Four Customer'),
 ('41000000-0000-0000-0000-000000000003','Phase Four Other') on conflict(user_id) do nothing;
insert into public.parking_units(id,name,slug,capacity)
values('42000000-0000-0000-0000-000000000001','Phase Four Unit','phase-four-unit',20);
insert into public.user_unit_roles(user_id,unit_id,role)
values
 ('41000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','owner'),
 ('41000000-0000-0000-0000-000000000004','42000000-0000-0000-0000-000000000001','operator');
insert into public.vehicles(id,plate,normalized_plate,vehicle_type,customer_id)
values
 ('43000000-0000-0000-0000-000000000001','TST1A23','TST1A23','CAR','41000000-0000-0000-0000-000000000002'),
 ('43000000-0000-0000-0000-000000000002','TST2A34','TST2A34','CAR','41000000-0000-0000-0000-000000000003');

create temporary table phase4_ids(key text primary key,value uuid);
grant select,insert,update on phase4_ids to authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
set local role authenticated;

insert into phase4_ids values('plan',public.create_monthly_plan(
 '42000000-0000-0000-0000-000000000001','Plano Teste','Descartável',400::numeric,31::smallint,5::smallint,1::smallint));
insert into phase4_ids
select 'subscription',public.create_monthly_subscription(
 '42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002',value,date '2026-08-01')
from phase4_ids where key='plan';
insert into phase4_ids
select 'link',public.attach_monthly_vehicle(value,'43000000-0000-0000-0000-000000000001',date '2026-08-01')
from phase4_ids where key='subscription';
insert into phase4_ids
select 'period',public.generate_monthly_billing_period(value,2026,8)
from phase4_ids where key='subscription';
insert into phase4_ids
select 'period_again',public.generate_monthly_billing_period(value,2026,8)
from phase4_ids where key='subscription';

reset role;
do $$
declare s uuid:=(select value from phase4_ids where key='subscription');
begin
  assert (select value from phase4_ids where key='period')=(select value from phase4_ids where key='period_again');
  assert (select count(*) from public.monthly_billing_periods where subscription_id=s)=1;
  assert (select amount from public.monthly_billing_periods where subscription_id=s)=400;
  assert (select due_date from public.monthly_billing_periods where subscription_id=s)=date '2026-08-31';
  assert (select grace_until from public.monthly_billing_periods where subscription_id=s)=date '2026-09-05';
  assert (select count(*) from public.audit_logs where action='monthly.billing_period.created' and metadata->>'subscription_id'=s::text)=1;
end $$;

-- Rejeições não podem criar estado parcial.
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$
declare s uuid:=(select value from phase4_ids where key='subscription');
begin
  begin
    perform public.attach_monthly_vehicle(s,'43000000-0000-0000-0000-000000000002',date '2026-08-01');
    raise exception 'expected customer mismatch';
  exception when foreign_key_violation then null; end;
  begin
    perform public.attach_monthly_vehicle(s,'43000000-0000-0000-0000-000000000001',date '2026-08-01');
    raise exception 'expected duplicate active link';
  exception when check_violation or unique_violation then null; end;
end $$;
reset role;

-- Plano inválido é rejeitado e desativação não apaga contrato/competência.
do $$
begin
  begin
    insert into public.monthly_plans(unit_id,name,price,due_day_default)
    values('42000000-0000-0000-0000-000000000001','Preço Inválido',0,10);
    raise exception 'expected invalid price';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select public.set_monthly_plan_enabled(value,false) from phase4_ids where key='plan';
reset role;
do $$ begin
  assert (select enabled=false from public.monthly_plans where id=(select value from phase4_ids where key='plan'));
  assert (select count(*) from public.monthly_subscriptions)=1;
  assert (select count(*) from public.monthly_billing_periods)=1;
end $$;

-- Elegibilidade: pago, carência, atraso, suspensão e veículo sem vínculo.
update public.monthly_billing_periods set status='PAID',paid_at=now() where id=(select value from phase4_ids where key='period');
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
  assert (select reason='ACTIVE_PAID' and covered from public.resolve_monthly_vehicle_coverage(
    '43000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','2026-08-20 12:00:00+00'));
  assert (select reason='VEHICLE_NOT_COVERED' and not covered from public.resolve_monthly_vehicle_coverage(
    '43000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000001','2026-08-20 12:00:00+00'));
end $$;
reset role;
update public.monthly_billing_periods set status='PENDING',paid_at=null where id=(select value from phase4_ids where key='period');
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
  assert (select reason='ACTIVE_WITHIN_GRACE' and covered from public.resolve_monthly_vehicle_coverage(
    '43000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','2026-09-03 12:00:00+00'));
  assert (select reason='OVERDUE_OUTSIDE_GRACE' and not covered from public.resolve_monthly_vehicle_coverage(
    '43000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','2026-09-06 12:00:00+00'));
  perform public.set_monthly_subscription_status((select value from phase4_ids where key='subscription'),'SUSPENDED','Teste');
  assert (select reason='SUBSCRIPTION_SUSPENDED' and not covered from public.resolve_monthly_vehicle_coverage(
    '43000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','2026-08-20 12:00:00+00'));
  perform public.set_monthly_subscription_status((select value from phase4_ids where key='subscription'),'ACTIVE','Regularizado');
end $$;
reset role;

-- Operator possui consulta operacional, mas não pode administrar preço/contrato.
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000004',true);
set local role authenticated;
do $$ begin
  begin
    perform public.set_monthly_plan_enabled((select value from phase4_ids where key='plan'),true);
    raise exception 'expected operator denial';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_monthly_subscription_status((select value from phase4_ids where key='subscription'),'CANCELED','Não autorizado');
    raise exception 'expected operator denial';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Cliente A não enxerga recursos do Cliente B; anon não tem acesso.
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000003',true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.monthly_subscriptions)=0;
  assert (select count(*) from public.monthly_billing_periods)=0;
end $$;
reset role;

-- Cancelamento preserva todo o histórico e é terminal.
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select public.set_monthly_subscription_status(value,'CANCELED','Fim de teste',false) from phase4_ids where key='subscription';
reset role;
do $$ begin
  assert (select status='CANCELED' and canceled_at is not null from public.monthly_subscriptions where id=(select value from phase4_ids where key='subscription'));
  assert (select count(*) from public.monthly_subscription_vehicles)=1;
  assert (select count(*) from public.monthly_billing_periods)=1;
end $$;

do $$
declare s uuid:=(select value from phase4_ids where key='subscription');
begin
  assert (select count(*) from public.monthly_subscription_vehicles where subscription_id=s)=1;
end $$;

-- Segurança estrutural: tabelas privadas não possuem escrita authenticated.
do $$
begin
  assert not has_table_privilege('anon','public.monthly_plans','select');
  assert not has_table_privilege('anon','public.monthly_subscriptions','select');
  assert not has_table_privilege('authenticated','public.monthly_plans','insert');
  assert not has_table_privilege('authenticated','public.monthly_subscriptions','update');
  assert not has_function_privilege('authenticated','private.monthly_assert_admin(uuid)','execute');
  assert has_function_privilege('authenticated','public.generate_monthly_billing_period(uuid,integer,integer)','execute');
end $$;

-- Constraints essenciais e proteção de concorrência existem no PostgreSQL.
do $$
begin
  assert exists(select 1 from pg_indexes where schemaname='public' and indexname='monthly_subscriptions_one_live_customer_idx');
  assert exists(select 1 from pg_indexes where schemaname='public' and indexname='monthly_subscription_vehicles_one_active_idx');
  assert exists(
    select 1 from pg_constraint
    where conrelid='public.monthly_billing_periods'::regclass
      and contype='u'
      and pg_get_constraintdef(oid)='UNIQUE (subscription_id, reference_year, reference_month)'
  );
end $$;

rollback;

