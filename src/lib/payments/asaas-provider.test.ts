import assert from "node:assert/strict";
import test from "node:test";
import { AsaasProvider, AsaasPublicError, mapAsaasPaymentState } from "./asaas-provider.ts";

const payment={id:"pay_test",customer:"cus_test",status:"PENDING",billingType:"PIX",value:5,externalReference:"starcarvalhos:parking:test",invoiceUrl:"https://sandbox.asaas.com/i/test"};
const config={environment:"sandbox" as const,apiKey:"sandbox-key",baseUrl:"https://api-sandbox.asaas.com/v3"};

test("creation and QR retrieval are separate provider operations",async()=>{
  const calls:Array<{url:string;method:string}>=[];
  const fetcher:typeof fetch=async(input,init)=>{const url=String(input);calls.push({url,method:init?.method??"GET"});return Response.json(url.endsWith("/pixQrCode")?{payload:"pix-copy",encodedImage:"base64",expirationDate:"2026-08-10T23:59:59Z"}:payment)};
  const provider=new AsaasProvider({...config,fetcher});
  const charge=await provider.createPixPayment({customerId:"cus_test",amount:5,dueDate:"2026-08-10",description:"Teste",externalReference:payment.externalReference});
  assert.equal(charge.providerPaymentId,"pay_test");
  assert.deepEqual(calls.map(call=>call.method),["POST"]);
  const qr=await provider.getPixQrCode(charge.providerPaymentId);
  assert.equal(qr.qrCodePayload,"pix-copy");
  assert.deepEqual(calls.map(call=>call.method),["POST","GET"]);
});

test("reconciliation locates the existing charge without POST",async()=>{
  const methods:string[]=[];
  const fetcher:typeof fetch=async(_input,init)=>{methods.push(init?.method??"GET");return Response.json({data:[payment]})};
  const provider=new AsaasProvider({...config,fetcher});
  const found=await provider.findPaymentByExternalReference(payment.externalReference);
  assert.equal(found?.providerPaymentId,"pay_test");
  assert.deepEqual(methods,["GET"]);
});

test("reconciliation with zero matches stops after one GET",async()=>{
  const methods:string[]=[];
  const fetcher:typeof fetch=async(_input,init)=>{methods.push(init?.method??"GET");return Response.json({data:[]})};
  const provider=new AsaasProvider({...config,fetcher});
  assert.equal(await provider.findPaymentByExternalReference(payment.externalReference),null);
  assert.deepEqual(methods,["GET"]);
});

test("reconciliation with multiple matches fails without choosing one",async()=>{
  const methods:string[]=[];
  const fetcher:typeof fetch=async(_input,init)=>{methods.push(init?.method??"GET");return Response.json({data:[payment,{...payment,id:"pay_second"}]})};
  const provider=new AsaasProvider({...config,fetcher});
  await assert.rejects(()=>provider.findPaymentByExternalReference(payment.externalReference),/ASAAS_DUPLICATE_EXTERNAL_REFERENCE/);
  assert.deepEqual(methods,["GET"]);
});

test("QR retry reuses the same provider payment id and never posts",async()=>{
  const calls:string[]=[];
  let attempt=0;
  const fetcher:typeof fetch=async(input)=>{calls.push(String(input));attempt++;return attempt===1?Response.json({errors:[{code:"pix_unavailable",description:"Pix temporariamente indisponÃƒÂ­vel"}]},{status:400}):Response.json({payload:"pix-copy",encodedImage:"base64",expirationDate:"2026-08-10T23:59:59Z"})};
  const provider=new AsaasProvider({...config,fetcher});
  await assert.rejects(()=>provider.getPixQrCode("pay_test"),AsaasPublicError);
  const qr=await provider.getPixQrCode("pay_test");
  assert.equal(qr.qrCodePayload,"pix-copy");
  assert.equal(calls.length,2);
  assert.ok(calls.every(url=>url.endsWith("/payments/pay_test/pixQrCode")));
});

test("concurrent QR retries remain GET-only for the same charge",async()=>{
  const methods:string[]=[];
  const fetcher:typeof fetch=async(_input,init)=>{methods.push(init?.method??"GET");return Response.json({payload:"pix-copy",encodedImage:"base64",expirationDate:"2026-08-10T23:59:59Z"})};
  const provider=new AsaasProvider({...config,fetcher});
  await Promise.all([provider.getPixQrCode("pay_test"),provider.getPixQrCode("pay_test")]);
  assert.deepEqual(methods,["GET","GET"]);
});

