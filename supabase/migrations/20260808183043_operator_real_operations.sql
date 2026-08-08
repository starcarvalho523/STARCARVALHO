create type public.vehicle_type as enum ('CAR','MOTORCYCLE');
create type public.parking_session_status as enum ('OPEN','PAYMENT_PENDING','PAID','EXITED','CANCELLED','MANUAL_REVIEW');
create type public.parking_payment_status as enum ('PENDING','PAID','FAILED','CANCELLED','REFUNDED');
create type public.parking_payment_method as enum ('PIX','CARD','CASH');
create type public.cash_shift_status as enum ('OPEN','CLOSED');

create table public.tariff_rules (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.parking_units(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100), vehicle_type public.vehicle_type not null,
  first_hour_amount numeric(12,2) not null check (first_hour_amount >= 0), additional_amount numeric(12,2) not null check (additional_amount >= 0),
  additional_fraction_minutes integer not null default 60 check (additional_fraction_minutes between 1 and 1440), grace_minutes integer not null default 0 check (grace_minutes between 0 and 120),
  daily_cap_amount numeric(12,2) check (daily_cap_amount is null or daily_cap_amount >= 0), valid_from timestamptz not null default now(), valid_until timestamptz,
  is_active boolean not null default true, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);
create unique index tariff_rules_active_unit_vehicle_idx on public.tariff_rules(unit_id,vehicle_type) where is_active and valid_until is null;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(), plate text not null, normalized_plate text not null unique check (normalized_plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  vehicle_type public.vehicle_type not null, customer_id uuid references public.customer_profiles(user_id) on delete set null, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.parking_sessions (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.parking_units(id), vehicle_id uuid not null references public.vehicles(id),
  plate_snapshot text not null, vehicle_type public.vehicle_type not null, status public.parking_session_status not null default 'OPEN', entered_at timestamptz not null default now(),
  entry_operator_id uuid not null references auth.users(id), exit_requested_at timestamptz, exited_at timestamptz, exit_operator_id uuid references auth.users(id),
  tariff_rule_id uuid not null references public.tariff_rules(id), tariff_snapshot jsonb not null, calculated_amount numeric(12,2), final_amount numeric(12,2),
  payment_status public.parking_payment_status not null default 'PENDING', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index parking_sessions_one_active_vehicle_idx on public.parking_sessions(unit_id,vehicle_id) where status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW');
create index parking_sessions_unit_status_entered_idx on public.parking_sessions(unit_id,status,entered_at desc);
create index parking_sessions_vehicle_idx on public.parking_sessions(vehicle_id,entered_at desc);
create index parking_sessions_exited_idx on public.parking_sessions(unit_id,exited_at desc) where exited_at is not null;

create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.parking_units(id), operator_id uuid not null references auth.users(id),
  opened_at timestamptz not null default now(), opening_amount numeric(12,2) not null check (opening_amount >= 0), status public.cash_shift_status not null default 'OPEN',
  closed_at timestamptz, declared_cash_amount numeric(12,2) check (declared_cash_amount is null or declared_cash_amount >= 0), expected_cash_amount numeric(12,2), difference_amount numeric(12,2), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index cash_shifts_one_open_operator_idx on public.cash_shifts(unit_id,operator_id) where status='OPEN';

create table public.payments (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.parking_units(id), parking_session_id uuid not null references public.parking_sessions(id),
  amount numeric(12,2) not null check (amount >= 0), method public.parking_payment_method not null, status public.parking_payment_status not null default 'PENDING',
  provider text, provider_reference text, manual_confirmation boolean not null default false, paid_at timestamptz, received_by uuid references auth.users(id), cash_shift_id uuid references public.cash_shifts(id),
  idempotency_key uuid not null default gen_random_uuid(), created_at timestamptz not null default now(), unique(idempotency_key)
);
create unique index payments_one_current_per_session_idx on public.payments(parking_session_id) where status in ('PENDING','PAID');
create index payments_unit_status_created_idx on public.payments(unit_id,status,created_at desc);
create index payments_shift_idx on public.payments(cash_shift_id,created_at desc) where cash_shift_id is not null;

create table public.monthly_subscriptions (
  id uuid primary key default gen_random_uuid(), customer_id uuid references public.customer_profiles(user_id) on delete cascade, vehicle_id uuid not null references public.vehicles(id), unit_id uuid not null references public.parking_units(id),
  plan_name text not null, status text not null check(status in ('ACTIVE','EXPIRED','SUSPENDED')), starts_at timestamptz not null, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(expires_at > starts_at)
);
create index monthly_subscriptions_unit_vehicle_idx on public.monthly_subscriptions(unit_id,vehicle_id,status,expires_at desc);

alter table public.tariff_rules enable row level security; alter table public.vehicles enable row level security; alter table public.parking_sessions enable row level security;
alter table public.cash_shifts enable row level security; alter table public.payments enable row level security; alter table public.monthly_subscriptions enable row level security;

create policy "tariffs_read_unit_staff" on public.tariff_rules for select to authenticated using (private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[]));
create policy "vehicles_read_unit_staff" on public.vehicles for select to authenticated using (exists(select 1 from public.parking_sessions s where s.vehicle_id=vehicles.id and private.has_unit_role(s.unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[])));
create policy "sessions_read_unit_staff" on public.parking_sessions for select to authenticated using (private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[]));
create policy "shifts_read_unit_staff" on public.cash_shifts for select to authenticated using (private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[]));
create policy "payments_read_unit_staff" on public.payments for select to authenticated using (private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[]));
create policy "monthly_read_unit_staff" on public.monthly_subscriptions for select to authenticated using (private.has_unit_role(unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[]));
grant select on public.tariff_rules,public.vehicles,public.parking_sessions,public.cash_shifts,public.payments,public.monthly_subscriptions to authenticated;

