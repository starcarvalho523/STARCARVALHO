-- Phase 3 foundation only: no Mercado Pago calls and no operational Point method.
alter table public.payment_method_availability drop constraint if exists payment_method_availability_configuration_state_check;
alter table public.payment_method_availability add constraint payment_method_availability_configuration_state_check
  check (configuration_state in ('READY','DISABLED','UNCONFIGURED','AWAITING_TERMINAL')) not valid;
alter table public.payment_method_availability validate constraint payment_method_availability_configuration_state_check;

update public.payment_method_availability
set enabled=false,configuration_state='AWAITING_TERMINAL',updated_at=clock_timestamp()
where payment_channel='POINT' and payment_provider='MERCADO_PAGO';

create table public.payment_terminals(
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.parking_units(id) on delete cascade,
  provider text not null check(provider='MERCADO_PAGO'),
  provider_store_id text,
  provider_pos_id text,
  provider_terminal_id text,
  name text not null check(length(btrim(name)) between 1 and 120),
  model text,
  operating_mode text check(operating_mode is null or operating_mode in ('STANDALONE','PDV')),
  status text not null default 'AWAITING_TERMINAL' check(status in ('NOT_CONFIGURED','AWAITING_TERMINAL','READY','DISABLED','ERROR')),
  enabled boolean not null default false,
  operator_self_assignment_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_terminal_ready_check check(not enabled or (status='READY' and operating_mode='PDV' and provider_terminal_id is not null and provider_pos_id is not null and provider_store_id is not null))
);
create unique index payment_terminals_provider_external_idx on public.payment_terminals(provider,provider_terminal_id) where provider_terminal_id is not null;
create index payment_terminals_unit_status_idx on public.payment_terminals(unit_id,status,enabled);
alter table public.payment_terminals enable row level security;
create policy payment_terminals_ceo_read on public.payment_terminals for select to authenticated
using(private.has_unit_role(unit_id,array['owner','manager','finance','auditor']::public.app_role[]));
revoke all on table public.payment_terminals from public,anon,authenticated;
grant select on table public.payment_terminals to authenticated;
grant select,insert,update,delete on table public.payment_terminals to service_role;

alter table private.payment_provider_transactions
  add column if not exists provider_order_id text,
  add column if not exists provider_terminal_id text;
alter table private.payment_provider_transactions drop constraint if exists payment_provider_transactions_provider_check;
alter table private.payment_provider_transactions add constraint payment_provider_transactions_provider_check
  check(provider in ('ASAAS','MERCADO_PAGO')) not valid;
alter table private.payment_provider_transactions validate constraint payment_provider_transactions_provider_check;
create unique index payment_provider_transactions_provider_order_idx
  on private.payment_provider_transactions(provider,provider_order_id) where provider_order_id is not null;

revoke all on table private.payment_provider_transactions from public,anon,authenticated;

create table public.terminal_assignments(
  id uuid primary key default gen_random_uuid(),
  terminal_id uuid not null references public.payment_terminals(id) on delete restrict,
  cash_shift_id uuid not null references public.cash_shifts(id) on delete restrict,
  operator_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','RELEASED')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  constraint terminal_assignment_release_check check(
    (status='ACTIVE' and released_at is null) or (status='RELEASED' and released_at is not null)
  )
);
create unique index terminal_assignments_one_active_terminal_idx on public.terminal_assignments(terminal_id) where status='ACTIVE';
create unique index terminal_assignments_one_active_shift_idx on public.terminal_assignments(cash_shift_id) where status='ACTIVE';
create index terminal_assignments_operator_history_idx on public.terminal_assignments(operator_id,assigned_at desc);
alter table public.terminal_assignments enable row level security;
create policy terminal_assignments_authorized_read on public.terminal_assignments for select to authenticated
using(
  operator_id=(select auth.uid()) or exists(
    select 1 from public.payment_terminals t
    where t.id=terminal_id and private.has_unit_role(t.unit_id,array['owner','manager','finance','auditor']::public.app_role[])
  )
);
revoke all on table public.terminal_assignments from public,anon,authenticated;
grant select on table public.terminal_assignments to authenticated;
grant select,insert,update on table public.terminal_assignments to service_role;

