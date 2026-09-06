-- Operação Comercial 2.0 — cobertura operacional B2B

alter table public.parking_sessions
  add column if not exists business_contract_id uuid references public.business_parking_contracts(id),
  add column if not exists business_coverage_reason text,
  add column if not exists business_coverage_snapshot jsonb;

alter table public.parking_sessions drop constraint if exists parking_sessions_entry_mode_check;
alter table public.parking_sessions add constraint parking_sessions_entry_mode_check
  check(entry_mode in ('CASUAL','MONTHLY','MONTHLY_GRACE','MONTHLY_EXCEPTION','BUSINESS'));

alter table public.parking_sessions drop constraint if exists parking_sessions_financial_obligation_check;
alter table public.parking_sessions add constraint parking_sessions_financial_obligation_check
  check(financial_obligation in ('REQUIRED','WAIVED_BY_MONTHLY_COVERAGE','WAIVED_BY_BUSINESS_CONTRACT'));

alter table public.parking_sessions drop constraint if exists parking_sessions_monthly_context_check;
alter table public.parking_sessions add constraint parking_sessions_monthly_context_check check(
  (entry_mode='CASUAL' and financial_obligation='REQUIRED' and business_contract_id is null)
  or
  (entry_mode in ('MONTHLY','MONTHLY_GRACE','MONTHLY_EXCEPTION')
    and financial_obligation='WAIVED_BY_MONTHLY_COVERAGE'
    and monthly_subscription_id is not null
    and monthly_coverage_reason is not null
    and monthly_coverage_snapshot is not null
    and business_contract_id is null)
  or
  (entry_mode='BUSINESS'
    and financial_obligation='WAIVED_BY_BUSINESS_CONTRACT'
    and business_contract_id is not null
    and business_coverage_reason is not null
    and business_coverage_snapshot is not null)
);

create index if not exists parking_sessions_business_open_idx
  on public.parking_sessions(business_contract_id,status,entered_at desc)
  where business_contract_id is not null;

create or replace function public.attach_business_contract_vehicle(
  target_contract uuid,target_vehicle uuid,target_valid_from date default current_date
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; c public.business_parking_contracts; link_id uuid; active_count integer;
begin
  select * into c from public.business_parking_contracts where id=target_contract for update;
  if not found then raise exception 'BUSINESS_CONTRACT_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.monthly_assert_admin(c.unit_id);
  if c.status not in ('DRAFT','ACTIVE') then raise exception 'BUSINESS_CONTRACT_NOT_ACTIVE' using errcode='22023'; end if;
  if not exists(select 1 from public.vehicles where id=target_vehicle) then raise exception 'VEHICLE_NOT_FOUND' using errcode='P0002'; end if;

  select count(*) into active_count
  from public.business_contract_vehicles v
  where v.contract_id=c.id and(v.valid_until is null or v.valid_until>=target_valid_from);
  if active_count>=c.max_registered_vehicles
    and not exists(select 1 from public.business_contract_vehicles v where v.contract_id=c.id and v.vehicle_id=target_vehicle)
  then raise exception 'BUSINESS_MAX_VEHICLES_REACHED' using errcode='22023'; end if;

  insert into public.business_contract_vehicles(contract_id,vehicle_id,valid_from,valid_until)
  values(c.id,target_vehicle,target_valid_from,null)
  on conflict(contract_id,vehicle_id) do update set valid_from=least(public.business_contract_vehicles.valid_from,excluded.valid_from),valid_until=null
  returning id into link_id;

  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,c.unit_id,'business.vehicle.attached',jsonb_build_object('contract_id',c.id,'vehicle_id',target_vehicle,'link_id',link_id));
  return link_id;
end $$;

create or replace function public.detach_business_contract_vehicle(
  target_link uuid,target_valid_until date default current_date
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; link public.business_contract_vehicles; c public.business_parking_contracts;
begin
  select * into link from public.business_contract_vehicles where id=target_link for update;
  if not found then raise exception 'BUSINESS_VEHICLE_LINK_NOT_FOUND' using errcode='P0002'; end if;
  select * into c from public.business_parking_contracts where id=link.contract_id;
  actor:=private.monthly_assert_admin(c.unit_id);
  if target_valid_until<link.valid_from then raise exception 'INVALID_BUSINESS_VALID_UNTIL' using errcode='22023'; end if;
  update public.business_contract_vehicles set valid_until=target_valid_until where id=link.id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,c.unit_id,'business.vehicle.detached',jsonb_build_object('contract_id',c.id,'vehicle_id',link.vehicle_id,'link_id',link.id));
  return link.id;
