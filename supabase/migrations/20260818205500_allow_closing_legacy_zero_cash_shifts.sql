-- Preserve strict opening rules for new/open shifts while allowing legacy
-- zero-opening shifts to be closed without rewriting historical amounts.

alter table public.cash_shifts
  drop constraint if exists cash_shifts_opening_amount_check;

alter table public.cash_shifts
  add constraint cash_shifts_opening_amount_check
  check (
    status = 'CLOSED'
    or opening_amount > 0
  )
  not valid;
