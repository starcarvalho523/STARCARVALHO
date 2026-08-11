-- Fase 6: reconhecimento mensalista no fluxo operacional do Frentista.
-- Não cria pagamentos de valor zero e não altera os enums financeiros existentes.

alter table public.parking_sessions
  add column entry_mode text not null default 'CASUAL'
    check (entry_mode in ('CASUAL','MONTHLY','MONTHLY_GRACE','MONTHLY_EXCEPTION')),
  add column financial_obligation text not null default 'REQUIRED'
    check (financial_obligation in ('REQUIRED','WAIVED_BY_MONTHLY_COVERAGE')),
  add column monthly_subscription_id uuid references public.monthly_subscriptions(id),
  add column monthly_billing_period_id uuid references public.monthly_billing_periods(id),
  add column monthly_coverage_reason text,
  add column monthly_coverage_snapshot jsonb,
  add column theoretical_amount numeric(12,2) check (theoretical_amount is null or theoretical_amount >= 0),
  add constraint parking_sessions_monthly_context_check check (
    (entry_mode='CASUAL' and financial_obligation='REQUIRED')
    or
    (entry_mode in ('MONTHLY','MONTHLY_GRACE','MONTHLY_EXCEPTION')
      and financial_obligation='WAIVED_BY_MONTHLY_COVERAGE'
      and monthly_subscription_id is not null
      and monthly_coverage_reason is not null
      and monthly_coverage_snapshot is not null)
  );

create index parking_sessions_monthly_subscription_idx
  on public.parking_sessions(monthly_subscription_id)
  where monthly_subscription_id is not null;
create index parking_sessions_monthly_billing_period_idx
  on public.parking_sessions(monthly_billing_period_id)
  where monthly_billing_period_id is not null;
create index parking_sessions_unit_entry_mode_idx
  on public.parking_sessions(unit_id,entry_mode,entered_at desc);

create table public.monthly_entry_authorizations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id),
  vehicle_id uuid not null references public.vehicles(id),
  subscription_id uuid not null references public.monthly_subscriptions(id),
  billing_period_id uuid references public.monthly_billing_periods(id),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  request_reason text not null check (char_length(btrim(request_reason)) between 5 and 500),
  coverage_reason text not null,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','APPROVED','REJECTED','CONSUMED','EXPIRED')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  expires_at timestamptz not null default (now()+interval '30 minutes'),
  consumed_at timestamptz,
  parking_session_id uuid unique references public.parking_sessions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > requested_at),
  check (decided_by is null or decided_by <> requested_by),
  check (
    (status='REQUESTED' and decided_by is null and decided_at is null and consumed_at is null and parking_session_id is null)
    or (status='APPROVED' and decided_by is not null and decided_at is not null and consumed_at is null and parking_session_id is null)
    or (status='REJECTED' and decided_by is not null and decided_at is not null and consumed_at is null and parking_session_id is null)
    or (status='CONSUMED' and decided_by is not null and decided_at is not null and consumed_at is not null and parking_session_id is not null)
    or (status='EXPIRED' and consumed_at is null and parking_session_id is null)
  )
);

alter table public.parking_sessions
  add column monthly_entry_authorization_id uuid unique
    references public.monthly_entry_authorizations(id);

create unique index monthly_entry_authorizations_one_open_idx
  on public.monthly_entry_authorizations(unit_id,vehicle_id)
  where status in ('REQUESTED','APPROVED');
create index monthly_entry_authorizations_vehicle_idx on public.monthly_entry_authorizations(vehicle_id);
create index monthly_entry_authorizations_subscription_idx on public.monthly_entry_authorizations(subscription_id);
create index monthly_entry_authorizations_billing_idx on public.monthly_entry_authorizations(billing_period_id)
  where billing_period_id is not null;
create index monthly_entry_authorizations_requested_by_idx on public.monthly_entry_authorizations(requested_by);
create index monthly_entry_authorizations_decided_by_idx on public.monthly_entry_authorizations(decided_by)
  where decided_by is not null;