create or replace function private.require_operator(target_unit uuid) returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid := auth.uid(); begin
  if actor is null or not private.has_unit_role(target_unit,array['operator']::public.app_role[]) then raise exception 'OPERATOR_FORBIDDEN' using errcode='42501'; end if;
  return actor;
end $$;
revoke all on function private.require_operator(uuid) from public,anon,authenticated;

create or replace function private.charge_amount(snapshot jsonb, entered timestamptz, reference_time timestamptz) returns numeric language plpgsql immutable set search_path=pg_catalog as $$
declare mins integer:=greatest(0,ceil(extract(epoch from(reference_time-entered))/60)::integer); total numeric; fraction integer; begin
  if mins <= (snapshot->>'grace_minutes')::integer then return 0; end if;
  total := (snapshot->>'first_hour_amount')::numeric;
  if mins > 60 then fraction := (snapshot->>'additional_fraction_minutes')::integer; total := total + ceil((mins-60)::numeric/fraction)*(snapshot->>'additional_amount')::numeric; end if;
  if snapshot->>'daily_cap_amount' is not null and total > (snapshot->>'daily_cap_amount')::numeric then total := (snapshot->>'daily_cap_amount')::numeric; end if;
  return round(total,2);
end $$;
revoke all on function private.charge_amount(jsonb,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function public.calculate_parking_charge(session_id uuid) returns table(entered_at timestamptz,reference_time timestamptz,duration_minutes integer,tariff_name text,total numeric) language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare s public.parking_sessions; now_at timestamptz:=clock_timestamp(); begin
  select * into s from public.parking_sessions where id=session_id;
  if not found or not private.has_unit_role(s.unit_id,array['owner','manager','operator','finance','auditor']::public.app_role[]) then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
  return query select s.entered_at,now_at,greatest(0,ceil(extract(epoch from(now_at-s.entered_at))/60)::integer),s.tariff_snapshot->>'name',private.charge_amount(s.tariff_snapshot,s.entered_at,coalesce(s.exit_requested_at,now_at));
end $$;

create or replace function public.register_parking_entry(target_unit uuid,raw_plate text,target_vehicle_type public.vehicle_type) returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare actor uuid; normalized text:=upper(regexp_replace(coalesce(raw_plate,''),'[^A-Za-z0-9]','','g')); v public.vehicles; tariff public.tariff_rules; new_id uuid; begin
  actor:=private.require_operator(target_unit);
  if normalized !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'INVALID_PLATE' using errcode='22023'; end if;
  select * into tariff from public.tariff_rules where unit_id=target_unit and vehicle_type=target_vehicle_type and is_active and valid_from<=clock_timestamp() and (valid_until is null or valid_until>clock_timestamp()) order by valid_from desc limit 1;
  if not found then raise exception 'NO_ACTIVE_TARIFF' using errcode='P0001'; end if;
  insert into public.vehicles(plate,normalized_plate,vehicle_type) values(normalized,normalized,target_vehicle_type) on conflict(normalized_plate) do update set vehicle_type=excluded.vehicle_type,updated_at=clock_timestamp() returning * into v;
  begin
    insert into public.parking_sessions(unit_id,vehicle_id,plate_snapshot,vehicle_type,entry_operator_id,tariff_rule_id,tariff_snapshot)
    values(target_unit,v.id,normalized,target_vehicle_type,actor,tariff.id,jsonb_build_object('name',tariff.name,'first_hour_amount',tariff.first_hour_amount,'additional_amount',tariff.additional_amount,'additional_fraction_minutes',tariff.additional_fraction_minutes,'grace_minutes',tariff.grace_minutes,'daily_cap_amount',tariff.daily_cap_amount)) returning id into new_id;
  exception when unique_violation then raise exception 'ACTIVE_SESSION_EXISTS' using errcode='23505'; end;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,target_unit,'parking.entry.created',jsonb_build_object('session_id',new_id,'plate',normalized)); return new_id;
