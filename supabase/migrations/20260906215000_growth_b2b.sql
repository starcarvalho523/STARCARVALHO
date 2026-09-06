-- Operação Comercial 2.0 — atribuição de aquisição e contratos empresariais

create table if not exists public.customer_acquisition_attribution(
  customer_id uuid primary key references public.customer_profiles(user_id) on delete cascade,
  source text not null check (source in ('GOOGLE','GOOGLE_MAPS','INSTAGRAM','REFERRAL','STOREFRONT','BUSINESS','WHATSAPP','OTHER')),
  campaign text,
  first_touch_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.customer_acquisition_attribution enable row level security;
drop policy if exists acquisition_read_management on public.customer_acquisition_attribution;
create policy acquisition_read_management on public.customer_acquisition_attribution for select to authenticated using (
  customer_id=(select auth.uid())
  or exists(
    select 1 from public.monthly_subscriptions s
    where s.customer_id=customer_acquisition_attribution.customer_id
      and private.has_unit_role(s.unit_id,array['owner','manager']::public.app_role[])
  )
);
revoke all on public.customer_acquisition_attribution from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.customer_acquisition_attribution from authenticated;
grant select on public.customer_acquisition_attribution to authenticated;
grant all on public.customer_acquisition_attribution to service_role;

create table if not exists public.business_accounts(
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 160),
  trade_name text,
  tax_document text unique check (tax_document is null or tax_document ~ '^[0-9]{14}$'),
  contact_name text,
  contact_email text,
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_parking_contracts(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_accounts(id) on delete restrict,
  unit_id uuid not null references public.parking_units(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','SUSPENDED','CANCELED','ENDED')),
  price numeric(12,2) not null check (price>0),
  starts_on date not null,
  ends_on date,
  max_registered_vehicles integer not null default 1 check (max_registered_vehicles>0),
  max_simultaneous_vehicles integer not null default 1 check (max_simultaneous_vehicles>0),
  guaranteed_spaces integer not null default 0 check (guaranteed_spaces>=0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on>=starts_on),
  check (max_simultaneous_vehicles<=max_registered_vehicles),
  check (guaranteed_spaces<=max_simultaneous_vehicles)
);

create table if not exists public.business_contract_vehicles(
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.business_parking_contracts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  valid_from date not null default current_date,
  valid_until date,
  created_at timestamptz not null default now(),
  unique(contract_id,vehicle_id),
  check(valid_until is null or valid_until>=valid_from)
);

create index if not exists business_contracts_unit_status_idx on public.business_parking_contracts(unit_id,status);
create index if not exists business_contract_vehicles_contract_idx on public.business_contract_vehicles(contract_id,valid_until);

alter table public.business_accounts enable row level security;
alter table public.business_parking_contracts enable row level security;
alter table public.business_contract_vehicles enable row level security;

drop policy if exists business_contracts_read_management on public.business_parking_contracts;
create policy business_contracts_read_management on public.business_parking_contracts for select to authenticated using (
  private.has_unit_role(unit_id,array['owner','manager','finance','auditor']::public.app_role[])
);
drop policy if exists business_accounts_read_management on public.business_accounts;
create policy business_accounts_read_management on public.business_accounts for select to authenticated using (
  exists(
    select 1 from public.business_parking_contracts c
    where c.business_id=business_accounts.id
      and private.has_unit_role(c.unit_id,array['owner','manager','finance','auditor']::public.app_role[])
  )
);
drop policy if exists business_contract_vehicles_read_management on public.business_contract_vehicles;
create policy business_contract_vehicles_read_management on public.business_contract_vehicles for select to authenticated using (
  exists(
    select 1 from public.business_parking_contracts c
    where c.id=business_contract_vehicles.contract_id
      and private.has_unit_role(c.unit_id,array['owner','manager','finance','auditor']::public.app_role[])
  )
);

revoke all on public.business_accounts,public.business_parking_contracts,public.business_contract_vehicles from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.business_accounts,public.business_parking_contracts,public.business_contract_vehicles from authenticated;
grant select on public.business_accounts,public.business_parking_contracts,public.business_contract_vehicles to authenticated;
grant all on public.business_accounts,public.business_parking_contracts,public.business_contract_vehicles to service_role;

create or replace function public.create_business_parking_contract(
  target_unit uuid,business_legal_name text,business_trade_name text,business_tax_document text,
  contract_name text,contract_price numeric,contract_starts_on date,contract_max_registered integer,
  contract_max_simultaneous integer,contract_guaranteed_spaces integer
) returns uuid language plpgsql security definer
set search_path=pg_catalog,public,private,auth as $$
declare actor uuid; target_business uuid; new_contract uuid; normalized_document text;
begin
  actor:=private.monthly_assert_admin(target_unit);
  normalized_document:=nullif(regexp_replace(coalesce(business_tax_document,''),'[^0-9]','','g'),'');
  if char_length(btrim(business_legal_name))<2 or char_length(btrim(contract_name))<2
    or contract_price<=0 or contract_max_registered<1 or contract_max_simultaneous<1
    or contract_max_simultaneous>contract_max_registered or contract_guaranteed_spaces<0
    or contract_guaranteed_spaces>contract_max_simultaneous
    or (normalized_document is not null and char_length(normalized_document)<>14)
  then raise exception 'INVALID_BUSINESS_CONTRACT' using errcode='22023'; end if;

  if normalized_document is not null then
    select id into target_business from public.business_accounts where tax_document=normalized_document limit 1;
  end if;
  if target_business is null then
    insert into public.business_accounts(legal_name,trade_name,tax_document)
    values(btrim(business_legal_name),nullif(btrim(business_trade_name),''),normalized_document)
    returning id into target_business;
  end if;

  insert into public.business_parking_contracts(
    business_id,unit_id,name,price,starts_on,max_registered_vehicles,max_simultaneous_vehicles,guaranteed_spaces
  ) values(
    target_business,target_unit,btrim(contract_name),round(contract_price,2),contract_starts_on,
    contract_max_registered,contract_max_simultaneous,contract_guaranteed_spaces
  ) returning id into new_contract;

  insert into public.audit_logs(actor_user_id,unit_id,action,metadata)
  values(actor,target_unit,'business.contract.created',jsonb_build_object(
    'business_id',target_business,'contract_id',new_contract,'price',round(contract_price,2)
  ));
  return new_contract;
end $$;

revoke all on function public.create_business_parking_contract(uuid,text,text,text,text,numeric,date,integer,integer,integer) from public,anon;
grant execute on function public.create_business_parking_contract(uuid,text,text,text,text,numeric,date,integer,integer,integer) to authenticated;