create index monthly_entry_authorizations_unit_status_idx
  on public.monthly_entry_authorizations(unit_id,status,requested_at desc);

alter table public.monthly_entry_authorizations enable row level security;
create policy monthly_entry_authorizations_read_staff
on public.monthly_entry_authorizations for select to authenticated using (
  private.has_unit_role(unit_id,array['owner','manager','operator']::public.app_role[])
);
grant select on public.monthly_entry_authorizations to authenticated;
grant all on public.monthly_entry_authorizations to service_role;

create or replace function private.resolve_operator_monthly_context(
  target_vehicle uuid,target_unit uuid,at_time timestamptz
) returns table(
  covered boolean,subscription_id uuid,plan_id uuid,billing_period_id uuid,
  subscription_status text,billing_status text,due_date date,grace_until date,
  coverage_until date,reason text
) language sql security invoker
set search_path=pg_catalog,public,private,auth as $$
  select * from public.resolve_monthly_vehicle_coverage(target_vehicle,target_unit,at_time)
$$;

revoke all on function private.resolve_operator_monthly_context(uuid,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function private.resolve_operator_monthly_context(uuid,uuid,timestamptz) to service_role;

create or replace function public.preview_monthly_entry(target_unit uuid,raw_plate text)
returns table(
  plate text,vehicle_id uuid,covered boolean,subscription_id uuid,billing_period_id uuid,
  reason text,requires_choice boolean,open_authorization_id uuid,authorization_status text
) language plpgsql stable security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; normalized text:=upper(regexp_replace(coalesce(raw_plate,''),'[^A-Za-z0-9]','','g'));
  v public.vehicles; c record; a record;
begin
  actor:=private.require_operator(target_unit);
  if normalized !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'INVALID_PLATE' using errcode='22023'; end if;
  select * into v from public.vehicles where normalized_plate=normalized;
  if not found then
    return query select normalized,null::uuid,false,null::uuid,null::uuid,'VEHICLE_NOT_REGISTERED',false,null::uuid,null::text;
    return;
  end if;
  select * into c from private.resolve_operator_monthly_context(v.id,target_unit,clock_timestamp());
  select ma.id,ma.status into a from public.monthly_entry_authorizations ma
    where ma.unit_id=target_unit and ma.vehicle_id=v.id and ma.status in ('REQUESTED','APPROVED')
    order by ma.requested_at desc limit 1;
  return query select normalized,v.id,c.covered,c.subscription_id,c.billing_period_id,c.reason,
    (not c.covered and c.subscription_id is not null),a.id,a.status;
end $$;

create or replace function public.request_monthly_entry_authorization(
  target_unit uuid,raw_plate text,reason_text text
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; normalized text:=upper(regexp_replace(coalesce(raw_plate,''),'[^A-Za-z0-9]','','g'));
  v public.vehicles; c record; new_id uuid;
begin
  actor:=private.require_operator(target_unit);
  if char_length(btrim(coalesce(reason_text,'')))<5 then raise exception 'AUTHORIZATION_REASON_REQUIRED'; end if;
  select * into v from public.vehicles where normalized_plate=normalized for update;
  if not found then raise exception 'MONTHLY_VEHICLE_NOT_FOUND' using errcode='P0002'; end if;
  select * into c from private.resolve_operator_monthly_context(v.id,target_unit,clock_timestamp());
  if c.covered or c.subscription_id is null then raise exception 'MONTHLY_AUTHORIZATION_NOT_APPLICABLE'; end if;
  update public.monthly_entry_authorizations set status='EXPIRED',updated_at=clock_timestamp()
    where unit_id=target_unit and vehicle_id=v.id and status in ('REQUESTED','APPROVED') and expires_at<=clock_timestamp();
  begin
    insert into public.monthly_entry_authorizations(
      unit_id,vehicle_id,subscription_id,billing_period_id,requested_by,request_reason,coverage_reason
    ) values(target_unit,v.id,c.subscription_id,c.billing_period_id,actor,btrim(reason_text),c.reason)
    returning id into new_id;
  exception when unique_violation then raise exception 'MONTHLY_AUTHORIZATION_ALREADY_OPEN' using errcode='23505'; end;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'monthly.entry.authorization_requested',jsonb_build_object(
    'authorization_id',new_id,'vehicle_id',v.id,'subscription_id',c.subscription_id,'coverage_reason',c.reason));
  return new_id;
end $$;

create or replace function public.decide_monthly_entry_authorization(
  authorization_id uuid,approve boolean,reason_text text
) returns text language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=auth.uid(); a public.monthly_entry_authorizations; next_status text;
begin
  select * into a from public.monthly_entry_authorizations where id=authorization_id for update;
  if not found then raise exception 'MONTHLY_AUTHORIZATION_NOT_FOUND' using errcode='P0002'; end if;
  if actor is null or not private.has_unit_role(a.unit_id,array['owner','manager']::public.app_role[]) then
    raise exception 'MONTHLY_AUTHORIZATION_DECISION_FORBIDDEN' using errcode='42501';
  end if;
  if actor=a.requested_by then raise exception 'MONTHLY_AUTHORIZATION_SELF_APPROVAL_FORBIDDEN' using errcode='42501'; end if;
  if a.status<>'REQUESTED' then raise exception 'MONTHLY_AUTHORIZATION_INVALID_STATE'; end if;
  if a.expires_at<=clock_timestamp() then
    update public.monthly_entry_authorizations set status='EXPIRED',updated_at=clock_timestamp() where id=a.id;
    insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
    values(actor,a.unit_id,'monthly.entry.authorization_expired',jsonb_build_object('authorization_id',a.id,'vehicle_id',a.vehicle_id));
    return 'EXPIRED';
  end if;
  if char_length(btrim(coalesce(reason_text,'')))<5 then raise exception 'AUTHORIZATION_REASON_REQUIRED'; end if;
  next_status:=case when approve then 'APPROVED' else 'REJECTED' end;
  update public.monthly_entry_authorizations set status=next_status,decided_by=actor,
    decided_at=clock_timestamp(),decision_reason=btrim(reason_text),updated_at=clock_timestamp() where id=a.id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,a.unit_id,'monthly.entry.authorization_decided',jsonb_build_object(
    'authorization_id',a.id,'decision',next_status,'vehicle_id',a.vehicle_id));
  return next_status;
