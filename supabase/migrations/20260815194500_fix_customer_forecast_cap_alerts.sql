-- Forecast hardening: notify when the next official tariff amount reaches the daily cap,
-- regardless of whether the transition was caused by a fraction boundary or daily_after_minutes.

create or replace function public.refresh_customer_parking_forecast(target_session uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=auth.uid(); s public.parking_sessions; now_at timestamptz:=clock_timestamp(); mins integer;
  current_amount numeric; next_amount numeric; previous_amount numeric; grace_mins integer; fraction_mins integer;
  cap_amount numeric; cap_after integer; transition_at timestamptz; current_transition timestamptz;
  seconds_remaining integer; reason text; at_cap boolean:=false; in_grace boolean:=false;
begin
  if actor is null then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  select * into s from public.parking_sessions where id=target_session and customer_owner_id=actor;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  mins:=greatest(0,ceil(extract(epoch from(now_at-s.entered_at))/60)::integer);
  current_amount:=case when s.status='OPEN' then private.charge_amount(s.tariff_snapshot,s.entered_at,now_at) else coalesce(s.final_amount,s.calculated_amount,0) end;
  grace_mins:=coalesce((s.tariff_snapshot->>'grace_minutes')::integer,0);
  fraction_mins:=coalesce((s.tariff_snapshot->>'additional_fraction_minutes')::integer,60);
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
    if in_grace and seconds_remaining between 1 and 600 then
      perform private.create_customer_notification(actor,'GRACE_ENDING','Tolerância terminando',
        case when seconds_remaining<=300 then 'Sua tolerância termina em aproximadamente 5 minutos.' else 'Sua tolerância termina em aproximadamente 10 minutos.' end,
        '/cliente/estadias?session='||s.id,s.id||':GRACE_ENDING:'||case when seconds_remaining<=300 then '5' else '10' end,s.id,null);
    elsif not in_grace and grace_mins>0 then
      perform private.create_customer_notification(actor,'GRACE_ENDED','Tolerância encerrada','A cobrança da estadia passou a seguir a tarifa da unidade.',
        '/cliente/estadias?session='||s.id,s.id||':GRACE_ENDED',s.id,null);
    end if;
    if transition_at is not null and seconds_remaining between 1 and 600 then
      perform private.create_customer_notification(actor,'PARKING_PRICE_UPCOMING','Próxima atualização de tarifa',
        case when seconds_remaining<=300 then 'Sua tarifa poderá mudar em aproximadamente 5 minutos.' else 'Sua tarifa poderá mudar em aproximadamente 10 minutos.' end,
        '/cliente/estadias?session='||s.id,s.id||':PARKING_PRICE_UPCOMING:'||extract(epoch from transition_at)::bigint||':'||case when seconds_remaining<=300 then '5' else '10' end,s.id,null);
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
  return jsonb_build_object('sessionId',s.id,'state',s.status,'covered',s.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE',
    'enteredAt',s.entered_at,'referenceTime',now_at,'durationMinutes',mins,'tariffName',s.tariff_snapshot->>'name',
    'currentAmount',current_amount,'nextTransitionAt',transition_at,'secondsUntilNext',seconds_remaining,
    'estimatedNextAmount',next_amount,'transitionReason',reason,'graceRemainingSeconds',case when in_grace then greatest(0,ceil(extract(epoch from((s.entered_at+grace_mins*interval '1 minute')-now_at)))::integer) else 0 end,
    'dailyCapAmount',cap_amount,'dailyCapReached',at_cap,'shouldPoll',s.status='OPEN' and s.financial_obligation='REQUIRED');
end $$;

revoke all on function public.refresh_customer_parking_forecast(uuid) from public,anon;
grant execute on function public.refresh_customer_parking_forecast(uuid) to authenticated,service_role;
