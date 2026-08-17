create table public.customer_notifications(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(user_id) on delete cascade,
  type text not null check(type in(
    'PARKING_PRICE_UPCOMING','PARKING_PRICE_UPDATED','GRACE_ENDING','GRACE_ENDED',
    'DAILY_CAP_NEAR','DAILY_CAP_REACHED','MONTHLY_PAYMENT_DUE','MONTHLY_PAYMENT_OVERDUE',
    'MONTHLY_ACTIVATED','MONTHLY_SUSPENDED','PAYMENT_CONFIRMED')),
  title text not null check(char_length(btrim(title)) between 2 and 120),
  message text not null check(char_length(btrim(message)) between 2 and 500),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  internal_link text check(internal_link is null or internal_link ~ '^/cliente(?:/|$)'),
  dedupe_key text not null check(char_length(dedupe_key) between 3 and 250),
  parking_session_id uuid references public.parking_sessions(id) on delete cascade,
  monthly_billing_period_id uuid references public.monthly_billing_periods(id) on delete cascade,
  unique(customer_id,dedupe_key),
  check(num_nonnulls(parking_session_id,monthly_billing_period_id)<=1)
);
create index customer_notifications_customer_created_idx on public.customer_notifications(customer_id,created_at desc);
create index customer_notifications_unread_idx on public.customer_notifications(customer_id,created_at desc) where read_at is null;
create index customer_notifications_session_idx on public.customer_notifications(parking_session_id) where parking_session_id is not null;

alter table public.customer_notifications enable row level security;
create policy customer_notifications_read_own on public.customer_notifications
for select to authenticated using(customer_id=(select auth.uid()));
revoke all on public.customer_notifications from public,anon,authenticated;
grant select on public.customer_notifications to authenticated;
grant all on public.customer_notifications to service_role;

create or replace function private.create_customer_notification(
  target_customer uuid,target_type text,target_title text,target_message text,target_link text,
  target_dedupe text,target_session uuid default null,target_period uuid default null
) returns void language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
  insert into public.customer_notifications(customer_id,type,title,message,internal_link,dedupe_key,parking_session_id,monthly_billing_period_id)
  values(target_customer,target_type,target_title,target_message,target_link,target_dedupe,target_session,target_period)
  on conflict(customer_id,dedupe_key) do nothing;
end $$;

