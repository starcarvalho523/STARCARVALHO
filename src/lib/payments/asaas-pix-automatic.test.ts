import assert from "node:assert/strict";
import test from "node:test";
import { createAsaasPixAutomaticAuthorization, createAsaasPixAutomaticCharge } from "./asaas-pix-automatic-client";
import { parseAsaasPixAutomaticWebhook } from "./asaas-pix-automatic-contract";

function sandboxEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ASAAS_PIX_AUTOMATIC_ENABLED:"true",
    ASAAS_ENVIRONMENT:"sandbox",
    ASAAS_API_KEY:"sandbox-key",
  };
}

test("Pix Automatic client is disabled by default", async () => {
  await assert.rejects(
    () => createAsaasPixAutomaticAuthorization(
      { customerId:"cus_1", contractId:"sc123", value:400, startDate:"2026-08-28", description:"Mensalidade Star Carvalhos" },
      { env:{...process.env, ASAAS_PIX_AUTOMATIC_ENABLED:"false"} },
    ),
    /ASAAS_PIX_AUTOMATIC_DISABLED/,
  );
});

test("Pix Automatic client uses MANUAL mode and normalizes QR reconciliation", async () => {
  const requests: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({
      id:"aut_123", status:"CREATED",
      immediateQrCode:{ payload:"000201-test", encodedImage:"base64-image", expirationDate:"2026-08-29T00:00:00Z", conciliationIdentifier:"ASAAS-CONC-123" },
    }), { status:200, headers:{"content-type":"application/json"} });
  };

  const result = await createAsaasPixAutomaticAuthorization(
    { customerId:"cus_1", contractId:"sc123", value:400, startDate:"2026-08-28", description:"Mensalidade Star Carvalhos" },
    { env:sandboxEnv(), fetcher },
  );
  const body=requests[0];
  assert.ok(body);
  assert.equal(result.id,"aut_123");
  assert.equal(result.qrCodePayload,"000201-test");
  assert.equal(result.conciliationIdentifier,"ASAAS-CONC-123");
  assert.equal(body.frequency,"MONTHLY");
  assert.equal(body.paymentCreationMode,"MANUAL");
  assert.equal(body.retryPolicy,"ALLOW_THREE_IN_SEVEN_DAYS");
});

test("recurring charge is explicitly linked to Pix Automatic authorization", async () => {
  const requests: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ id:"pay_1", customer:"cus_1", status:"PENDING", value:400, externalReference:"monthly:period-1" }), { status:200, headers:{"content-type":"application/json"} });
  };
  const result = await createAsaasPixAutomaticCharge(
    { customerId:"cus_1", authorizationId:"aut_123", amount:400, dueDate:"2026-09-05", description:"Mensalidade Star Carvalhos", externalReference:"monthly:period-1" },
    { env:sandboxEnv(), fetcher },
  );
  const body=requests[0];
  assert.ok(body);
  assert.equal(result.id,"pay_1");
  assert.equal(body.billingType,"PIX");
  assert.equal(body.pixAutomaticAuthorizationId,"aut_123");
  assert.equal(body.externalReference,"monthly:period-1");
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
