create or replace function public.register_parking_entry_with_coverage(
  target_unit uuid,
  raw_plate text,
  target_vehicle_type public.vehicle_type,
  uncovered_action text default 'REQUIRE_DECISION'::text,
  authorization_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private', 'auth'
as $function$
declare
  actor uuid;
  normalized text := upper(regexp_replace(coalesce(raw_plate,''),'[^A-Za-z0-9]','','g'));
  v public.vehicles;
  tariff public.tariff_rules;
  c record;
  biz record;
  a public.monthly_entry_authorizations;
  new_id uuid;
  mode text := 'CASUAL';
  obligation text := 'REQUIRED';
  snapshot jsonb;
  business_snapshot jsonb;
  now_at timestamptz := clock_timestamp();
begin
  actor := private.require_operator(target_unit);

  -- Keep a deterministic record shape even when the monthly path does not query B2B.
  select null::uuid as contract_id, null::text as reason, false as covered into biz;

  if normalized !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'INVALID_PLATE' using errcode='22023'; end if;
  if uncovered_action not in ('REQUIRE_DECISION','CASUAL','USE_AUTHORIZATION') then raise exception 'INVALID_ENTRY_DECISION'; end if;

  select * into tariff
  from public.tariff_rules
  where unit_id=target_unit
    and vehicle_type=target_vehicle_type
    and is_active
    and valid_from<=now_at
    and (valid_until is null or valid_until>now_at)
  order by valid_from desc
  limit 1;
  if not found then raise exception 'NO_ACTIVE_TARIFF' using errcode='P0001'; end if;

  insert into public.vehicles(plate,normalized_plate,vehicle_type)
  values(normalized,normalized,target_vehicle_type)
  on conflict(normalized_plate) do update
    set vehicle_type=excluded.vehicle_type,updated_at=now_at
  returning * into v;

  perform pg_advisory_xact_lock(hashtextextended(target_unit::text||':'||v.id::text,0));
  select * into c from private.resolve_operator_monthly_context(v.id,target_unit,now_at);
  if c.subscription_id is not null then
    perform 1 from public.monthly_subscriptions where id=c.subscription_id for update;
    if c.billing_period_id is not null then
      perform 1 from public.monthly_billing_periods where id=c.billing_period_id for update;
    end if;
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
        select * into a
        from public.monthly_entry_authorizations
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
        if not found or a.unit_id<>target_unit or a.vehicle_id<>v.id or a.subscription_id<>c.subscription_id or a.status<>'APPROVED' or a.expires_at<=now_at then
          raise exception 'MONTHLY_AUTHORIZATION_INVALID';
        end if;
        mode:='MONTHLY_EXCEPTION';
        obligation:='WAIVED_BY_MONTHLY_COVERAGE';
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
        'name',tariff.name,'version_number',tariff.version_number,'first_hour_amount',tariff.first_hour_amount,
        'additional_amount',tariff.additional_amount,'additional_fraction_minutes',tariff.additional_fraction_minutes,
        'grace_minutes',tariff.grace_minutes,'daily_cap_amount',tariff.daily_cap_amount,
        'daily_after_minutes',tariff.daily_after_minutes,'intermediate_cap_amount',tariff.intermediate_cap_amount,
        'intermediate_after_minutes',tariff.intermediate_after_minutes,'exit_grace_minutes',tariff.exit_grace_minutes,
        'daily_cycle_minutes',tariff.daily_cycle_minutes
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
  exception when unique_violation then
    raise exception 'ACTIVE_SESSION_EXISTS' using errcode='23505';
  end;

  if mode='MONTHLY_EXCEPTION' then
    update public.monthly_entry_authorizations
    set status='CONSUMED',consumed_at=now_at,parking_session_id=new_id,updated_at=now_at
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
end
$function$;

revoke all on function public.register_parking_entry_with_coverage(uuid,text,public.vehicle_type,text,uuid) from public, anon;
grant execute on function public.register_parking_entry_with_coverage(uuid,text,public.vehicle_type,text,uuid) to authenticated, service_role;