end $$;

create or replace function public.register_parking_entry_with_coverage(
  target_unit uuid,raw_plate text,target_vehicle_type public.vehicle_type,
  uncovered_action text default 'REQUIRE_DECISION',authorization_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; normalized text:=upper(regexp_replace(coalesce(raw_plate,''),'[^A-Za-z0-9]','','g'));
  v public.vehicles; tariff public.tariff_rules; c record; a public.monthly_entry_authorizations;
  new_id uuid; mode text:='CASUAL'; obligation text:='REQUIRED'; snapshot jsonb; now_at timestamptz:=clock_timestamp();
begin
  actor:=private.require_operator(target_unit);
  if normalized !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'INVALID_PLATE' using errcode='22023'; end if;
  if uncovered_action not in ('REQUIRE_DECISION','CASUAL','USE_AUTHORIZATION') then raise exception 'INVALID_ENTRY_DECISION'; end if;
  select * into tariff from public.tariff_rules where unit_id=target_unit and vehicle_type=target_vehicle_type
    and is_active and valid_from<=now_at and (valid_until is null or valid_until>now_at)
    order by valid_from desc limit 1;
  if not found then raise exception 'NO_ACTIVE_TARIFF' using errcode='P0001'; end if;
  insert into public.vehicles(plate,normalized_plate,vehicle_type) values(normalized,normalized,target_vehicle_type)
    on conflict(normalized_plate) do update set vehicle_type=excluded.vehicle_type,updated_at=now_at returning * into v;
  perform pg_advisory_xact_lock(hashtextextended(target_unit::text||':'||v.id::text,0));
  select * into c from private.resolve_operator_monthly_context(v.id,target_unit,now_at);
  if c.subscription_id is not null then
    perform 1 from public.monthly_subscriptions where id=c.subscription_id for update;
    if c.billing_period_id is not null then perform 1 from public.monthly_billing_periods where id=c.billing_period_id for update; end if;
    select * into c from private.resolve_operator_monthly_context(v.id,target_unit,now_at);
  end if;
  if c.covered then
    mode:=case when c.reason='ACTIVE_WITHIN_GRACE' then 'MONTHLY_GRACE' else 'MONTHLY' end;
    obligation:='WAIVED_BY_MONTHLY_COVERAGE';
  elsif c.subscription_id is not null then
    if uncovered_action='REQUIRE_DECISION' then
      select * into a from public.monthly_entry_authorizations
      where unit_id=target_unit and vehicle_id=v.id and subscription_id=c.subscription_id
        and status='APPROVED' and expires_at>now_at
      order by decided_at desc limit 1 for update;
      if found then uncovered_action:='USE_AUTHORIZATION';
      else raise exception 'MONTHLY_ENTRY_DECISION_REQUIRED:%',c.reason;
      end if;
    end if;
    if uncovered_action='USE_AUTHORIZATION' then
      if a.id is null then
        select * into a from public.monthly_entry_authorizations where id=authorization_id for update;
      end if;
      if not found or a.unit_id<>target_unit or a.vehicle_id<>v.id or a.subscription_id<>c.subscription_id
        or a.status<>'APPROVED' or a.expires_at<=now_at then raise exception 'MONTHLY_AUTHORIZATION_INVALID'; end if;
      mode:='MONTHLY_EXCEPTION'; obligation:='WAIVED_BY_MONTHLY_COVERAGE';
    end if;
  end if;
  snapshot:=case when c.subscription_id is null then null else jsonb_build_object(
    'decided_at',now_at,'covered',c.covered,'reason',c.reason,'subscription_id',c.subscription_id,
    'plan_id',c.plan_id,'billing_period_id',c.billing_period_id,'subscription_status',c.subscription_status,
    'billing_status',c.billing_status,'due_date',c.due_date,'grace_until',c.grace_until,
    'coverage_until',c.coverage_until,'operator_choice',uncovered_action,
    'plan_name',(select s.plan_name from public.monthly_subscriptions s where s.id=c.subscription_id),
    'contracted_price',(select s.contracted_price from public.monthly_subscriptions s where s.id=c.subscription_id),
    'customer_id',(select s.customer_id from public.monthly_subscriptions s where s.id=c.subscription_id))
  end;
  begin
    insert into public.parking_sessions(
      unit_id,vehicle_id,plate_snapshot,vehicle_type,entry_operator_id,tariff_rule_id,tariff_snapshot,
      entry_mode,financial_obligation,monthly_subscription_id,monthly_billing_period_id,
      monthly_coverage_reason,monthly_coverage_snapshot,monthly_entry_authorization_id
    ) values(
      target_unit,v.id,normalized,target_vehicle_type,actor,tariff.id,
      jsonb_build_object('name',tariff.name,'first_hour_amount',tariff.first_hour_amount,
        'additional_amount',tariff.additional_amount,'additional_fraction_minutes',tariff.additional_fraction_minutes,
        'grace_minutes',tariff.grace_minutes,'daily_cap_amount',tariff.daily_cap_amount),
      mode,obligation,c.subscription_id,c.billing_period_id,c.reason,snapshot,
      case when mode='MONTHLY_EXCEPTION' then a.id else null end
    ) returning id into new_id;
  exception when unique_violation then raise exception 'ACTIVE_SESSION_EXISTS' using errcode='23505'; end;
  if mode='MONTHLY_EXCEPTION' then
    update public.monthly_entry_authorizations set status='CONSUMED',consumed_at=now_at,
      parking_session_id=new_id,updated_at=now_at where id=a.id and status='APPROVED';
    if not found then raise exception 'MONTHLY_AUTHORIZATION_ALREADY_CONSUMED'; end if;
  end if;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'parking.entry.created',jsonb_build_object(
    'session_id',new_id,'plate',normalized,'entry_mode',mode,'financial_obligation',obligation,
    'coverage_reason',c.reason,'subscription_id',c.subscription_id,'billing_period_id',c.billing_period_id,
    'authorization_id',case when mode='MONTHLY_EXCEPTION' then a.id else null end));
  return jsonb_build_object('session_id',new_id,'entry_mode',mode,'coverage_reason',c.reason,
    'financial_obligation',obligation);
