create or replace function public.open_cash_shift(target_unit uuid, initial_amount numeric)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
begin
  if initial_amount is null or initial_amount <= 0 then
    raise exception 'INVALID_OPENING_AMOUNT' using errcode='22023';
  end if;
  return private.open_cash_shift(target_unit, initial_amount);
end
$function$;

create or replace function public.close_cash_shift(shift_id uuid, declared_amount numeric, closing_notes text default null)
returns numeric
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.close_cash_shift(shift_id, declared_amount, closing_notes)
$function$;

revoke all on function public.open_cash_shift(uuid,numeric) from public, anon;
revoke all on function public.close_cash_shift(uuid,numeric,text) from public, anon;
grant execute on function public.open_cash_shift(uuid,numeric) to authenticated, service_role;
grant execute on function public.close_cash_shift(uuid,numeric,text) to authenticated, service_role;
