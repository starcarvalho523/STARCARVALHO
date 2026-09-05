import assert from "node:assert/strict";
import test from "node:test";
import{resolvePaymentRoute}from"./payment-routing.ts";

test("parking PIX is Efí and monthly PIX remains Asaas",()=>{
  assert.equal(resolvePaymentRoute({obligationType:"PARKING_SESSION",method:"PIX",channel:"QR"}).provider,"EFI");
  assert.equal(resolvePaymentRoute({obligationType:"MONTHLY_BILLING_PERIOD",method:"PIX",channel:"QR"}).provider,"ASAAS");
});

test("hosted credit card remains Asaas",()=>{
  assert.equal(resolvePaymentRoute({obligationType:"PARKING_SESSION",method:"CREDIT_CARD",channel:"HOSTED_CHECKOUT"}).provider,"ASAAS");
  assert.equal(resolvePaymentRoute({obligationType:"MONTHLY_BILLING_PERIOD",method:"CREDIT_CARD",channel:"HOSTED_CHECKOUT"}).provider,"ASAAS");
});