end $$;

create or replace function public.start_parking_exit(session_id uuid) returns numeric
language plpgsql security definer set search_path=pg_catalog,public,private,auth as $$
declare s public.parking_sessions; actor uuid; amount numeric; now_at timestamptz:=clock_timestamp();
begin
  select * into s from public.parking_sessions where id=session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.require_operator(s.unit_id);
  if s.status in ('PAYMENT_PENDING','PAID') then return coalesce(s.final_amount,0); end if;
  if s.status<>'OPEN' then raise exception 'INVALID_SESSION_STATE'; end if;
  amount:=private.charge_amount(s.tariff_snapshot,s.entered_at,now_at);
  if s.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE' then
    update public.parking_sessions set status='PAID',exit_requested_at=now_at,calculated_amount=0,
      theoretical_amount=amount,final_amount=0,updated_at=now_at where id=s.id;
    insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
    values(actor,s.unit_id,'parking.exit.monthly_cleared',jsonb_build_object(
      'session_id',s.id,'entry_mode',s.entry_mode,'amount_due',0,'theoretical_amount',amount));
    return 0;
  end if;
  update public.parking_sessions set status='PAYMENT_PENDING',exit_requested_at=now_at,
    calculated_amount=amount,final_amount=amount,updated_at=now_at where id=s.id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,s.unit_id,'parking.exit.started',jsonb_build_object('session_id',s.id,'amount',amount));
  return amount;