end $$;

revoke all on function public.attach_business_contract_vehicle(uuid,uuid,date) from public,anon;
revoke all on function public.detach_business_contract_vehicle(uuid,date) from public,anon;
grant execute on function public.attach_business_contract_vehicle(uuid,uuid,date) to authenticated;
grant execute on function public.detach_business_contract_vehicle(uuid,date) to authenticated;

create or replace function private.resolve_business_vehicle_context(
  target_vehicle uuid,target_unit uuid,at_time timestamptz
) returns table(covered boolean,contract_id uuid,reason text,max_simultaneous integer,guaranteed_spaces integer)
language plpgsql stable security definer
set search_path=pg_catalog,public,private as $$
declare local_day date; candidate record; current_count integer:=0;
begin
  select (at_time at time zone u.timezone)::date into local_day from public.parking_units u where u.id=target_unit;
  if local_day is null then return query select false,null::uuid,'UNIT_NOT_FOUND'::text,null::integer,null::integer; return; end if;

  select c.id,c.max_simultaneous_vehicles,c.guaranteed_spaces
  into candidate
  from public.business_contract_vehicles v
  join public.business_parking_contracts c on c.id=v.contract_id
  where v.vehicle_id=target_vehicle and c.unit_id=target_unit and c.status='ACTIVE'
    and c.starts_on<=local_day and(c.ends_on is null or c.ends_on>=local_day)
    and v.valid_from<=local_day and(v.valid_until is null or v.valid_until>=local_day)
  order by c.guaranteed_spaces desc,c.created_at asc
  limit 1;

  if not found then return query select false,null::uuid,'BUSINESS_NOT_COVERED'::text,null::integer,null::integer; return; end if;
  select count(*) into current_count from public.parking_sessions s
  where s.business_contract_id=candidate.id and s.status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW');
  if current_count>=candidate.max_simultaneous_vehicles then
    return query select false,candidate.id,'BUSINESS_SIMULTANEOUS_LIMIT_REACHED'::text,candidate.max_simultaneous_vehicles,candidate.guaranteed_spaces; return;
  end if;
  return query select true,candidate.id,'BUSINESS_ACTIVE'::text,candidate.max_simultaneous_vehicles,candidate.guaranteed_spaces;
end $$;
revoke all on function private.resolve_business_vehicle_context(uuid,uuid,timestamptz) from public,anon,authenticated;

