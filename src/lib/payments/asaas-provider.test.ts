import assert from "node:assert/strict";
import test from "node:test";
import { AsaasProvider, mapAsaasPaymentState } from "./asaas-provider.ts";

const payment={id:"pay_test",customer:"cus_test",status:"PENDING",value:5,externalReference:"starcarvalhos:parking:test",invoiceUrl:"https://sandbox.asaas.com/i/test"};
test("provider is sandbox locked and creates PIX with QR data",async()=>{const calls:string[]=[];const fetcher:typeof fetch=async(input)=>{const url=String(input);calls.push(url);return Response.json(url.endsWith("/pixQrCode")?{payload:"pix-copy",encodedImage:"base64",expirationDate:"2026-08-10T23:59:59Z"}:payment)};const provider=new AsaasProvider({environment:"sandbox",apiKey:"sandbox-key",baseUrl:"https://api-sandbox.asaas.com/v3",fetcher});const charge=await provider.createPixCharge({customerId:"cus_test",amount:5,dueDate:"2026-08-09",description:"Teste",externalReference:"starcarvalhos:parking:test"});assert.equal(charge.qrCodePayload,"pix-copy");assert.equal(calls.length,2)});
test("production base URL is refused",()=>assert.throws(()=>new AsaasProvider({environment:"sandbox",apiKey:"x",baseUrl:"https://api.asaas.com/v3"}),/ASAAS_SANDBOX_ONLY/));
test("webhook token uses exact comparison",()=>{const provider=new AsaasProvider({environment:"sandbox",apiKey:"x",baseUrl:"https://api-sandbox.asaas.com/v3"});assert.equal(provider.validateWebhook("a".repeat(32),"a".repeat(32)),true);assert.equal(provider.validateWebhook("b".repeat(32),"a".repeat(32)),false)});
test("only received maps PIX to paid",()=>{assert.equal(mapAsaasPaymentState("CONFIRMED","PAYMENT_CONFIRMED"),"PENDING");assert.equal(mapAsaasPaymentState("RECEIVED","PAYMENT_RECEIVED"),"PAID")});
test("invalid webhook is rejected",()=>{const provider=new AsaasProvider({environment:"sandbox",apiKey:"x",baseUrl:"https://api-sandbox.asaas.com/v3"});assert.throws(()=>provider.parseWebhook({event:"PAYMENT_RECEIVED"}),/INVALID_ASAAS_WEBHOOK/)});

