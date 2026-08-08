-- Visible branding changes; the technical slug is intentionally preserved for integrations.
update public.parking_units
set name = 'Star Carvalhos Central', updated_at = clock_timestamp()
where slug = 'star-cavalos-central' and name is distinct from 'Star Carvalhos Central';

-- The project inherited permissive Supabase defaults. RLS blocked row access, but
-- TRUNCATE is not governed by RLS, so table privileges are reduced to the minimum.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.parking_units, public.user_unit_roles,
  public.customer_profiles, public.employee_invitations, public.audit_logs,
  public.tariff_rules, public.vehicles, public.parking_sessions,
  public.cash_shifts, public.payments, public.monthly_subscriptions
to authenticated;

grant insert, update on public.customer_profiles to authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create or replace function private.close_cash_shift(shift_id uuid, declared_amount numeric, closing_notes text default null)
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
  into expected from public.payments where cash_shift_id = shift.id;
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
    'difference', difference, 'notes', normalized_notes
  ));

  if difference <> 0 then
    insert into public.audit_logs(actor_user_id, unit_id, action, metadata)
    values(actor, shift.unit_id, 'cash_shift.divergence', jsonb_build_object(
      'shift_id', shift.id, 'expected', expected, 'declared', declared_amount,
      'difference', difference, 'notes', normalized_notes
    ));
  end if;
  return difference;
end;
$$;

