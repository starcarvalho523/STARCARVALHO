import assert from "node:assert/strict";
import test from "node:test";
import { isGeneratedFuturePendingCharge, recurringReactivationUpdate } from "./monthly-renewal-reactivation.ts";
import type { ProviderCharge } from "./payment-provider.ts";

const baseCharge:ProviderCharge={
  providerPaymentId:"pay_test",
  providerCustomerId:"cus_test",
  providerStatus:"PENDING",
  billingType:"CREDIT_CARD",
  amount:10,
  externalReference:"",
  hostedPaymentUrl:null,
  qrCodePayload:null,
  qrCodeImageBase64:null,
  expiresAt:null,
  dueDate:"2026-10-02",
  subscriptionId:"sub_test",
};

test("reactivation restores ACTIVE with the next billing date required by Asaas",()=>{
  const update=recurringReactivationUpdate("2026-10-02");
  assert.deepEqual(update,{status:"ACTIVE",nextDueDate:"2026-10-02"});
});

test("only future PENDING credit card recurring charges are cancelable",()=>{
  assert.equal(isGeneratedFuturePendingCharge(baseCharge,"2026-10-02"),true);
  assert.equal(isGeneratedFuturePendingCharge({...baseCharge,providerStatus:"CONFIRMED"},"2026-10-02"),false);
  assert.equal(isGeneratedFuturePendingCharge({...baseCharge,providerStatus:"RECEIVED"},"2026-10-02"),false);
  assert.equal(isGeneratedFuturePendingCharge({...baseCharge,billingType:"PIX"},"2026-10-02"),false);
  assert.equal(isGeneratedFuturePendingCharge({...baseCharge,dueDate:"2026-10-01"},"2026-10-02"),false);
});
