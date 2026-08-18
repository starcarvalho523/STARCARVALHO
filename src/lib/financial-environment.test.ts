import test from "node:test";
import assert from "node:assert/strict";
import { isOperationalFinancialPayment } from "./financial-environment.ts";

test("excludes Asaas sandbox and unclassified payments from operational revenue", () => {
  assert.equal(isOperationalFinancialPayment({ provider: "ASAAS", provider_environment: "SANDBOX" }), false);
  assert.equal(isOperationalFinancialPayment({ provider: "asaas", provider_environment: null }), false);
});

test("includes only persisted Asaas production payments as operational revenue", () => {
  assert.equal(isOperationalFinancialPayment({ provider: "ASAAS", provider_environment: "PRODUCTION" }), true);
});

test("keeps manual and non-Asaas provider payments operational", () => {
  assert.equal(isOperationalFinancialPayment({ provider: null }), true);
  assert.equal(isOperationalFinancialPayment({ provider: "MERCADO_PAGO" }), true);
});
