import assert from "node:assert/strict";
import test from "node:test";
import { canActivateMonthlyCoverage, subscriptionStatusAfterAuthorization } from "../src/lib/payments/monthly-recurring-state";

test("does not activate before first paid billing period", () => {
  assert.equal(canActivateMonthlyCoverage({
    subscriptionStatus: "PENDING_ACTIVATION",
    authorizationStatus: "ACTIVE",
    billingPeriodStatus: "PENDING",
  }), false);
});

test("activates only with active authorization and paid period", () => {
  assert.equal(canActivateMonthlyCoverage({
    subscriptionStatus: "PENDING_ACTIVATION",
    authorizationStatus: "ACTIVE",
    billingPeriodStatus: "PAID",
  }), true);
});

test("provider cancellation suspends but never reopens canceled internal contract", () => {
  assert.equal(subscriptionStatusAfterAuthorization("ACTIVE", "CANCELLED"), "SUSPENDED");
  assert.equal(subscriptionStatusAfterAuthorization("CANCELED", "ACTIVE"), "CANCELED");
});
