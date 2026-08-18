import test from "node:test";
import assert from "node:assert/strict";
import { AsaasProvider } from "./asaas-provider.ts";

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}})}

test("finds an existing Asaas customer by externalReference",async()=>{
  const calls:Array<{url:string;init:RequestInit}>=[];
  const provider=new AsaasProvider({apiKey:"sandbox-key",baseUrl:"https://api-sandbox.asaas.com/v3",environment:"sandbox",fetcher:async(url,init={})=>{calls.push({url:String(url),init});return json({data:[{id:"cus_existing",externalReference:"starcarvalhos:user-1"}]})}});
  const customer=await provider.findCustomerByExternalReference("starcarvalhos:user-1");
  assert.equal(customer?.providerCustomerId,"cus_existing");
  assert.match(calls[0].url,/\/customers\?/);
  assert.match(calls[0].url,/externalReference=starcarvalhos%3Auser-1/);
});

test("creates one Asaas customer with the Star Carvalhos external reference",async()=>{
  let captured:Record<string,unknown>|null=null;
  const provider=new AsaasProvider({apiKey:"sandbox-key",baseUrl:"https://api-sandbox.asaas.com/v3",environment:"sandbox",fetcher:async(url,init={})=>{assert.equal(String(url),"https://api-sandbox.asaas.com/v3/customers");captured=JSON.parse(String(init.body));return json({id:"cus_new",externalReference:"starcarvalhos:user-2"})}});
  const customer=await provider.createCustomer({name:"Cliente Teste",cpfCnpj:"52998224725",email:"cliente@example.com",externalReference:"starcarvalhos:user-2"});
  assert.equal(customer.providerCustomerId,"cus_new");
  assert.equal(captured?.externalReference,"starcarvalhos:user-2");
  assert.equal(captured?.cpfCnpj,"52998224725");
});

test("passes the persisted customer id to hosted card checkout",async()=>{
  let captured:Record<string,unknown>|null=null;
  const provider=new AsaasProvider({apiKey:"sandbox-key",baseUrl:"https://api-sandbox.asaas.com/v3",environment:"sandbox",fetcher:async(url,init={})=>{assert.equal(String(url),"https://api-sandbox.asaas.com/v3/checkouts");captured=JSON.parse(String(init.body));return json({id:"chk_1",status:"ACTIVE",link:"https://sandbox.asaas.test/checkout/chk_1",externalReference:"checkout-ref"})}});
  await provider.createCreditCardCheckout({customerId:"cus_bound",amount:50,description:"Pagamento de estadia",externalReference:"checkout-ref",expiresInMinutes:45,callback:{successUrl:"https://example.com/success",cancelUrl:"https://example.com/cancel",expiredUrl:"https://example.com/expired"}});
  assert.equal(captured?.customer,"cus_bound");
});
