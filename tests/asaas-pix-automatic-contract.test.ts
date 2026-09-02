import assert from "node:assert/strict";
import test from "node:test";
import { parseAsaasPixAutomaticWebhook } from "../src/lib/payments/asaas-pix-automatic-contract";

test("parses authorization webhook", () => {
  const event = parseAsaasPixAutomaticWebhook({
    id: "evt_1",
    event: "PIX_AUTOMATIC_AUTHORIZATION_STATUS_CHANGED",
    dateCreated: "2026-08-28T00:00:00Z",
    authorization: { id: "auth_1", status: "ACTIVE" },
    subscription: { id: "sub_1" },
  });
  assert.equal(event.id, "evt_1");
  assert.equal(event.authorizationId, "auth_1");
  assert.equal(event.subscriptionId, "sub_1");
  assert.equal(event.status, "ACTIVE");
});

test("rejects payload without provider event id", () => {
  assert.throws(() => parseAsaasPixAutomaticWebhook({ event: "X" }), /EVENT_ID_REQUIRED/);
});