end $$;

create or replace function public.complete_parking_exit(session_id uuid) returns timestamptz
language plpgsql security definer set search_path=pg_catalog,public,private,auth as $$
declare s public.parking_sessions; actor uuid; completed timestamptz;
begin
  select * into s from public.parking_sessions where id=session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.require_operator(s.unit_id);
  if s.status='EXITED' then return s.exited_at; end if;
  if s.status<>'PAID' then raise exception 'PAYMENT_REQUIRED'; end if;
  if s.financial_obligation='REQUIRED' and s.payment_status<>'PAID' then raise exception 'PAYMENT_REQUIRED'; end if;
  if s.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE' and (s.final_amount<>0 or s.exit_requested_at is null) then
    raise exception 'MONTHLY_EXIT_NOT_CLEARED';
  end if;
  completed:=clock_timestamp();
  update public.parking_sessions set status='EXITED',exited_at=completed,exit_operator_id=actor,
    updated_at=completed where id=s.id and status='PAID';
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,s.unit_id,'parking.exit.completed',jsonb_build_object(
    'session_id',s.id,'entry_mode',s.entry_mode,'financial_obligation',s.financial_obligation));
  return completed;
end $$;

create or replace function public.operator_dashboard_summary(target_unit uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=private.require_operator(target_unit);result jsonb;
begin
  select jsonb_build_object(
    'unit',jsonb_build_object('id',u.id,'name',u.name,'slug',u.slug,'capacity',u.capacity,'timezone',u.timezone),
    'vehicles_in_yard',(select count(*) from public.parking_sessions s where s.unit_id=u.id and s.status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW')),
    'available_spaces',greatest(0,u.capacity-(select count(*) from public.parking_sessions s where s.unit_id=u.id and s.status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW'))),
    'entries_today',(select count(*) from public.parking_sessions s where s.unit_id=u.id and (s.entered_at at time zone u.timezone)::date=(clock_timestamp() at time zone u.timezone)::date),
    'exits_today',(select count(*) from public.parking_sessions s where s.unit_id=u.id and s.exited_at is not null and (s.exited_at at time zone u.timezone)::date=(clock_timestamp() at time zone u.timezone)::date),
    'active_sessions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'plate',s.plate_snapshot,'vehicle_type',s.vehicle_type,'status',s.status,'entered_at',s.entered_at,
      'duration_minutes',greatest(0,ceil(extract(epoch from(clock_timestamp()-s.entered_at))/60)::integer),
      'amount',case when s.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE' then 0 when s.status='OPEN' then private.charge_amount(s.tariff_snapshot,s.entered_at,clock_timestamp()) else s.final_amount end,
      'payment_status',s.payment_status,'tariff_name',s.tariff_snapshot->>'name','entry_mode',s.entry_mode,
      'financial_obligation',s.financial_obligation,'coverage_reason',s.monthly_coverage_reason,
      'theoretical_amount',case when s.status='OPEN' then private.charge_amount(s.tariff_snapshot,s.entered_at,clock_timestamp()) else s.theoretical_amount end
    ) order by s.entered_at desc) from (select * from public.parking_sessions where unit_id=u.id and status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW') order by entered_at desc limit 20)s),'[]'::jsonb),
    'open_shift',(select jsonb_build_object('id',cs.id,'opened_at',cs.opened_at,'opening_amount',cs.opening_amount,'cash_total',coalesce(sum(p.amount)filter(where p.method='CASH' and p.status='PAID'),0),'card_total',coalesce(sum(p.amount)filter(where p.method='CARD' and p.status='PAID'),0),'pix_total',coalesce(sum(p.amount)filter(where p.method='PIX' and p.status='PAID'),0),'payment_count',count(p.id)filter(where p.status='PAID')) from public.cash_shifts cs left join public.payments p on p.cash_shift_id=cs.id where cs.unit_id=u.id and cs.operator_id=actor and cs.status='OPEN' group by cs.id),
    'has_active_car_tariff',exists(select 1 from public.tariff_rules t where t.unit_id=u.id and t.vehicle_type='CAR' and t.is_active and t.valid_from<=clock_timestamp() and(t.valid_until is null or t.valid_until>clock_timestamp())),
    'has_active_motorcycle_tariff',exists(select 1 from public.tariff_rules t where t.unit_id=u.id and t.vehicle_type='MOTORCYCLE' and t.is_active and t.valid_from<=clock_timestamp() and(t.valid_until is null or t.valid_until>clock_timestamp()))
  )into result from public.parking_units u where u.id=target_unit and u.is_active;
  if result is null then raise exception 'UNIT_NOT_FOUND';end if;return result;
end $$;

revoke all on function public.preview_monthly_entry(uuid,text) from public,anon;
revoke all on function public.request_monthly_entry_authorization(uuid,text,text) from public,anon;
revoke all on function public.decide_monthly_entry_authorization(uuid,boolean,text) from public,anon;
revoke all on function public.register_parking_entry_with_coverage(uuid,text,public.vehicle_type,text,uuid) from public,anon;
grant execute on function public.preview_monthly_entry(uuid,text) to authenticated,service_role;
grant execute on function public.request_monthly_entry_authorization(uuid,text,text) to authenticated,service_role;
grant execute on function public.decide_monthly_entry_authorization(uuid,boolean,text) to authenticated,service_role;
grant execute on function public.register_parking_entry_with_coverage(uuid,text,public.vehicle_type,text,uuid) to authenticated,service_role;

comment on column public.parking_sessions.financial_obligation is
  'Indica se existe obrigação de pagamento da estadia; não representa o estado de um pagamento.';
comment on column public.parking_sessions.theoretical_amount is
  'Valor avulso teórico calculado pelo motor oficial; não compõe receita, caixa ou payments.';
