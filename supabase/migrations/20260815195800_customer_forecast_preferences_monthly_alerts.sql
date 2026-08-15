-- Customer forecast preferences and richer monthly notification milestones.

alter table public.customer_profiles
  add column if not exists tariff_alert_minutes smallint not null default 10;

alter table public.customer_profiles
  drop constraint if exists customer_profiles_tariff_alert_minutes_check;
alter table public.customer_profiles
  add constraint customer_profiles_tariff_alert_minutes_check
  check (tariff_alert_minutes in (5,10,15));

alter table public.customer_notifications
  drop constraint if exists customer_notifications_type_check;
alter table public.customer_notifications
  add constraint customer_notifications_type_check check(type in(
    'PARKING_PRICE_UPCOMING','PARKING_PRICE_UPDATED','GRACE_ENDING','GRACE_ENDED',
    'DAILY_CAP_NEAR','DAILY_CAP_REACHED','MONTHLY_PAYMENT_DUE','MONTHLY_PAYMENT_OVERDUE',
    'MONTHLY_ACTIVATED','MONTHLY_SUSPENDED','MONTHLY_VEHICLE_COVERAGE_ACTIVE','PAYMENT_CONFIRMED'
  ));

create or replace function public.set_customer_tariff_alert_minutes(target_minutes smallint)
returns smallint language plpgsql volatile security definer
set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'CUSTOMER_PREFERENCE_FORBIDDEN' using errcode='42501'; end if;
  if target_minutes not in (5,10,15) then raise exception 'INVALID_TARIFF_ALERT_MINUTES' using errcode='22023'; end if;
  update public.customer_profiles
  set tariff_alert_minutes=target_minutes,updated_at=clock_timestamp()
  where user_id=actor and is_active=true;
  if not found then raise exception 'CUSTOMER_PROFILE_NOT_FOUND' using errcode='P0002'; end if;
  return target_minutes;
end $$;

