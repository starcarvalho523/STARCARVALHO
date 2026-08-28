import assert from "node:assert/strict";
import test from "node:test";
import { createAsaasPixAutomaticAuthorization } from "./asaas-pix-automatic-client";
import { parseAsaasPixAutomaticWebhook } from "./asaas-pix-automatic-contract";

test("Pix Automatic client is disabled by default", async () => {
  await assert.rejects(
    () => createAsaasPixAutomaticAuthorization({ customerId:"cus_1", contractId:"sc123", value:400, startDate:"2026-08-28", description:"Mensalidade Star Carvalhos" }, { env:{} as NodeJS.ProcessEnv }),
    /ASAAS_PIX_AUTOMATIC_DISABLED/,
  );
});

test("Pix Automatic client sends monthly subscription authorization and normalizes QR", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const fetcher: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({
      id:"aut_123", status:"CREATED",
      immediateQrCode:{ payload:"000201-test", encodedImage:"base64-image", expirationDate:"2026-08-29T00:00:00Z" },
    }), { status:200, headers:{"content-type":"application/json"} });
  };
  const env = {
    ASAAS_PIX_AUTOMATIC_ENABLED:"true",
    ASAAS_ENVIRONMENT:"sandbox",
    ASAAS_API_KEY:"sandbox-key",
  } as NodeJS.ProcessEnv;

  const result = await createAsaasPixAutomaticAuthorization({ customerId:"cus_1", contractId:"sc123", value:400, startDate:"2026-08-28", description:"Mensalidade Star Carvalhos" }, { env, fetcher });
  assert.equal(result.id,"aut_123");
  assert.equal(result.qrCodePayload,"000201-test");
  assert.equal(result.qrCodeImageBase64,"base64-image");
  assert.equal(requestBody?.frequency,"MONTHLY");
  assert.equal(requestBody?.paymentCreationMode,"SUBSCRIPTION");
  assert.equal(requestBody?.retryPolicy,"ALLOW_THREE_IN_SEVEN_DAYS");
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
