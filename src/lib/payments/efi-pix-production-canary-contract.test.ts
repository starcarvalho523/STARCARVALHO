import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260827123000_efi_pix_production_canary.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../../app/api/payments/efi-pix/route.ts", import.meta.url), "utf8");
const availability = readFileSync(new URL("./payment-availability.ts", import.meta.url), "utf8");
const customerData = readFileSync(new URL("../customer-data.ts", import.meta.url), "utf8");

test("Pix Production canary migration creates no active canary row", () => {
  assert.match(migration, /create table if not exists private\.efi_pix_production_canary_sessions/);
  assert.doesNotMatch(migration, /insert\s+into\s+private\.efi_pix_production_canary_sessions/i);
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /expires_at timestamptz not null/);
});

test("Pix Production canary is bound to exact owner and payment-ready state", () => {
  assert.match(migration, /c\.session_id = target_session/);
  assert.match(migration, /c\.actor_id = target_actor/);
  assert.match(migration, /c\.expires_at > now\(\)/);
  assert.match(migration, /s\.customer_owner_id = target_actor/);
  assert.match(migration, /s\.status = 'PAYMENT_PENDING'/);
  assert.match(migration, /s\.payment_status = 'PENDING'/);
  assert.match(migration, /s\.financial_obligation = 'REQUIRED'/);
});

test("Pix global capability stays disabled unless READY or exact Production canary authorizes it", () => {
  assert.match(migration, /capability_ready/);
  assert.match(migration, /target_environment = 'PRODUCTION'/);
  assert.match(migration, /production_canary := private\.is_efi_pix_production_canary/);
  assert.match(migration, /not \(capability_enabled or production_canary\)/);
  assert.match(migration, /PAYMENT_METHOD_NOT_AVAILABLE/);
});

test("Pix canary inspection and actor-aware reservation remain service-role only", () => {
  assert.match(migration, /revoke all on function public\.is_efi_pix_production_canary_for_actor\(uuid,uuid\)[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.is_efi_pix_production_canary_for_actor\(uuid,uuid\)[\s\S]*?to service_role/);
  assert.match(migration, /revoke all on function public\.get_or_reserve_efi_pix_payment_for_actor\(uuid,uuid,text\)[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_or_reserve_efi_pix_payment_for_actor\(uuid,uuid,text\)[\s\S]*?to service_role/);
});

test("Pix create route supplies authenticated actor through admin-only reservation", () => {
  assert.match(route, /createAdminClient/);
  assert.match(route, /get_or_reserve_efi_pix_payment_for_actor/);
  assert.match(route, /target_actor: auth\.user\.id/);
  assert.match(route, /target_environment: providerEnvironment/);
});

test("Production Pix UI requires exact canary while regular enabled capability remains supported", () => {
  assert.match(availability, /efiPixProductionCanary\?:boolean/);
  assert.match(availability, /productionCanaryEfiPix/);
  assert.match(availability, /options\.efiPixProductionCanary===true/);
  assert.match(availability, /hasConfiguredCapability\(capabilities,"PIX","QR","EFI"\)/);
  assert.match(availability, /pix:regularEfiPix\|\|productionCanaryEfiPix/);
  assert.match(customerData, /isEfiPixProductionCanaryForActor/);
  assert.match(customerData, /efiPixProductionCanary/);
});