create or replace function public.register_parking_entry_with_coverage(
  target_unit uuid,raw_plate text,target_vehicle_type public.vehicle_type,
  uncovered_action text default 'REQUIRE_DECISION',authorization_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare
  actor uuid;
  normalized text:=upper(regexp_replace(coalesce(raw_plate,''),'[^A-Za-z0-9]','','g'));
  v public.vehicles;
  tariff public.tariff_rules;
  c record;
  biz record;
  a public.monthly_entry_authorizations;
  new_id uuid;
  mode text:='CASUAL';
  obligation text:='REQUIRED';
  snapshot jsonb;
  business_snapshot jsonb;
  now_at timestamptz:=clock_timestamp();
begin
  actor:=private.require_operator(target_unit);
  if normalized!~'^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'INVALID_PLATE' using errcode='22023'; end if;
  if uncovered_action not in ('REQUIRE_DECISION','CASUAL','USE_AUTHORIZATION') then raise exception 'INVALID_ENTRY_DECISION'; end if;

  select * into tariff from public.tariff_rules
  where unit_id=target_unit and vehicle_type=target_vehicle_type and is_active
    and valid_from<=now_at and(valid_until is null or valid_until>now_at)
  order by valid_from desc limit 1;
  if not found then raise exception 'NO_ACTIVE_TARIFF' using errcode='P0001'; end if;

  insert into public.vehicles(plate,normalized_plate,vehicle_type)
  values(normalized,normalized,target_vehicle_type)
  on conflict(normalized_plate) do update set vehicle_type=excluded.vehicle_type,updated_at=now_at
  returning * into v;

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
  else
    select * into biz from private.resolve_business_vehicle_context(v.id,target_unit,now_at);
    if biz.covered then
      mode:='BUSINESS';
      obligation:='WAIVED_BY_BUSINESS_CONTRACT';
      business_snapshot:=jsonb_build_object(
        'decided_at',now_at,'covered',true,'reason',biz.reason,'contract_id',biz.contract_id,
        'max_simultaneous',biz.max_simultaneous,'guaranteed_spaces',biz.guaranteed_spaces
      );
    elsif c.subscription_id is not null then
      if uncovered_action='REQUIRE_DECISION' then
        select * into a from public.monthly_entry_authorizations
        where unit_id=target_unit and vehicle_id=v.id and subscription_id=c.subscription_id
          and status='APPROVED' and expires_at>now_at
        order by decided_at desc limit 1 for update;
        if found then uncovered_action:='USE_AUTHORIZATION';
        else raise exception 'MONTHLY_ENTRY_DECISION_REQUIRED:%',c.reason; end if;
      end if;
      if uncovered_action='USE_AUTHORIZATION' then
        if a.id is null then select * into a from public.monthly_entry_authorizations where id=authorization_id for update; end if;
        if not found or a.unit_id<>target_unit or a.vehicle_id<>v.id or a.subscription_id<>c.subscription_id
          or a.status<>'APPROVED' or a.expires_at<=now_at then raise exception 'MONTHLY_AUTHORIZATION_INVALID'; end if;
        mode:='MONTHLY_EXCEPTION'; obligation:='WAIVED_BY_MONTHLY_COVERAGE';
      end if;
    end if;
  end if;

  snapshot:=case when c.subscription_id is null then null else jsonb_build_object(
    'decided_at',now_at,'covered',c.covered,'reason',c.reason,'subscription_id',c.subscription_id,
    'plan_id',c.plan_id,'billing_period_id',c.billing_period_id,'subscription_status',c.subscription_status,
    'billing_status',c.billing_status,'due_date',c.due_date,'grace_until',c.grace_until,
    'coverage_until',c.coverage_until,'operator_choice',uncovered_action,
    'plan_name',(select s.plan_name from public.monthly_subscriptions s where s.id=c.subscription_id),
    'contracted_price',(select s.contracted_price from public.monthly_subscriptions s where s.id=c.subscription_id),
    'customer_id',(select s.customer_id from public.monthly_subscriptions s where s.id=c.subscription_id)
  ) end;

  begin
    insert into public.parking_sessions(
      unit_id,vehicle_id,plate_snapshot,vehicle_type,entry_operator_id,tariff_rule_id,tariff_snapshot,
      entry_mode,financial_obligation,monthly_subscription_id,monthly_billing_period_id,
      monthly_coverage_reason,monthly_coverage_snapshot,monthly_entry_authorization_id,
      business_contract_id,business_coverage_reason,business_coverage_snapshot
    ) values(
      target_unit,v.id,normalized,target_vehicle_type,actor,tariff.id,
      jsonb_build_object(
        'name',tariff.name,'version_number',tariff.version_number,
        'first_hour_amount',tariff.first_hour_amount,'additional_amount',tariff.additional_amount,
        'additional_fraction_minutes',tariff.additional_fraction_minutes,'grace_minutes',tariff.grace_minutes,
        'daily_cap_amount',tariff.daily_cap_amount,'daily_after_minutes',tariff.daily_after_minutes,
        'intermediate_cap_amount',tariff.intermediate_cap_amount,'intermediate_after_minutes',tariff.intermediate_after_minutes,
        'exit_grace_minutes',tariff.exit_grace_minutes,'daily_cycle_minutes',tariff.daily_cycle_minutes
      ),
      mode,obligation,
      case when mode like 'MONTHLY%' then c.subscription_id else null end,
      case when mode like 'MONTHLY%' then c.billing_period_id else null end,
      case when mode like 'MONTHLY%' then c.reason else null end,
      case when mode like 'MONTHLY%' then snapshot else null end,
      case when mode='MONTHLY_EXCEPTION' then a.id else null end,
      case when mode='BUSINESS' then biz.contract_id else null end,
      case when mode='BUSINESS' then biz.reason else null end,
      case when mode='BUSINESS' then business_snapshot else null end
    ) returning id into new_id;
  exception when unique_violation then raise exception 'ACTIVE_SESSION_EXISTS' using errcode='23505'; end;

  if mode='MONTHLY_EXCEPTION' then
    update public.monthly_entry_authorizations set status='CONSUMED',consumed_at=now_at,parking_session_id=new_id,updated_at=now_at
    where id=a.id and status='APPROVED';
    if not found then raise exception 'MONTHLY_AUTHORIZATION_ALREADY_CONSUMED'; end if;
  end if;

  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'parking.entry.created',jsonb_build_object(
    'session_id',new_id,'plate',normalized,'entry_mode',mode,'financial_obligation',obligation,
    'coverage_reason',case when mode='BUSINESS' then biz.reason else c.reason end,
    'subscription_id',case when mode like 'MONTHLY%' then c.subscription_id else null end,
    'billing_period_id',case when mode like 'MONTHLY%' then c.billing_period_id else null end,
    'business_contract_id',case when mode='BUSINESS' then biz.contract_id else null end,
    'authorization_id',case when mode='MONTHLY_EXCEPTION' then a.id else null end
  ));

  return jsonb_build_object(
    'session_id',new_id,'entry_mode',mode,
    'coverage_reason',case when mode='BUSINESS' then biz.reason else c.reason end,
    'financial_obligation',obligation,
    'business_contract_id',case when mode='BUSINESS' then biz.contract_id else null end
  );
