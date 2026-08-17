import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20260815132350_pre_golive_customer_hardening.sql";
const policyCleanupPath = "supabase/migrations/20260815132410_historical_session_policy_cleanup.sql";
const pendingReasonPath = "supabase/migrations/20260815132420_pending_activation_coverage_reason.sql";
const snapshotFixPath = "supabase/migrations/20260815193500_complete_tariff_snapshot.sql";
const read = (path: string) => readFile(path, "utf8");

test("cash opening rejects zero and negatives at every layer", async () => {
  const [sql, action, form] = await Promise.all([
    read(migrationPath),
    read("src/app/frentista/actions.ts"),
    read("src/components/cash-shift-forms.tsx"),
  ]);
  assert.equal(validOpening("0"), false);
  assert.equal(validOpening("-1"), false);
  assert.equal(validOpening("0.01"), true);
  assert.equal(validOpening("125,50"), true);
  assert.match(sql, /check\s*\(opening_amount\s*>\s*0\)/i);
  assert.match(sql, /initial_amount\s*is\s*null\s+or\s+initial_amount\s*<=\s*0/i);
  assert.match(action, /amount<=0/);
  assert.match(form, /min="0\.01"/);
  assert.match(form, /step="0\.01"/);
  assert.doesNotMatch(form, /defaultValue="0,00"/);
});

test("vehicle claim is auth-bound, idempotent and preserves historical ownership", async () => {
  const [sql, policyCleanup] = await Promise.all([read(migrationPath), read(policyCleanupPath)]);
  assert.match(sql, /customer_owner_id uuid references public\.customer_profiles/);
  assert.match(sql, /new\.customer_owner_id[\s\S]*customer_id[\s\S]*new\.vehicle_id/);
  assert.match(sql, /s\.customer_owner_id=\(select auth\.uid\(\)\)/);
  assert.match(sql, /existing\.customer_id<>actor[\s\S]*VEHICLE_ALREADY_OWNED/);
  assert.match(sql, /update public\.vehicles set customer_id=actor/);
  assert.match(sql, /v\.customer_id is not null and s\.customer_owner_id is null/);
  assert.match(policyCleanup, /drop policy if exists sessions_read_authorized on public\.parking_sessions/i);
  assert.match(policyCleanup, /customer_owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(policyCleanup, /customer_owns_vehicle\(vehicle_id\)/i);
});

test("monthly enrollment stays pre-active until payment and trusts server price", async () => {
  const [sql, automation, pendingReason] = await Promise.all([
    read(migrationPath),
    read("supabase/migrations/20260812235933_monthly_billing_automation.sql"),
    read(pendingReasonPath),
  ]);
  assert.match(sql, /PENDING_ACTIVATION/);
  assert.match(sql, /values\(actor,p\.unit_id,p\.id,p\.name,'PENDING_ACTIVATION'/);
  assert.doesNotMatch(sql, /create_customer_monthly_enrollment\([^)]*price/i);
  assert.match(sql, /new\.status='PAID'[\s\S]*status='ACTIVE'[\s\S]*status='PENDING_ACTIVATION'/);
  assert.match(automation, /s\.status\s*=\s*'ACTIVE'/);
  assert.doesNotMatch(automation, /PENDING_ACTIVATION/);
  assert.match(pendingReason, /AWAITING_FIRST_PAYMENT/);
  assert.match(pendingReason, /candidate\.status='PENDING_ACTIVATION'/);
});

test("casual checkout remains server-priced and ownership protected", async () => {
  const [sql, payments, ui] = await Promise.all([
    read(migrationPath),
    read("src/lib/payments/payment-service.ts"),
    read("src/components/casual-payment-actions.tsx"),
  ]);
  assert.match(sql, /private\.customer_owns_session/);
  assert.match(sql, /customer_owner_id=\(select auth\.uid\(\)\)/);
  assert.match(payments, /reserve_pix_payment/);
  assert.match(payments, /reserve_credit_checkout/);
  assert.doesNotMatch(ui, /amount/);
});

test("parking sessions freeze the complete tariff version", async () => {
  const sql = await read(snapshotFixPath);
  assert.match(sql, /before insert on public\.parking_sessions/i);
  assert.match(sql, /version_number/);
  assert.match(sql, /daily_after_minutes/);
  assert.match(sql, /where t\.id = s\.tariff_rule_id/i);
  assert.match(sql, /new\.tariff_snapshot\s*:=/i);
});

test("mobile shells reserve safe area and dynamic viewport", async () => {
  const [dashboard, customer] = await Promise.all([
    read("src/components/dashboard-shell.tsx"),
    read("src/components/customer-shell.tsx"),
  ]);
  for (const shell of [dashboard, customer]) {
    assert.match(shell, /min-h-dvh/);
    assert.match(shell, /safe-area-inset-bottom/);
  }
});

function validOpening(raw: string) {
  const amount = Number(raw.replace(",", "."));
  return Number.isFinite(amount) && amount > 0;
}
