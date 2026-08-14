import test from "node:test";
import assert from "node:assert/strict";
import { isOperationalFinancialPayment } from "./financial-environment.ts";

test("excludes Asaas while the provider is sandbox-only", () => {
  assert.equal(isOperationalFinancialPayment({ provider: "ASAAS" }), false);
  assert.equal(isOperationalFinancialPayment({ provider: "asaas" }), false);
});

test("keeps manual and non-sandbox-only provider payments operational", () => {
  assert.equal(isOperationalFinancialPayment({ provider: null }), true);
  assert.equal(isOperationalFinancialPayment({ provider: "MERCADO_PAGO" }), true);
});
