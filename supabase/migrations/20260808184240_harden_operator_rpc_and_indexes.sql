create index cash_shifts_operator_idx on public.cash_shifts(operator_id);
create index monthly_subscriptions_customer_idx on public.monthly_subscriptions(customer_id);
create index monthly_subscriptions_vehicle_idx on public.monthly_subscriptions(vehicle_id);
create index parking_sessions_entry_operator_idx on public.parking_sessions(entry_operator_id);
create index parking_sessions_exit_operator_idx on public.parking_sessions(exit_operator_id) where exit_operator_id is not null;
create index parking_sessions_tariff_idx on public.parking_sessions(tariff_rule_id);
create index payments_received_by_idx on public.payments(received_by) where received_by is not null;
create index tariff_rules_created_by_idx on public.tariff_rules(created_by) where created_by is not null;
create index vehicles_customer_idx on public.vehicles(customer_id) where customer_id is not null;

alter function public.calculate_parking_charge(uuid) set schema private;
alter function public.register_parking_entry(uuid,text,public.vehicle_type) set schema private;
alter function public.start_parking_exit(uuid) set schema private;
alter function public.record_manual_payment(uuid,public.parking_payment_method,uuid) set schema private;
alter function public.complete_parking_exit(uuid) set schema private;
alter function public.open_cash_shift(uuid,numeric) set schema private;
alter function public.close_cash_shift(uuid,numeric,text) set schema private;
alter function public.operator_dashboard_summary(uuid) set schema private;

revoke all on function private.calculate_parking_charge(uuid),private.register_parking_entry(uuid,text,public.vehicle_type),private.start_parking_exit(uuid),private.record_manual_payment(uuid,public.parking_payment_method,uuid),private.complete_parking_exit(uuid),private.open_cash_shift(uuid,numeric),private.close_cash_shift(uuid,numeric,text),private.operator_dashboard_summary(uuid) from public,anon;
grant execute on function private.calculate_parking_charge(uuid),private.register_parking_entry(uuid,text,public.vehicle_type),private.start_parking_exit(uuid),private.record_manual_payment(uuid,public.parking_payment_method,uuid),private.complete_parking_exit(uuid),private.open_cash_shift(uuid,numeric),private.close_cash_shift(uuid,numeric,text),private.operator_dashboard_summary(uuid) to authenticated;

create function public.calculate_parking_charge(session_id uuid) returns table(entered_at timestamptz,reference_time timestamptz,duration_minutes integer,tariff_name text,total numeric) language sql stable security invoker set search_path=pg_catalog,private as $$ select * from private.calculate_parking_charge(session_id) $$;
create function public.register_parking_entry(target_unit uuid,raw_plate text,target_vehicle_type public.vehicle_type) returns uuid language sql volatile security invoker set search_path=pg_catalog,private as $$ select private.register_parking_entry(target_unit,raw_plate,target_vehicle_type) $$;
create function public.start_parking_exit(session_id uuid) returns numeric language sql volatile security invoker set search_path=pg_catalog,private as $$ select private.start_parking_exit(session_id) $$;
create function public.record_manual_payment(session_id uuid,payment_method public.parking_payment_method,request_key uuid) returns uuid language sql volatile security invoker set search_path=pg_catalog,private as $$ select private.record_manual_payment(session_id,payment_method,request_key) $$;
create function public.complete_parking_exit(session_id uuid) returns timestamptz language sql volatile security invoker set search_path=pg_catalog,private as $$ select private.complete_parking_exit(session_id) $$;
create function public.open_cash_shift(target_unit uuid,initial_amount numeric) returns uuid language sql volatile security invoker set search_path=pg_catalog,private as $$ select private.open_cash_shift(target_unit,initial_amount) $$;
create function public.close_cash_shift(shift_id uuid,declared_amount numeric,closing_notes text default null) returns numeric language sql volatile security invoker set search_path=pg_catalog,private as $$ select private.close_cash_shift(shift_id,declared_amount,closing_notes) $$;
create function public.operator_dashboard_summary(target_unit uuid) returns jsonb language sql stable security invoker set search_path=pg_catalog,private as $$ select private.operator_dashboard_summary(target_unit) $$;

revoke all on function public.calculate_parking_charge(uuid),public.register_parking_entry(uuid,text,public.vehicle_type),public.start_parking_exit(uuid),public.record_manual_payment(uuid,public.parking_payment_method,uuid),public.complete_parking_exit(uuid),public.open_cash_shift(uuid,numeric),public.close_cash_shift(uuid,numeric,text),public.operator_dashboard_summary(uuid) from public,anon;
grant execute on function public.calculate_parking_charge(uuid),public.register_parking_entry(uuid,text,public.vehicle_type),public.start_parking_exit(uuid),public.record_manual_payment(uuid,public.parking_payment_method,uuid),public.complete_parking_exit(uuid),public.open_cash_shift(uuid,numeric),public.close_cash_shift(uuid,numeric,text),public.operator_dashboard_summary(uuid) to authenticated;
