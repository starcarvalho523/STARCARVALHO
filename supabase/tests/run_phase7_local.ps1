$ErrorActionPreference = "Stop"
if (-not $env:PGPASSWORD) { throw "PGPASSWORD não configurado" }
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$dropdb = "C:\Program Files\PostgreSQL\17\bin\dropdb.exe"
$createdb = "C:\Program Files\PostgreSQL\17\bin\createdb.exe"
$database = "starcarvalho_phase7_local"
$connection = @("-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", $database)

& $dropdb -h 127.0.0.1 -p 5432 -U postgres --if-exists $database
& $createdb -h 127.0.0.1 -p 5432 -U postgres $database
& $psql @connection -q -f supabase/tests/phase7_local_bootstrap.sql
if ($LASTEXITCODE -ne 0) { throw "Local bootstrap failed" }

$migrations = @(
  "20260807150726_foundation_auth_units.sql", "20260808093557_auth_role_routing_and_profile_trigger.sql",
  "20260808114605_customer_profiles_team_audit.sql", "20260808115413_add_team_foreign_key_indexes.sql",
  "20260808183043_operator_real_operations.sql", "20260808184240_harden_operator_rpc_and_indexes.sql",
  "20260808191300_enforce_parking_capacity.sql", "20260808201655_tariff_management_and_initial_rates.sql",
  "20260808225334_audit_hardening_and_branding.sql", "20260808235230_add_history_indexes.sql",
  "20260808235828_fix_customer_history_rls_recursion.sql", "20260809000004_consolidate_history_policies.sql",
  "20260809154702_customer_secure_charge_summary.sql", "20260809232522_payment_provider_foundation.sql",
  "20260809233505_fix_provider_function_grants.sql", "20260809233705_secure_provider_service_wrappers.sql",
  "20260809233841_explicit_deny_provider_table_access.sql", "20260810090032_recoverable_pix_qr_flow.sql",
  "20260810232950_financial_architecture_phase1.sql", "20260811010950_asaas_credit_checkout_phase2.sql",
  "20260811020847_fix_reserve_credit_checkout_wrapper_permissions.sql", "20260811023800_fix_get_credit_checkout_wrapper_permissions.sql",
  "20260811033927_expire_stale_credit_checkout.sql", "20260811035840_reconcile_asaas_checkout_payment_webhooks.sql",
  "20260811043000_checkout_event_reprocessing.sql", "20260811190000_mercado_pago_point_foundation.sql",
  "20260811133958_terminal_assignments_assigned_by_index.sql", "20260811210000_monthly_subscriptions_core.sql",
  "20260811150130_monthly_subscription_vehicles_subscription_index.sql", "20260811230000_operator_monthly_coverage.sql"
)
foreach ($migration in $migrations) { & $psql @connection -q -f (Join-Path "supabase/migrations" $migration); if ($LASTEXITCODE -ne 0) { throw "Migration failed: $migration" } }

# Seven historical parking payments exist before Phase 7, matching production's
# verified cardinality. Their business columns are fingerprinted before/after.
& $psql @connection -q -f supabase/tests/phase7_historical_payments_seed.sql
if ($LASTEXITCODE -ne 0) { throw "Historical seed failed" }
$before = & $psql @connection -Atc "select md5(string_agg(id::text||':'||parking_session_id::text||':'||amount::text||':'||method::text||':'||status::text||':'||payment_channel::text||':'||coalesce(provider,''),',' order by id)) from public.payments;"
& $psql @connection -f supabase/migrations/20260812010000_monthly_billing_payments.sql
if ($LASTEXITCODE -ne 0) { throw "Phase 7 migration failed" }
$after = & $psql @connection -Atc "select md5(string_agg(id::text||':'||parking_session_id::text||':'||amount::text||':'||method::text||':'||status::text||':'||payment_channel::text||':'||coalesce(provider,''),',' order by id)) from public.payments where payment_subject_type='PARKING_SESSION';"
if ($before -ne $after) { throw "Historical payment fingerprint changed" }

& $psql @connection -f supabase/tests/operator_monthly_coverage_seed.sql
& $psql @connection -f supabase/tests/monthly_billing_payments_seed.sql
& $psql @connection -f supabase/tests/monthly_billing_payments.sql
if ($LASTEXITCODE -ne 0) { throw "Phase 7 SQL assertions failed" }
Write-Output "PHASE7_LOCAL_SCHEMA_READY fingerprint=$after"