end $$;

create or replace function public.start_parking_exit(session_id uuid)
returns numeric language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare s public.parking_sessions; actor uuid; amount numeric; now_at timestamptz:=clock_timestamp();
begin
  select * into s from public.parking_sessions where id=session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.require_operator(s.unit_id);
  if s.status in ('PAYMENT_PENDING','PAID') then return coalesce(s.final_amount,0); end if;
  if s.status<>'OPEN' then raise exception 'INVALID_SESSION_STATE'; end if;
  amount:=private.charge_amount(s.tariff_snapshot,s.entered_at,now_at);
  if s.financial_obligation<>'REQUIRED' then
    update public.parking_sessions set status='PAID',exit_requested_at=now_at,calculated_amount=0,
      theoretical_amount=amount,final_amount=0,updated_at=now_at where id=s.id;
    insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
    values(actor,s.unit_id,'parking.exit.coverage_cleared',jsonb_build_object(
      'session_id',s.id,'entry_mode',s.entry_mode,'financial_obligation',s.financial_obligation,
      'amount_due',0,'theoretical_amount',amount,'business_contract_id',s.business_contract_id,
      'monthly_subscription_id',s.monthly_subscription_id));
    return 0;
  end if;
  update public.parking_sessions set status='PAYMENT_PENDING',exit_requested_at=now_at,
    calculated_amount=amount,final_amount=amount,updated_at=now_at where id=s.id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,s.unit_id,'parking.exit.started',jsonb_build_object('session_id',s.id,'amount',amount));
  return amount;
end $$;

create or replace function public.complete_parking_exit(session_id uuid)
returns timestamptz language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare
  s public.parking_sessions;
  actor uuid;
  completed timestamptz;
  paid_reference timestamptz;
  exit_grace integer;
begin
  select * into s from public.parking_sessions where id=session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  actor:=private.require_operator(s.unit_id);
  if s.status='EXITED' then return s.exited_at; end if;
  if s.status<>'PAID' then raise exception 'PAYMENT_REQUIRED'; end if;
  if s.financial_obligation='REQUIRED' and s.payment_status<>'PAID' then raise exception 'PAYMENT_REQUIRED'; end if;
  if s.financial_obligation<>'REQUIRED' and(s.final_amount<>0 or s.exit_requested_at is null) then raise exception 'COVERED_EXIT_NOT_CLEARED'; end if;

  completed:=clock_timestamp();
  exit_grace:=coalesce(nullif(s.tariff_snapshot->>'exit_grace_minutes','')::integer,10);
  if s.financial_obligation='REQUIRED' then
    select max(p.paid_at) into paid_reference from public.payments p where p.parking_session_id=s.id and p.status='PAID';
  else
    paid_reference:=s.exit_requested_at;
  end if;

  update public.parking_sessions set status='EXITED',exited_at=completed,exit_operator_id=actor,updated_at=completed
  where id=s.id and status='PAID';

  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,s.unit_id,'parking.exit.completed',jsonb_build_object(
    'session_id',s.id,'entry_mode',s.entry_mode,'financial_obligation',s.financial_obligation,
    'exit_grace_minutes',exit_grace,
    'after_exit_grace',paid_reference is not null and completed>paid_reference+(exit_grace*interval '1 minute')
  ));
  return completed;
end $$;
