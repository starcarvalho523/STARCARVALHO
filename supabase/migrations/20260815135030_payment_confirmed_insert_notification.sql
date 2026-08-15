create or replace function private.notify_customer_payment_confirmed()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare owner_id uuid; link text;
begin
  if new.status='PAID' and (
    tg_op='INSERT' or (tg_op='UPDATE' and old.status is distinct from 'PAID')
  ) then
    if new.payment_subject_type='PARKING_SESSION' then
      select customer_owner_id into owner_id
      from public.parking_sessions where id=new.parking_session_id;
      link:='/cliente/pagamentos';
    else
      select s.customer_id into owner_id
      from public.monthly_billing_periods b
      join public.monthly_subscriptions s on s.id=b.subscription_id
      where b.id=new.monthly_billing_period_id;
      link:='/cliente/mensalidade';
    end if;
    if owner_id is not null then
      perform private.create_customer_notification(
        owner_id,'PAYMENT_CONFIRMED','Pagamento confirmado',
        'Seu pagamento foi confirmado com segurança.',link,
        new.id||':PAYMENT_CONFIRMED',new.parking_session_id,new.monthly_billing_period_id
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists customer_payment_confirmed_notification on public.payments;
create trigger customer_payment_confirmed_notification
after insert or update of status on public.payments
for each row execute function private.notify_customer_payment_confirmed();

revoke all on function private.notify_customer_payment_confirmed() from public,anon,authenticated;
grant execute on function private.notify_customer_payment_confirmed() to service_role;