end $$;

create or replace function public.start_parking_exit(session_id uuid) returns numeric language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s public.parking_sessions; actor uuid; amount numeric; begin
  select * into s from public.parking_sessions where id=session_id for update; if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if; actor:=private.require_operator(s.unit_id);
  if s.status='PAYMENT_PENDING' then return s.final_amount; end if; if s.status<>'OPEN' then raise exception 'INVALID_SESSION_STATE'; end if;
  amount:=private.charge_amount(s.tariff_snapshot,s.entered_at,clock_timestamp()); update public.parking_sessions set status='PAYMENT_PENDING',exit_requested_at=clock_timestamp(),calculated_amount=amount,final_amount=amount,updated_at=clock_timestamp() where id=s.id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,s.unit_id,'parking.exit.started',jsonb_build_object('session_id',s.id,'amount',amount)); return amount;
end $$;

create or replace function public.record_manual_payment(session_id uuid,payment_method public.parking_payment_method,request_key uuid) returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s public.parking_sessions; actor uuid; shift public.cash_shifts; payment_id uuid; begin
  if payment_method='PIX' then raise exception 'PIX_PROVIDER_NOT_CONFIGURED'; end if;
  select * into s from public.parking_sessions where id=session_id for update; if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if; actor:=private.require_operator(s.unit_id);
  if s.status='PAID' then select id into payment_id from public.payments where parking_session_id=s.id and status='PAID'; return payment_id; end if;
  if s.status<>'PAYMENT_PENDING' then raise exception 'EXIT_NOT_STARTED'; end if;
  select * into shift from public.cash_shifts where unit_id=s.unit_id and operator_id=actor and status='OPEN' for update; if not found then raise exception 'CASH_SHIFT_REQUIRED'; end if;
  insert into public.payments(unit_id,parking_session_id,amount,method,status,manual_confirmation,paid_at,received_by,cash_shift_id,idempotency_key)
  values(s.unit_id,s.id,s.final_amount,payment_method,'PAID',true,clock_timestamp(),actor,shift.id,request_key) on conflict(idempotency_key) do nothing returning id into payment_id;
  if payment_id is null then select id into payment_id from public.payments where idempotency_key=request_key and parking_session_id=s.id; if payment_id is null then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if; end if;
  update public.parking_sessions set status='PAID',payment_status='PAID',updated_at=clock_timestamp() where id=s.id and status='PAYMENT_PENDING';
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,s.unit_id,'payment.manual_confirmed',jsonb_build_object('session_id',s.id,'payment_id',payment_id,'method',payment_method)); return payment_id;
end $$;

