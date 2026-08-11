-- Phase 1: backward-compatible financial dimensions and server-side availability.
alter type public.parking_payment_method add value if not exists 'DEBIT_CARD';
alter type public.parking_payment_method add value if not exists 'CREDIT_CARD';

do $$ begin
  create type public.payment_channel as enum ('MANUAL','QR','HOSTED_CHECKOUT','POINT','TAP');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_operational_status as enum ('PENDING','APPROVED','FAILED','CANCELLED','REFUNDED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_settlement_status as enum ('PENDING','SETTLED','FAILED','CANCELLED','REFUNDED','UNKNOWN');
exception when duplicate_object then null; end $$;

alter table public.payments
  add column payment_channel public.payment_channel,
  add column operational_status public.payment_operational_status,
  add column settlement_status public.payment_settlement_status,
  add column gross_amount numeric(12,2),
  add column fee_amount numeric(12,2),
  add column net_amount numeric(12,2);

alter table public.payments
  add constraint payments_provider_known_check check (provider is null or provider in ('INTERNAL','ASAAS','MERCADO_PAGO')) not valid,
  add constraint payments_gross_amount_check check (gross_amount >= 0) not valid,
  add constraint payments_fee_amount_check check (fee_amount is null or fee_amount >= 0) not valid,
  add constraint payments_net_amount_check check (net_amount is null or net_amount >= 0) not valid;

update public.payments set
  payment_channel = case when method='PIX' then 'QR'::public.payment_channel else 'MANUAL'::public.payment_channel end,
  operational_status = case status
    when 'PAID' then 'APPROVED'::public.payment_operational_status
    when 'FAILED' then 'FAILED'::public.payment_operational_status
    when 'CANCELLED' then 'CANCELLED'::public.payment_operational_status
    when 'REFUNDED' then 'REFUNDED'::public.payment_operational_status
    else 'PENDING'::public.payment_operational_status end,
  settlement_status = case
    when status='PAID' and method in ('CASH','PIX') then 'SETTLED'::public.payment_settlement_status
    when status='PAID' and method='CARD' then 'UNKNOWN'::public.payment_settlement_status
    when status='FAILED' then 'FAILED'::public.payment_settlement_status
    when status='CANCELLED' then 'CANCELLED'::public.payment_settlement_status
    when status='REFUNDED' then 'REFUNDED'::public.payment_settlement_status
    else 'PENDING'::public.payment_settlement_status end,
  gross_amount = amount;

alter table public.payments
  alter column payment_channel set not null,
  alter column operational_status set not null,
  alter column settlement_status set not null,
  alter column gross_amount set not null;

alter table public.payments validate constraint payments_provider_known_check;
alter table public.payments validate constraint payments_gross_amount_check;
alter table public.payments validate constraint payments_fee_amount_check;
alter table public.payments validate constraint payments_net_amount_check;

create or replace function private.sync_payment_financial_dimensions()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  new.payment_channel := coalesce(new.payment_channel,case when new.method='PIX' then 'QR'::public.payment_channel else 'MANUAL'::public.payment_channel end);
  new.provider := coalesce(new.provider,case when new.method='PIX' then 'ASAAS' else 'INTERNAL' end);
  new.gross_amount := coalesce(new.gross_amount,new.amount);
  if tg_op='INSERT' or new.status is distinct from old.status then
    new.operational_status := case new.status when 'PAID' then 'APPROVED' when 'FAILED' then 'FAILED' when 'CANCELLED' then 'CANCELLED' when 'REFUNDED' then 'REFUNDED' else 'PENDING' end;
    new.settlement_status := case when new.status='PAID' and new.method in ('CASH','PIX') then 'SETTLED' when new.status='PAID' then 'UNKNOWN' when new.status='FAILED' then 'FAILED' when new.status='CANCELLED' then 'CANCELLED' when new.status='REFUNDED' then 'REFUNDED' else 'PENDING' end;
  end if;
  return new;
end $$;
revoke all on function private.sync_payment_financial_dimensions() from public,anon,authenticated;
drop trigger if exists payments_sync_financial_dimensions on public.payments;
create trigger payments_sync_financial_dimensions before insert or update of status,amount,method,provider on public.payments for each row execute function private.sync_payment_financial_dimensions();

create table public.payment_method_availability(
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  payment_method text not null check(payment_method in ('CASH','PIX','CARD','DEBIT_CARD','CREDIT_CARD')),
  payment_channel public.payment_channel not null,
  payment_provider text not null check(payment_provider in ('INTERNAL','ASAAS','MERCADO_PAGO')),
  enabled boolean not null default false,
  configuration_state text not null check(configuration_state in ('READY','DISABLED','UNCONFIGURED')),
  legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(unit_id,payment_method,payment_channel,payment_provider)
);
alter table public.payment_method_availability enable row level security;
create policy payment_availability_read_unit_staff on public.payment_method_availability for select to authenticated
using(private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[]));
revoke all on table public.payment_method_availability from public,anon,authenticated;
grant select on table public.payment_method_availability to authenticated;
grant select,insert,update,delete on table public.payment_method_availability to service_role;

