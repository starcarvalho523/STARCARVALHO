import assert from "node:assert/strict";
import test from "node:test";
import { paymentRouteFailure } from "./payment-route-error.ts";

test("maps payment domain errors without a generic 400", () => {
  assert.deepEqual(paymentRouteFailure(new Error("CUSTOMER_BILLING_DOCUMENT_REQUIRED"), "PAYMENT_REQUEST_FAILED"), { error: "CUSTOMER_BILLING_DOCUMENT_REQUIRED", status: 422 });
  assert.deepEqual(paymentRouteFailure(new Error("PAYMENT_NOT_READY"), "PAYMENT_REQUEST_FAILED"), { error: "PAYMENT_NOT_READY", status: 409 });
  assert.deepEqual(paymentRouteFailure(new Error("AUTHENTICATION_REQUIRED"), "PAYMENT_REQUEST_FAILED"), { error: "AUTHENTICATION_REQUIRED", status: 401 });
});

test("maps Asaas validation and availability errors consistently for PIX and credit", () => {
  assert.deepEqual(paymentRouteFailure(providerHttpError(422), "PAYMENT_REQUEST_FAILED"), { error: "PAYMENT_PROVIDER_VALIDATION_FAILED", status: 422 });
  assert.deepEqual(paymentRouteFailure(providerHttpError(503), "CHECKOUT_REQUEST_FAILED"), { error: "PAYMENT_PROVIDER_UNAVAILABLE", status: 502 });
});

function providerHttpError(status: number) {
  const error = new Error(`ASAAS_HTTP_${status}`);
  error.name = "AsaasPublicError";
  return Object.assign(error, { status });
}

test("keeps unexpected failures as server errors", () => {
  assert.deepEqual(paymentRouteFailure(new Error("unexpected"), "PAYMENT_REQUEST_FAILED"), { error: "PAYMENT_REQUEST_FAILED", status: 500 });
});