create or replace function public.operator_dashboard_summary(target_unit uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare actor uuid:=private.require_operator(target_unit); result jsonb; begin
  select jsonb_build_object(
    'unit',jsonb_build_object('id',u.id,'name',u.name,'slug',u.slug,'capacity',u.capacity,'timezone',u.timezone),
    'vehicles_in_yard',(select count(*) from public.parking_sessions s where s.unit_id=u.id and s.status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW')),
    'available_spaces',greatest(0,u.capacity-(select count(*) from public.parking_sessions s where s.unit_id=u.id and s.status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW'))),
    'entries_today',(select count(*) from public.parking_sessions s where s.unit_id=u.id and (s.entered_at at time zone u.timezone)::date=(clock_timestamp() at time zone u.timezone)::date),
    'exits_today',(select count(*) from public.parking_sessions s where s.unit_id=u.id and s.exited_at is not null and (s.exited_at at time zone u.timezone)::date=(clock_timestamp() at time zone u.timezone)::date),
    'active_sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'plate',s.plate_snapshot,'vehicle_type',s.vehicle_type,'status',s.status,'entered_at',s.entered_at,'duration_minutes',greatest(0,ceil(extract(epoch from(clock_timestamp()-s.entered_at))/60)::integer),'amount',case when s.status='OPEN' then private.charge_amount(s.tariff_snapshot,s.entered_at,clock_timestamp()) else s.final_amount end,'payment_status',s.payment_status,'tariff_name',s.tariff_snapshot->>'name') order by s.entered_at desc) from (select * from public.parking_sessions where unit_id=u.id and status in ('OPEN','PAYMENT_PENDING','PAID','MANUAL_REVIEW') order by entered_at desc limit 20) s),'[]'::jsonb),
    'open_shift',(select jsonb_build_object('id',cs.id,'opened_at',cs.opened_at,'opening_amount',cs.opening_amount,'cash_total',coalesce(sum(p.amount) filter(where p.method='CASH' and p.status='PAID'),0),'card_total',coalesce(sum(p.amount) filter(where p.method='CARD' and p.status='PAID'),0),'pix_total',coalesce(sum(p.amount) filter(where p.method='PIX' and p.status='PAID'),0),'payment_count',count(p.id) filter(where p.status='PAID')) from public.cash_shifts cs left join public.payments p on p.cash_shift_id=cs.id where cs.unit_id=u.id and cs.operator_id=actor and cs.status='OPEN' group by cs.id),
    'has_active_car_tariff',exists(select 1 from public.tariff_rules t where t.unit_id=u.id and t.vehicle_type='CAR' and t.is_active and t.valid_from<=clock_timestamp() and (t.valid_until is null or t.valid_until>clock_timestamp())),
    'has_active_motorcycle_tariff',exists(select 1 from public.tariff_rules t where t.unit_id=u.id and t.vehicle_type='MOTORCYCLE' and t.is_active and t.valid_from<=clock_timestamp() and (t.valid_until is null or t.valid_until>clock_timestamp()))
  ) into result from public.parking_units u where u.id=target_unit and u.is_active;
  if result is null then raise exception 'UNIT_NOT_FOUND'; end if; return result;
end $$;

create or replace function public.complete_parking_exit(session_id uuid) returns timestamptz language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s public.parking_sessions; actor uuid; completed timestamptz; begin
  select * into s from public.parking_sessions where id=session_id for update; if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if; actor:=private.require_operator(s.unit_id);
  if s.status='EXITED' then return s.exited_at; end if; if s.status<>'PAID' or s.payment_status<>'PAID' then raise exception 'PAYMENT_REQUIRED'; end if;
  completed:=clock_timestamp(); update public.parking_sessions set status='EXITED',exited_at=completed,exit_operator_id=actor,updated_at=completed where id=s.id and status='PAID';
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,s.unit_id,'parking.exit.completed',jsonb_build_object('session_id',s.id)); return completed;
end $$;

create or replace function public.open_cash_shift(target_unit uuid,initial_amount numeric) returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare actor uuid:=private.require_operator(target_unit); shift_id uuid; begin if initial_amount<0 then raise exception 'INVALID_AMOUNT'; end if;
  insert into public.cash_shifts(unit_id,operator_id,opening_amount) values(target_unit,actor,initial_amount) returning id into shift_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,target_unit,'cash_shift.opened',jsonb_build_object('shift_id',shift_id,'opening_amount',initial_amount)); return shift_id;
exception when unique_violation then select id into shift_id from public.cash_shifts where unit_id=target_unit and operator_id=actor and status='OPEN'; return shift_id; end $$;

create or replace function public.close_cash_shift(shift_id uuid,declared_amount numeric,closing_notes text default null) returns numeric language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare shift public.cash_shifts; actor uuid; expected numeric; difference numeric; begin
  select * into shift from public.cash_shifts where id=shift_id for update; if not found then raise exception 'SHIFT_NOT_FOUND' using errcode='P0002'; end if; actor:=private.require_operator(shift.unit_id); if shift.operator_id<>actor or shift.status<>'OPEN' then raise exception 'SHIFT_NOT_OPEN'; end if; if declared_amount<0 then raise exception 'INVALID_AMOUNT'; end if;
  select shift.opening_amount+coalesce(sum(amount) filter(where method='CASH' and status='PAID'),0) into expected from public.payments where cash_shift_id=shift.id;
  difference:=declared_amount-expected; update public.cash_shifts set status='CLOSED',closed_at=clock_timestamp(),declared_cash_amount=declared_amount,expected_cash_amount=expected,difference_amount=difference,notes=closing_notes,updated_at=clock_timestamp() where id=shift.id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,shift.unit_id,'cash_shift.closed',jsonb_build_object('shift_id',shift.id,'expected',expected,'declared',declared_amount,'difference',difference)); return difference;
end $$;

revoke all on function public.calculate_parking_charge(uuid),public.register_parking_entry(uuid,text,public.vehicle_type),public.start_parking_exit(uuid),public.record_manual_payment(uuid,public.parking_payment_method,uuid),public.complete_parking_exit(uuid),public.open_cash_shift(uuid,numeric),public.close_cash_shift(uuid,numeric,text),public.operator_dashboard_summary(uuid) from public,anon;
grant execute on function public.calculate_parking_charge(uuid),public.register_parking_entry(uuid,text,public.vehicle_type),public.start_parking_exit(uuid),public.record_manual_payment(uuid,public.parking_payment_method,uuid),public.complete_parking_exit(uuid),public.open_cash_shift(uuid,numeric),public.close_cash_shift(uuid,numeric,text),public.operator_dashboard_summary(uuid) to authenticated;