test("Asaas error keeps only sanitized public details",async()=>{
  const fetcher:typeof fetch=async()=>Response.json({errors:[{code:"invalid_action",description:"Falha\naccess_token=secret-value payload=secret-pix"}],extra:{access_token:"must-not-leak"}},{status:400});
  const provider=new AsaasProvider({...config,fetcher});
  await assert.rejects(
    ()=>provider.getPixQrCode("pay_test"),
    (error:unknown)=>error instanceof AsaasPublicError&&error.status===400&&error.publicCode==="invalid_action"&&error.publicDescription==="Falha [redacted] [redacted]"&&!error.message.includes("secret")
  );
});

test("production base URL is refused",()=>assert.throws(()=>new AsaasProvider({environment:"sandbox",apiKey:"x",baseUrl:"https://api.asaas.com/v3"}),/ASAAS_SANDBOX_ONLY/));
test("credit checkout sends only hosted CREDIT_CARD DETACHED contract",async()=>{const bodies:Record<string,unknown>[]=[];const fetcher:typeof fetch=async(_input,init)=>{bodies.push(JSON.parse(String(init?.body)) as Record<string,unknown>);return Response.json({id:"chk_test",status:"ACTIVE",link:"https://sandbox.asaas.com/checkoutSession/show/chk_test",externalReference:"opaque-ref",minutesToExpire:45})};const provider=new AsaasProvider({...config,fetcher});const result=await provider.createCreditCardCheckout({amount:9.5,description:"Estadia",externalReference:"opaque-ref",expiresInMinutes:45,callback:{successUrl:"https://example.com/s",cancelUrl:"https://example.com/c",expiredUrl:"https://example.com/e"}});const sent=bodies[0];assert.equal(result.amount,9.5);assert.deepEqual(sent.billingTypes,["CREDIT_CARD"]);assert.deepEqual(sent.chargeTypes,["DETACHED"]);assert.equal(sent.minutesToExpire,45);assert.equal("creditCard" in sent,false)});
test("checkout webhook parser ignores card data and keeps identifiers",()=>{const provider=new AsaasProvider({...config,apiKey:"x"});const event=provider.parseCheckoutWebhook({id:"evt_1",event:"CHECKOUT_PAID",checkout:{id:"chk_1",status:"PAID",externalReference:"opaque-ref",creditCard:{number:"never-read"}}});assert.deepEqual(event,{id:"evt_1",type:"CHECKOUT_PAID",checkoutId:"chk_1",checkoutStatus:"PAID",externalReference:"opaque-ref"})});
test("checkout payment reconciliation is GET-only and validates checkout plus payment",async()=>{const calls:Array<{url:string;method:string}>=[];const fetcher:typeof fetch=async(input,init)=>{const url=String(input);calls.push({url,method:init?.method??"GET"});if(url.includes("/checkouts/"))return Response.json({id:"chk_1",status:"PAID",externalReference:"opaque-ref",billingTypes:["CREDIT_CARD"]});return Response.json({data:[{id:"pay_1",customer:"cus_test",status:"CONFIRMED",billingType:"CREDIT_CARD",value:50,externalReference:null}]})};const provider=new AsaasProvider({...config,fetcher});const result=await provider.resolveCheckoutPayment("chk_1","opaque-ref","pay_1");assert.equal(result.providerPaymentId,"pay_1");assert.equal(result.externalReference,"opaque-ref");assert.deepEqual(calls.map(call=>call.method),["GET","GET"])});
test("checkout payment reconciliation rejects a different payment id",async()=>{const fetcher:typeof fetch=async(input)=>String(input).includes("/checkouts/")?Response.json({id:"chk_1",status:"PAID",externalReference:"opaque-ref",billingTypes:["CREDIT_CARD"]}):Response.json({data:[{id:"pay_other",customer:"cus_test",status:"CONFIRMED",billingType:"CREDIT_CARD",value:50}]});const provider=new AsaasProvider({...config,fetcher});await assert.rejects(()=>provider.resolveCheckoutPayment("chk_1","opaque-ref","pay_1"),/ASAAS_CHECKOUT_PAYMENT_NOT_FOUND/)});
test("webhook token uses exact comparison",()=>{const provider=new AsaasProvider({...config,apiKey:"x"});assert.equal(provider.validateWebhook("a".repeat(32),"a".repeat(32)),true);assert.equal(provider.validateWebhook("b".repeat(32),"a".repeat(32)),false)});
test("only received maps PIX to paid",()=>{assert.equal(mapAsaasPaymentState("CONFIRMED","PAYMENT_CONFIRMED"),"PENDING");assert.equal(mapAsaasPaymentState("RECEIVED","PAYMENT_RECEIVED"),"PAID")});
test("invalid webhook is rejected",()=>{const provider=new AsaasProvider({...config,apiKey:"x"});assert.throws(()=>provider.parseWebhook({event:"PAYMENT_RECEIVED"}),/INVALID_ASAAS_WEBHOOK/)});