create or replace function public.refresh_customer_parking_forecast(target_session uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=auth.uid(); s public.parking_sessions; now_at timestamptz:=clock_timestamp(); mins integer;
  current_amount numeric; next_amount numeric; previous_amount numeric; grace_mins integer; fraction_mins integer;
  first_hour_amount numeric; additional_amount numeric; cap_amount numeric; cap_after integer;
  transition_at timestamptz; current_transition timestamptz; seconds_remaining integer; reason text;
  at_cap boolean:=false; in_grace boolean:=false; alert_minutes integer:=10; alert_seconds integer:=600;
begin
  if actor is null then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  select * into s from public.parking_sessions where id=target_session and customer_owner_id=actor;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  select coalesce(tariff_alert_minutes,10) into alert_minutes from public.customer_profiles where user_id=actor;
  alert_seconds:=alert_minutes*60;
  mins:=greatest(0,ceil(extract(epoch from(now_at-s.entered_at))/60)::integer);
  current_amount:=case when s.status='OPEN' then private.charge_amount(s.tariff_snapshot,s.entered_at,now_at) else coalesce(s.final_amount,s.calculated_amount,0) end;
  grace_mins:=coalesce((s.tariff_snapshot->>'grace_minutes')::integer,0);
  fraction_mins:=coalesce((s.tariff_snapshot->>'additional_fraction_minutes')::integer,60);
  first_hour_amount:=coalesce((s.tariff_snapshot->>'first_hour_amount')::numeric,0);
  additional_amount:=coalesce((s.tariff_snapshot->>'additional_amount')::numeric,0);
  cap_amount:=nullif(s.tariff_snapshot->>'daily_cap_amount','')::numeric;
  cap_after:=nullif(s.tariff_snapshot->>'daily_after_minutes','')::integer;
  in_grace:=mins<=grace_mins; at_cap:=cap_amount is not null and current_amount>=cap_amount;

  if s.status='OPEN' and s.financial_obligation='REQUIRED' and not at_cap then
    if in_grace then transition_at:=s.entered_at+(grace_mins*interval '1 minute');reason:='GRACE_END';
    elsif mins<=60 then transition_at:=s.entered_at+interval '60 minutes';reason:='ADDITIONAL_FRACTION';
    else transition_at:=s.entered_at+(60+ceil((mins-60)::numeric/fraction_mins)*fraction_mins)*interval '1 minute';reason:='ADDITIONAL_FRACTION'; end if;
    if cap_after is not null and s.entered_at+(cap_after*interval '1 minute')<transition_at then
      transition_at:=s.entered_at+(cap_after*interval '1 minute');reason:='DAILY_CAP';
    end if;
    next_amount:=private.charge_amount(s.tariff_snapshot,s.entered_at,transition_at+interval '1 second');
    if next_amount<=current_amount then transition_at:=null;next_amount:=current_amount;reason:='NO_INCREASE'; end if;
  end if;
  seconds_remaining:=case when transition_at is null then null else greatest(0,ceil(extract(epoch from(transition_at-now_at)))::integer) end;

  if s.status='OPEN' and s.financial_obligation='REQUIRED' then
    if in_grace and seconds_remaining between 1 and alert_seconds then
      perform private.create_customer_notification(actor,'GRACE_ENDING','Tolerância terminando',
        'Sua tolerância termina em aproximadamente '||alert_minutes||case when alert_minutes=1 then ' minuto.' else ' minutos.' end,
        '/cliente/estadias?session='||s.id,s.id||':GRACE_ENDING:'||alert_minutes,s.id,null);
    elsif not in_grace and grace_mins>0 then
      perform private.create_customer_notification(actor,'GRACE_ENDED','Tolerância encerrada','A cobrança da estadia passou a seguir a tarifa da unidade.',
        '/cliente/estadias?session='||s.id,s.id||':GRACE_ENDED',s.id,null);
    end if;
    if transition_at is not null and reason is distinct from 'GRACE_END' and seconds_remaining between 1 and alert_seconds then
      perform private.create_customer_notification(actor,'PARKING_PRICE_UPCOMING','Próxima atualização de tarifa',
        'Sua tarifa poderá mudar em aproximadamente '||alert_minutes||case when alert_minutes=1 then ' minuto.' else ' minutos.' end,
        '/cliente/estadias?session='||s.id,s.id||':PARKING_PRICE_UPCOMING:'||extract(epoch from transition_at)::bigint||':'||alert_minutes,s.id,null);
      if cap_amount is not null and current_amount<cap_amount and next_amount>=cap_amount then
        perform private.create_customer_notification(actor,'DAILY_CAP_NEAR','Limite da diária próximo','Você está se aproximando do valor máximo previsto para esta diária.',
          '/cliente/estadias?session='||s.id,s.id||':DAILY_CAP_NEAR:'||extract(epoch from transition_at)::bigint,s.id,null);
      end if;
    end if;
    if at_cap then perform private.create_customer_notification(actor,'DAILY_CAP_REACHED','Limite da diária atingido','Você atingiu o valor máximo previsto para esta diária.',
      '/cliente/estadias?session='||s.id,s.id||':DAILY_CAP_REACHED',s.id,null); end if;
    if not in_grace and current_amount>0 then
      if mins<=60 then current_transition:=s.entered_at+(grace_mins*interval '1 minute');
      else current_transition:=s.entered_at+(60+(ceil((mins-60)::numeric/fraction_mins)-1)*fraction_mins)*interval '1 minute'; end if;
      previous_amount:=private.charge_amount(s.tariff_snapshot,s.entered_at,current_transition-interval '1 second');
      if current_amount>previous_amount then perform private.create_customer_notification(actor,'PARKING_PRICE_UPDATED','Valor da estadia atualizado',
        'O valor estimado mudou de R$ '||replace(to_char(previous_amount,'FM999999990D00'),'.',',')||' para R$ '||replace(to_char(current_amount,'FM999999990D00'),'.',',')||'.',
        '/cliente/estadias?session='||s.id,s.id||':PARKING_PRICE_UPDATED:'||extract(epoch from current_transition)::bigint,s.id,null); end if;
    end if;
  end if;
  return jsonb_build_object(
    'sessionId',s.id,'state',s.status,'covered',s.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE',
    'enteredAt',s.entered_at,'referenceTime',now_at,'durationMinutes',mins,'tariffName',s.tariff_snapshot->>'name',
    'currentAmount',current_amount,'nextTransitionAt',transition_at,'secondsUntilNext',seconds_remaining,
    'estimatedNextAmount',next_amount,'transitionReason',reason,
    'graceRemainingSeconds',case when in_grace then greatest(0,ceil(extract(epoch from((s.entered_at+grace_mins*interval '1 minute')-now_at)))::integer) else 0 end,
    'graceMinutes',grace_mins,'firstHourAmount',first_hour_amount,'additionalAmount',additional_amount,
    'additionalFractionMinutes',fraction_mins,'dailyAfterMinutes',cap_after,
    'dailyCapAmount',cap_amount,'dailyCapReached',at_cap,'alertMinutes',alert_minutes,
    'shouldPoll',s.status='OPEN' and s.financial_obligation='REQUIRED'
  );
end $$;

create or replace function public.refresh_customer_notifications()
returns integer language plpgsql volatile security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=auth.uid(); item record; created_before integer; created_after integer; days_until integer;
begin
  if actor is null then raise exception 'CUSTOMER_NOTIFICATION_FORBIDDEN' using errcode='42501'; end if;
  select count(*) into created_before from public.customer_notifications where customer_id=actor;
  for item in select b.id,b.status,b.due_date,s.status subscription_status
    from public.monthly_billing_periods b join public.monthly_subscriptions s on s.id=b.subscription_id
    where s.customer_id=actor and b.status='PENDING'
  loop
    days_until:=item.due_date-current_date;
    if days_until<0 then
      perform private.create_customer_notification(actor,'MONTHLY_PAYMENT_OVERDUE','Mensalidade vencida','Sua mensalidade venceu e ainda aguarda pagamento.','/cliente/mensalidade',item.id||':MONTHLY_PAYMENT_OVERDUE',null,item.id);
    elsif days_until=1 then
      perform private.create_customer_notification(actor,'MONTHLY_PAYMENT_DUE','Mensalidade vence amanhã','Sua mensalidade vence amanhã.','/cliente/mensalidade',item.id||':MONTHLY_PAYMENT_DUE:1',null,item.id);
    elsif days_until=5 then
      perform private.create_customer_notification(actor,'MONTHLY_PAYMENT_DUE','Mensalidade vence em 5 dias','Sua mensalidade vence em 5 dias.','/cliente/mensalidade',item.id||':MONTHLY_PAYMENT_DUE:5',null,item.id);
    end if;
  end loop;
  select count(*) into created_after from public.customer_notifications where customer_id=actor;
  return created_after-created_before;
end $$;

create or replace function private.notify_active_monthly_vehicle(target_subscription uuid,target_vehicle uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare owner_id uuid; plate_value text; sub_status text; link_active boolean;
begin
  select s.customer_id,s.status,v.plate,
    exists(select 1 from public.monthly_subscription_vehicles mv where mv.subscription_id=s.id and mv.vehicle_id=v.id and mv.valid_from<=current_date and (mv.valid_until is null or mv.valid_until>=current_date))
  into owner_id,sub_status,plate_value,link_active
  from public.monthly_subscriptions s cross join public.vehicles v
  where s.id=target_subscription and v.id=target_vehicle;
  if owner_id is not null and sub_status='ACTIVE' and link_active then
    perform private.create_customer_notification(owner_id,'MONTHLY_VEHICLE_COVERAGE_ACTIVE','Cobertura mensal ativa',
      'A cobertura mensal está ativa para o veículo '||plate_value||'.','/cliente/mensalidade',
      target_subscription||':'||target_vehicle||':MONTHLY_VEHICLE_COVERAGE_ACTIVE',null,null);
  end if;
end $$;

create or replace function private.notify_monthly_coverage_after_status()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare item record;
begin
  if new.status='ACTIVE' and old.status is distinct from 'ACTIVE' then
    for item in select vehicle_id from public.monthly_subscription_vehicles
      where subscription_id=new.id and valid_from<=current_date and (valid_until is null or valid_until>=current_date)
    loop
      perform private.notify_active_monthly_vehicle(new.id,item.vehicle_id);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists customer_monthly_coverage_status_notification on public.monthly_subscriptions;
create trigger customer_monthly_coverage_status_notification
after update of status on public.monthly_subscriptions
for each row execute function private.notify_monthly_coverage_after_status();

create or replace function private.notify_monthly_coverage_after_vehicle_link()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
begin
  perform private.notify_active_monthly_vehicle(new.subscription_id,new.vehicle_id);
  return new;
end $$;

drop trigger if exists customer_monthly_coverage_vehicle_notification on public.monthly_subscription_vehicles;
create trigger customer_monthly_coverage_vehicle_notification
after insert or update of valid_from,valid_until on public.monthly_subscription_vehicles
for each row execute function private.notify_monthly_coverage_after_vehicle_link();

revoke all on function public.set_customer_tariff_alert_minutes(smallint) from public,anon;
grant execute on function public.set_customer_tariff_alert_minutes(smallint) to authenticated,service_role;
revoke all on function private.notify_active_monthly_vehicle(uuid,uuid),private.notify_monthly_coverage_after_status(),private.notify_monthly_coverage_after_vehicle_link() from public,anon,authenticated;
grant execute on function private.notify_active_monthly_vehicle(uuid,uuid),private.notify_monthly_coverage_after_status(),private.notify_monthly_coverage_after_vehicle_link() to service_role;
