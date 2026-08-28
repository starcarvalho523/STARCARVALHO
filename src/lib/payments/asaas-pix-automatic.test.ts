import assert from "node:assert/strict";
import test from "node:test";
import { createAsaasPixAutomaticAuthorization, createAsaasPixAutomaticCharge } from "./asaas-pix-automatic-client";
import { parseAsaasPixAutomaticWebhook } from "./asaas-pix-automatic-contract";

test("Pix Automatic client is disabled by default", async () => {
  await assert.rejects(
    () => createAsaasPixAutomaticAuthorization({ customerId:"cus_1", contractId:"sc123", value:400, startDate:"2026-08-28", description:"Mensalidade Star Carvalhos" }, { env:{} as NodeJS.ProcessEnv }),
    /ASAAS_PIX_AUTOMATIC_DISABLED/,
  );
});

test("Pix Automatic client uses MANUAL mode and normalizes QR reconciliation", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const fetcher: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({
      id:"aut_123", status:"CREATED",
      immediateQrCode:{ payload:"000201-test", encodedImage:"base64-image", expirationDate:"2026-08-29T00:00:00Z", conciliationIdentifier:"ASAAS-CONC-123" },
    }), { status:200, headers:{"content-type":"application/json"} });
  };
  const env = { ASAAS_PIX_AUTOMATIC_ENABLED:"true", ASAAS_ENVIRONMENT:"sandbox", ASAAS_API_KEY:"sandbox-key" } as NodeJS.ProcessEnv;

  const result = await createAsaasPixAutomaticAuthorization({ customerId:"cus_1", contractId:"sc123", value:400, startDate:"2026-08-28", description:"Mensalidade Star Carvalhos" }, { env, fetcher });
  assert.equal(result.id,"aut_123");
  assert.equal(result.qrCodePayload,"000201-test");
  assert.equal(result.conciliationIdentifier,"ASAAS-CONC-123");
  assert.equal(requestBody?.frequency,"MONTHLY");
  assert.equal(requestBody?.paymentCreationMode,"MANUAL");
  assert.equal(requestBody?.retryPolicy,"ALLOW_THREE_IN_SEVEN_DAYS");
});

test("recurring charge is explicitly linked to Pix Automatic authorization", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const fetcher: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ id:"pay_1", customer:"cus_1", status:"PENDING", value:400, externalReference:"monthly:period-1" }), { status:200, headers:{"content-type":"application/json"} });
  };
  const env = { ASAAS_PIX_AUTOMATIC_ENABLED:"true", ASAAS_ENVIRONMENT:"sandbox", ASAAS_API_KEY:"sandbox-key" } as NodeJS.ProcessEnv;
  const result = await createAsaasPixAutomaticCharge({ customerId:"cus_1", authorizationId:"aut_123", amount:400, dueDate:"2026-09-05", description:"Mensalidade Star Carvalhos", externalReference:"monthly:period-1" }, { env, fetcher });
  assert.equal(result.id,"pay_1");
  assert.equal(requestBody?.billingType,"PIX");
  assert.equal(requestBody?.pixAutomaticAuthorizationId,"aut_123");
  assert.equal(requestBody?.externalReference,"monthly:period-1");
});

test("authorization webhook maps CREATED to PENDING", () => {
  const event = parseAsaasPixAutomaticWebhook({ id:"evt_1", event:"PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED", authorization:{id:"aut_1",status:"CREATED"}, dateCreated:"2026-08-28T00:00:00Z" });
  assert.equal(event.authorizationId,"aut_1");
  assert.equal(event.status,"PENDING");
});

test("payment instruction webhook correlates nested authorization without changing authorization state", () => {
  const event = parseAsaasPixAutomaticWebhook({ id:"evt_2", event:"PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED", paymentInstruction:{ authorization:{id:"aut_2",status:"ACTIVE"} } });
  assert.equal(event.authorizationId,"aut_2");
  assert.equal(event.status,null);
});