insert into public.payment_method_availability(unit_id,payment_method,payment_channel,payment_provider,enabled,configuration_state,legacy)
select u.id,v.method,v.channel::public.payment_channel,v.provider,v.enabled,v.state,v.legacy
from public.parking_units u cross join (values
  ('CASH','MANUAL','INTERNAL',true,'READY',false),
  ('PIX','QR','ASAAS',true,'READY',false),
  ('CARD','MANUAL','INTERNAL',true,'READY',true),
  ('DEBIT_CARD','MANUAL','INTERNAL',false,'DISABLED',false),
  ('CREDIT_CARD','MANUAL','INTERNAL',false,'DISABLED',false),
  ('DEBIT_CARD','POINT','MERCADO_PAGO',false,'UNCONFIGURED',false),
  ('CREDIT_CARD','POINT','MERCADO_PAGO',false,'UNCONFIGURED',false),
  ('CREDIT_CARD','HOSTED_CHECKOUT','ASAAS',false,'UNCONFIGURED',false)
) as v(method,channel,provider,enabled,state,legacy)
on conflict do nothing;

create or replace function private.authorize_provider_payment(target_session uuid)
returns public.parking_sessions language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare session_row public.parking_sessions; begin
  select * into session_row from public.parking_sessions where id=target_session;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  if not (private.customer_owns_session(target_session) or private.has_unit_role(session_row.unit_id,array['owner','manager','operator']::public.app_role[])) then raise exception 'PAYMENT_FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.payment_method_availability a where a.unit_id=session_row.unit_id and a.payment_method='PIX' and a.payment_channel='QR' and a.payment_provider='ASAAS' and a.enabled and a.configuration_state='READY') then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;
  return session_row;
end $$;
revoke all on function private.authorize_provider_payment(uuid) from public,anon,authenticated;

create or replace function public.record_manual_payment(session_id uuid,payment_method public.parking_payment_method,request_key uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s public.parking_sessions; actor uuid; shift public.cash_shifts; payment_id uuid; begin
  if payment_method not in ('CASH','CARD') then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;
  select * into s from public.parking_sessions where id=session_id for update; if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if; actor:=private.require_operator(s.unit_id);
  if not exists(select 1 from public.payment_method_availability a where a.unit_id=s.unit_id and a.payment_method=payment_method::text and a.payment_channel='MANUAL' and a.payment_provider='INTERNAL' and a.enabled and a.configuration_state='READY') then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;
  if s.status='PAID' then select id into payment_id from public.payments where parking_session_id=s.id and status='PAID'; return payment_id; end if;
  if s.status<>'PAYMENT_PENDING' then raise exception 'EXIT_NOT_STARTED'; end if;
  select * into shift from public.cash_shifts where unit_id=s.unit_id and operator_id=actor and status='OPEN' for update; if not found then raise exception 'CASH_SHIFT_REQUIRED'; end if;
  insert into public.payments(unit_id,parking_session_id,amount,method,status,provider,payment_channel,manual_confirmation,paid_at,received_by,cash_shift_id,idempotency_key)
  values(s.unit_id,s.id,s.final_amount,payment_method,'PAID','INTERNAL','MANUAL',true,clock_timestamp(),actor,shift.id,request_key) on conflict(idempotency_key) do nothing returning id into payment_id;
  if payment_id is null then select id into payment_id from public.payments where idempotency_key=request_key and parking_session_id=s.id; if payment_id is null then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if; end if;
  update public.parking_sessions set status='PAID',payment_status='PAID',updated_at=clock_timestamp() where id=s.id and status='PAYMENT_PENDING';
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,s.unit_id,'payment.manual_confirmed',jsonb_build_object('session_id',s.id,'payment_id',payment_id,'method',payment_method,'channel','MANUAL','provider','INTERNAL')); return payment_id;
end $$;
revoke all on function public.record_manual_payment(uuid,public.parking_payment_method,uuid) from public,anon;
grant execute on function public.record_manual_payment(uuid,public.parking_payment_method,uuid) to authenticated;

create index payment_method_availability_unit_enabled_idx on public.payment_method_availability(unit_id,payment_method) where enabled;
create index payments_financial_dimensions_idx on public.payments(unit_id,payment_channel,operational_status,created_at desc);
