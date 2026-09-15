-- Prevent self-reactivation through PostgREST while retaining administrative control.
create or replace function private.guard_customer_profile_activation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.is_active is distinct from old.is_active then
    raise exception 'CUSTOMER_ACTIVATION_ADMIN_ONLY' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_customer_profile_activation() from public, anon, authenticated;

create trigger guard_customer_profile_activation
before update on public.customer_profiles
for each row execute function private.guard_customer_profile_activation();
;
