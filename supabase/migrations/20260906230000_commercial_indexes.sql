-- Operação Comercial 2.0 — índices dos relacionamentos mais consultados
create index if not exists business_contract_vehicles_vehicle_idx
  on public.business_contract_vehicles(vehicle_id,valid_until);
create index if not exists business_parking_contracts_business_idx
  on public.business_parking_contracts(business_id,status);
create index if not exists acquisition_customer_idx
  on public.customer_acquisition_attribution(customer_id,unit_id);
create index if not exists parking_demand_events_zone_idx
  on public.parking_demand_events(zone_id,occurred_at desc)
  where zone_id is not null;
