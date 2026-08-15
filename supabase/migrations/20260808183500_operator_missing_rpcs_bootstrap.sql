create or replace function public.complete_parking_exit(session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  s public.parking_sessions;
  actor uuid;
  completed timestamptz;
begin
  select * into s from public.parking_sessions where id = session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
  actor := private.require_operator(s.unit_id);
  if s.status = 'EXITED' then return s.exited_at; end if;
  if s.status <> 'PAID' or s.payment_status <> 'PAID' then raise exception 'PAYMENT_REQUIRED'; end if;
  completed := clock_timestamp();
  update public.parking_sessions
    set status = 'EXITED', exited_at = completed, exit_operator_id = actor, updated_at = completed
    where id = s.id and status = 'PAID';
  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
    values(actor, s.unit_id, 'parking.exit.completed', jsonb_build_object('session_id', s.id));
  return completed;
end;
$$;

create or replace function public.open_cash_shift(target_unit uuid, initial_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor uuid := private.require_operator(target_unit);
  shift_id uuid;
begin
  if initial_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;
  insert into public.cash_shifts(unit_id, operator_id, opening_amount)
    values(target_unit, actor, initial_amount)
    returning id into shift_id;
  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
    values(actor, target_unit, 'cash_shift.opened', jsonb_build_object('shift_id', shift_id, 'opening_amount', initial_amount));
  return shift_id;
exception
  when unique_violation then
    select id into shift_id
      from public.cash_shifts
      where unit_id = target_unit and operator_id = actor and status = 'OPEN';
    return shift_id;
end;
$$;

create or replace function public.close_cash_shift(shift_id uuid, declared_amount numeric, closing_notes text default null)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  shift public.cash_shifts;
  actor uuid;
  expected numeric;
  difference numeric;
  normalized_notes text := nullif(trim(closing_notes), '');
begin
  select * into shift from public.cash_shifts where id = shift_id for update;
  if not found then raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
  actor := private.require_operator(shift.unit_id);
  if shift.operator_id <> actor or shift.status <> 'OPEN' then raise exception 'SHIFT_NOT_OPEN'; end if;
  if declared_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;

  select shift.opening_amount + coalesce(sum(amount) filter(where method = 'CASH' and status = 'PAID'), 0)
    into expected
    from public.payments
    where cash_shift_id = shift.id;
  difference := declared_amount - expected;

  if difference <> 0 and normalized_notes is null then
    raise exception 'CLOSING_NOTES_REQUIRED' using errcode = '22023';
  end if;

  update public.cash_shifts
    set status = 'CLOSED', closed_at = clock_timestamp(), declared_cash_amount = declared_amount,
        expected_cash_amount = expected, difference_amount = difference, notes = normalized_notes,
        updated_at = clock_timestamp()
    where id = shift.id;

  insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
    values(actor, shift.unit_id, 'cash_shift.closed', jsonb_build_object(
      'shift_id', shift.id, 'expected', expected, 'declared', declared_amount,
      'difference', difference, 'notes', normalized_notes));

  if difference <> 0 then
    insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
      values(actor, shift.unit_id, 'cash_shift.divergence', jsonb_build_object(
        'shift_id', shift.id, 'expected', expected, 'declared', declared_amount,
        'difference', difference, 'notes', normalized_notes));
  end if;

  return difference;
end;
$$;