create or replace function public.mark_customer_notification_read(notification_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'CUSTOMER_NOTIFICATION_FORBIDDEN' using errcode='42501'; end if;
  update public.customer_notifications set read_at=coalesce(read_at,clock_timestamp())
  where id=notification_id and customer_id=actor;
  if not found then raise exception 'CUSTOMER_NOTIFICATION_NOT_FOUND' using errcode='P0002'; end if;
end $$;

create or replace function public.mark_all_customer_notifications_read()
returns integer language plpgsql security definer
set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid(); affected integer;
begin
  if actor is null then raise exception 'CUSTOMER_NOTIFICATION_FORBIDDEN' using errcode='42501'; end if;
  update public.customer_notifications set read_at=clock_timestamp() where customer_id=actor and read_at is null;
  get diagnostics affected=row_count; return affected;
end $$;

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
      if reason='DAILY_CAP' then perform private.create_customer_notification(actor,'DAILY_CAP_NEAR','Limite da diária próximo','Você está se aproximando do valor máximo previsto para esta diária.',
        '/cliente/estadias?session='||s.id,s.id||':DAILY_CAP_NEAR:'||extract(epoch from transition_at)::bigint,s.id,null); end if;
    end if;
    if at_cap then perform private.create_customer_notification(actor,'DAILY_CAP_REACHED','Limite da diária atingido','Você atingiu o valor máximo previsto para esta diária.',
      '/cliente/estadias?session='||s.id,s.id||':DAILY_CAP_REACHED',s.id,null); end if;
    if not in_grace and current_amount>0 then
      if mins<=60 then current_transition:=s.entered_at+(grace_mins*interval '1 minute');
      else current_transition:=s.entered_at+(60+(ceil((mins-60)::numeric/fraction_mins)-1)*fraction_mins)*interval '1 minute'; end if;
      previous_amount:=private.charge_amount(s.tariff_snapshot,s.entered_at,current_transition-interval '1 second');
      if current_amount>previous_amount then perform private.create_customer_notification(actor,'PARKING_PRICE_UPDATED','Valor da estadia atualizado',
        'O valor estimado mudou de R$ '||to_char(previous_amount,'FM999999990D00')||' para R$ '||to_char(current_amount,'FM999999990D00')||'.',
        '/cliente/estadias?session='||s.id,s.id||':PARKING_PRICE_UPDATED:'||extract(epoch from current_transition)::bigint,s.id,null); end if;
    end if;
  end if;
  return jsonb_build_object('sessionId',s.id,'state',s.status,'covered',s.financial_obligation='WAIVED_BY_MONTHLY_COVERAGE',
    'enteredAt',s.entered_at,'referenceTime',now_at,'durationMinutes',mins,'tariffName',s.tariff_snapshot->>'name',
    'currentAmount',current_amount,'nextTransitionAt',transition_at,'secondsUntilNext',seconds_remaining,
    'estimatedNextAmount',next_amount,'transitionReason',reason,'graceRemainingSeconds',case when in_grace then greatest(0,ceil(extract(epoch from((s.entered_at+grace_mins*interval '1 minute')-now_at)))::integer) else 0 end,
    'dailyCapAmount',cap_amount,'dailyCapReached',at_cap,'shouldPoll',s.status='OPEN' and s.financial_obligation='REQUIRED');
end $$;

create or replace function public.refresh_customer_notifications()
returns integer language plpgsql volatile security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid:=auth.uid(); item record; created_before integer; created_after integer;
begin
  if actor is null then raise exception 'CUSTOMER_NOTIFICATION_FORBIDDEN' using errcode='42501'; end if;
  select count(*) into created_before from public.customer_notifications where customer_id=actor;
  for item in select b.id,b.status,b.due_date,s.status subscription_status
    from public.monthly_billing_periods b join public.monthly_subscriptions s on s.id=b.subscription_id
    where s.customer_id=actor and b.status='PENDING'
  loop
    if item.due_date<current_date then perform private.create_customer_notification(actor,'MONTHLY_PAYMENT_OVERDUE','Mensalidade vencida','Existe uma competência mensal aguardando pagamento.','/cliente/mensalidade',item.id||':MONTHLY_PAYMENT_OVERDUE',null,item.id);
    elsif item.due_date<=current_date+interval '5 days' then perform private.create_customer_notification(actor,'MONTHLY_PAYMENT_DUE','Vencimento da mensalidade próximo','Uma competência mensal está próxima do vencimento.','/cliente/mensalidade',item.id||':MONTHLY_PAYMENT_DUE',null,item.id); end if;
  end loop;
  select count(*) into created_after from public.customer_notifications where customer_id=actor; return created_after-created_before;
end $$;

create or replace function private.notify_customer_payment_confirmed()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare owner_id uuid; link text;
begin
  if new.status='PAID' and old.status is distinct from 'PAID' then
    if new.payment_subject_type='PARKING_SESSION' then select customer_owner_id into owner_id from public.parking_sessions where id=new.parking_session_id;link:='/cliente/pagamentos';
    else select s.customer_id into owner_id from public.monthly_billing_periods b join public.monthly_subscriptions s on s.id=b.subscription_id where b.id=new.monthly_billing_period_id;link:='/cliente/mensalidade'; end if;
    if owner_id is not null then perform private.create_customer_notification(owner_id,'PAYMENT_CONFIRMED','Pagamento confirmado','Seu pagamento foi confirmado com segurança.',link,new.id||':PAYMENT_CONFIRMED',new.parking_session_id,new.monthly_billing_period_id); end if;
  end if; return new;
end $$;
create trigger customer_payment_confirmed_notification after update of status on public.payments for each row execute function private.notify_customer_payment_confirmed();

create or replace function private.notify_monthly_subscription_status()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  if new.status='SUSPENDED' and old.status is distinct from 'SUSPENDED' then
    perform private.create_customer_notification(new.customer_id,'MONTHLY_SUSPENDED','Mensalidade suspensa','Sua mensalidade está suspensa e não concede cobertura.','/cliente/mensalidade',new.id||':MONTHLY_SUSPENDED:'||extract(epoch from new.updated_at)::bigint,null,null);
  end if; return new;
end $$;
create trigger customer_monthly_status_notification after update of status on public.monthly_subscriptions for each row execute function private.notify_monthly_subscription_status();

create or replace function private.activate_monthly_subscription_after_payment()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare owner_id uuid;
begin
  if new.status='PAID' and old.status is distinct from 'PAID' then
    update public.monthly_subscriptions set status='ACTIVE',updated_at=clock_timestamp()
    where id=new.subscription_id and status='PENDING_ACTIVATION' returning customer_id into owner_id;
    if owner_id is not null then perform private.create_customer_notification(owner_id,'MONTHLY_ACTIVATED','Mensalidade ativada','Sua mensalidade foi ativada após a confirmação do pagamento.','/cliente/mensalidade',new.subscription_id||':MONTHLY_ACTIVATED',null,new.id); end if;
  end if; return new;
end $$;

revoke all on function private.create_customer_notification(uuid,text,text,text,text,text,uuid,uuid),private.notify_customer_payment_confirmed(),private.notify_monthly_subscription_status() from public,anon,authenticated;
revoke all on function public.mark_customer_notification_read(uuid),public.mark_all_customer_notifications_read(),public.refresh_customer_parking_forecast(uuid),public.refresh_customer_notifications() from public,anon;
grant execute on function public.mark_customer_notification_read(uuid),public.mark_all_customer_notifications_read(),public.refresh_customer_parking_forecast(uuid),public.refresh_customer_notifications() to authenticated,service_role;
grant execute on function private.create_customer_notification(uuid,text,text,text,text,text,uuid,uuid),private.notify_customer_payment_confirmed(),private.notify_monthly_subscription_status() to service_role;