create or replace function private.assign_point_terminal(target_terminal uuid,target_shift uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare actor uuid:=auth.uid(); terminal public.payment_terminals; shift public.cash_shifts; assignment_id uuid; privileged boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_terminal::text,0));
  perform pg_advisory_xact_lock(hashtextextended(target_shift::text,0));
  select * into terminal from public.payment_terminals where id=target_terminal for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND' using errcode='P0002'; end if;
  select * into shift from public.cash_shifts where id=target_shift for update;
  if not found then raise exception 'SHIFT_NOT_FOUND' using errcode='P0002'; end if;
  if terminal.unit_id<>shift.unit_id then raise exception 'TERMINAL_UNIT_MISMATCH' using errcode='42501'; end if;
  if shift.status<>'OPEN' then raise exception 'SHIFT_NOT_OPEN'; end if;
  if not terminal.enabled or terminal.status<>'READY' or terminal.operating_mode<>'PDV' then raise exception 'TERMINAL_NOT_READY'; end if;
  privileged:=private.has_unit_role(shift.unit_id,array['owner','manager']::public.app_role[]);
  if not privileged and not(terminal.operator_self_assignment_enabled and shift.operator_id=actor and private.has_unit_role(shift.unit_id,array['operator']::public.app_role[])) then
    raise exception 'TERMINAL_ASSIGNMENT_FORBIDDEN' using errcode='42501';
  end if;
  insert into public.terminal_assignments(terminal_id,cash_shift_id,operator_id,assigned_by)
  values(terminal.id,shift.id,shift.operator_id,actor) returning id into assignment_id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,shift.unit_id,'terminal.assignment.created',jsonb_build_object('assignment_id',assignment_id,'terminal_id',terminal.id,'cash_shift_id',shift.id,'operator_id',shift.operator_id));
  return assignment_id;
exception when unique_violation then raise exception 'TERMINAL_OR_SHIFT_ALREADY_ASSIGNED' using errcode='23505';
end $$;

create or replace function private.release_point_terminal(target_assignment uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare actor uuid:=auth.uid(); assignment public.terminal_assignments; terminal public.payment_terminals; shift public.cash_shifts; privileged boolean;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into assignment from public.terminal_assignments where id=target_assignment for update;
  if not found then raise exception 'TERMINAL_ASSIGNMENT_NOT_FOUND' using errcode='P0002'; end if;
  if assignment.status='RELEASED' then return; end if;
  select * into terminal from public.payment_terminals where id=assignment.terminal_id;
  select * into shift from public.cash_shifts where id=assignment.cash_shift_id;
  privileged:=private.has_unit_role(shift.unit_id,array['owner','manager']::public.app_role[]);
  if not privileged and not(terminal.operator_self_assignment_enabled and shift.operator_id=actor and assignment.operator_id=actor) then
    raise exception 'TERMINAL_ASSIGNMENT_FORBIDDEN' using errcode='42501';
  end if;
  update public.terminal_assignments set status='RELEASED',released_at=clock_timestamp() where id=assignment.id;
  insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(actor,shift.unit_id,'terminal.assignment.released',jsonb_build_object('assignment_id',assignment.id,'terminal_id',terminal.id,'cash_shift_id',shift.id,'operator_id',assignment.operator_id));
end $$;

create or replace function public.assign_point_terminal(terminal_id uuid,cash_shift_id uuid)
returns uuid language sql volatile security invoker set search_path=pg_catalog,private as $$select private.assign_point_terminal(terminal_id,cash_shift_id)$$;
create or replace function public.release_point_terminal(assignment_id uuid)
returns void language sql volatile security invoker set search_path=pg_catalog,private as $$select private.release_point_terminal(assignment_id)$$;

create or replace function private.release_terminal_on_shift_close()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare released public.terminal_assignments;
begin
  if old.status='OPEN' and new.status='CLOSED' then
    for released in update public.terminal_assignments set status='RELEASED',released_at=clock_timestamp() where cash_shift_id=new.id and status='ACTIVE' returning * loop
      insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(coalesce(auth.uid(),released.assigned_by),new.unit_id,'terminal.assignment.auto_released',jsonb_build_object('assignment_id',released.id,'terminal_id',released.terminal_id,'cash_shift_id',new.id,'operator_id',released.operator_id));
    end loop;
  end if;
  return new;
end $$;
create trigger cash_shift_release_terminal after update of status on public.cash_shifts for each row execute function private.release_terminal_on_shift_close();

revoke all on function private.assign_point_terminal(uuid,uuid),private.release_point_terminal(uuid),private.release_terminal_on_shift_close() from public,anon,authenticated;
revoke all on function public.assign_point_terminal(uuid,uuid),public.release_point_terminal(uuid) from public,anon,authenticated;
grant execute on function public.assign_point_terminal(uuid,uuid),public.release_point_terminal(uuid) to authenticated;

