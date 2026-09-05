import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "./provider-factory";
import type { CreateRecurringCardSubscriptionInput, PaymentProvider, ProviderRecurringSubscription } from "./payment-provider";

type RenewalContext={
  subscriptionId:string;
  status:string;
  autoRenew:boolean;
  preferredPaymentMethod:string|null;
  renewalProvider:string|null;
  nextBillingDate:string|null;
  cancelAtPeriodEnd:boolean;
  coverageUntil:string|null;
  providerSubscriptionId:string|null;
};

type CustomerContext={
  user_id:string;
  full_name:string;
  email:string|null;
  billing_document:string|null;
  external_reference:string;
  provider_customer_id:string|null;
};

type IgnoredProviderEvent={id:number;provider_event_id:string;provider_payment_id:string|null;sanitized_payload:unknown};

type SetupContext={
  context:RenewalContext;
  period:{id:string;amount:number;period_end:string};
  provider:PaymentProvider;
  customer:CustomerContext;
  providerCustomerId:string;
  nextBillingDate:string;
  externalReference:string;
};

export type NativeRenewalCardPayload={
  creditCard:CreateRecurringCardSubscriptionInput["creditCard"];
  creditCardHolderInfo:CreateRecurringCardSubscriptionInput["creditCardHolderInfo"];
};

export async function prepareMonthlyRenewalNativeCardSetup(subscriptionId:string,userClient:SupabaseClient){
  const setup=await resolveSetupContext(subscriptionId,userClient);
  return{mode:"NATIVE_CARD" as const,amount:setup.period.amount,nextBillingDate:setup.nextBillingDate};
}

export async function cleanupOrphanedHostedRenewalSetups(subscriptionId:string,userClient:SupabaseClient){
  const setup=await resolveSetupContext(subscriptionId,userClient);
  const provider=setup.provider;
  if(!provider.cancelRecurringSubscription||!provider.listRecurringSubscriptionPayments)throw new Error("RENEWAL_PROVIDER_CLEANUP_UNSUPPORTED");

  const since=new Date(Date.now()-72*60*60*1000).toISOString();
  const admin=createAdminClient();
  const{data:events,error:eventsError}=await admin.rpc("list_ignored_monthly_renewal_events",{target_since:since});
  if(eventsError)throw new Error(`RENEWAL_IGNORED_EVENT_LOOKUP_${eventsError.message}`);

  const matches:Array<{event:IgnoredProviderEvent;providerSubscriptionId:string}> = [];
  for(const rawEvent of (events??[]) as IgnoredProviderEvent[]){
    const payload=isRecord(rawEvent.sanitized_payload)?rawEvent.sanitized_payload:null;
    const providerPaymentId=rawEvent.provider_payment_id;
    const providerSubscriptionId=payload&&typeof payload.subscriptionId==="string"?payload.subscriptionId:null;
    const payloadValue=payload&&typeof payload.value==="number"?payload.value:null;
    const payloadExternalReference=payload?.externalReference;
    if(!providerPaymentId||!providerSubscriptionId||payload?.billingType!=="CREDIT_CARD")continue;
    if(payloadExternalReference!==null||Number(payloadValue)!==Number(setup.period.amount))continue;

    const{data:existingBinding,error:bindingLookupError}=await admin
      .from("monthly_recurring_provider_bindings")
      .select("subscription_id")
      .eq("provider","ASAAS")
      .eq("provider_subscription_id",providerSubscriptionId)
      .limit(1)
      .maybeSingle();
    if(bindingLookupError)throw new Error(`RENEWAL_ORPHAN_BINDING_LOOKUP_${bindingLookupError.message}`);
    if(existingBinding)continue;

    try{
      const snapshot=await provider.getPayment(providerPaymentId);
      if(snapshot.providerPaymentId!==providerPaymentId||snapshot.subscriptionId!==providerSubscriptionId||snapshot.billingType!=="CREDIT_CARD")continue;
      if(Number(snapshot.amount)!==Number(setup.period.amount)||snapshot.dueDate!==setup.nextBillingDate)continue;
      if(snapshot.externalReference)continue;
      if(snapshot.providerStatus!=="PENDING")throw new Error("RENEWAL_ORPHAN_REVIEW_REQUIRED");
      matches.push({event:rawEvent,providerSubscriptionId});
    }catch(error){
      if(error instanceof Error&&error.message==="RENEWAL_ORPHAN_REVIEW_REQUIRED")throw error;
    }
  }

  const bySubscription=new Map<string,IgnoredProviderEvent[]>();
  for(const match of matches)bySubscription.set(match.providerSubscriptionId,[...(bySubscription.get(match.providerSubscriptionId)??[]),match.event]);

  let cleaned=0;
  for(const[providerSubscriptionId,matchedEvents]of bySubscription){
    const charges=await provider.listRecurringSubscriptionPayments(providerSubscriptionId);
    const unsafeCharge=charges.find((charge)=>charge.providerStatus!=="PENDING"||charge.billingType!=="CREDIT_CARD"||Number(charge.amount)!==Number(setup.period.amount)||charge.dueDate!==setup.nextBillingDate||Boolean(charge.externalReference));
    if(unsafeCharge)throw new Error("RENEWAL_ORPHAN_REVIEW_REQUIRED");
    for(const charge of charges)await provider.cancelPayment(charge.providerPaymentId);
    await provider.cancelRecurringSubscription(providerSubscriptionId);
    for(const event of matchedEvents){
      const{data:marked,error:markError}=await admin.rpc("mark_ignored_monthly_renewal_event_processed",{target_event_id:event.id});
      if(markError||marked!==true)throw new Error("RENEWAL_ORPHAN_EVENT_MARK_FAILED");
    }
    cleaned+=1;
  }
  return{cleaned};
}

export async function activateMonthlyRenewalWithNativeCard(subscriptionId:string,userClient:SupabaseClient,payload:NativeRenewalCardPayload,remoteIp:string){
  const setup=await resolveSetupContext(subscriptionId,userClient);
  if(setup.context.autoRenew&&setup.context.providerSubscriptionId)return{active:true,nextBillingDate:setup.context.nextBillingDate,alreadyActive:true};
  if(setup.context.providerSubscriptionId)throw new Error("RENEWAL_BINDING_ALREADY_EXISTS");
  if(!setup.provider.createRecurringCardSubscription||!setup.provider.findRecurringSubscriptionByExternalReference)throw new Error("RENEWAL_NATIVE_CARD_UNSUPPORTED");

  await cleanupOrphanedHostedRenewalSetups(subscriptionId,userClient);

  let providerSubscription=await setup.provider.findRecurringSubscriptionByExternalReference(setup.externalReference);
  if(providerSubscription){
    assertProviderSubscription(providerSubscription,setup);
  }else{
    let creationError:unknown=null;
    try{
      await setup.provider.createRecurringCardSubscription({
        customerId:setup.providerCustomerId,
        amount:setup.period.amount,
        nextDueDate:setup.nextBillingDate,
        description:"Renovação automática da mensalidade Star Carvalhos",
        externalReference:setup.externalReference,
        remoteIp,
        creditCard:payload.creditCard,
        creditCardHolderInfo:payload.creditCardHolderInfo,
      });
    }catch(error){
      const code=error instanceof Error?error.message:"UNKNOWN_ERROR";
      if(code!=="ASAAS_RECURRING_SUBSCRIPTION_MISMATCH"&&code!=="RENEWAL_PROVIDER_SUBSCRIPTION_MISMATCH")throw error;
      creationError=error;
    }

    providerSubscription=await resolveCanonicalProviderSubscription(setup);
    if(!providerSubscription){
      if(creationError)throw creationError;
      throw new Error("RENEWAL_PROVIDER_CANONICAL_NOT_FOUND");
    }
    assertProviderSubscription(providerSubscription,setup);
  }

  const admin=createAdminClient();
  const now=new Date().toISOString();
  const{error:bindingError}=await admin.from("monthly_recurring_provider_bindings").upsert({
    subscription_id:subscriptionId,
    provider:"ASAAS",
    method:"CREDIT_CARD",
    provider_customer_id:setup.providerCustomerId,
    provider_subscription_id:providerSubscription.providerSubscriptionId,
    authorization_status:"ACTIVE",
    initial_billing_period_id:setup.period.id,
    last_provider_event_at:now,
    updated_at:now,
  },{onConflict:"subscription_id,method"});
  if(bindingError){
    try{await setup.provider.cancelRecurringSubscription?.(providerSubscription.providerSubscriptionId)}catch{}
    throw new Error(`RENEWAL_NATIVE_BINDING_${bindingError.message}`);
  }

  const{error:subscriptionError}=await admin.from("monthly_subscriptions").update({
    auto_renew:true,
    preferred_payment_method:"CREDIT_CARD",
    renewal_provider:"ASAAS",
    next_billing_date:setup.nextBillingDate,
    cancel_at_period_end:false,
    updated_at:now,
  }).eq("id",subscriptionId).eq("status","ACTIVE");
  if(subscriptionError){
    await admin.from("monthly_recurring_provider_bindings").delete().eq("subscription_id",subscriptionId).eq("method","CREDIT_CARD").eq("provider_subscription_id",providerSubscription.providerSubscriptionId);
    try{await setup.provider.cancelRecurringSubscription?.(providerSubscription.providerSubscriptionId)}catch{}
    throw new Error(`RENEWAL_NATIVE_SUBSCRIPTION_${subscriptionError.message}`);
  }

  return{active:true,nextBillingDate:setup.nextBillingDate,providerSubscriptionId:providerSubscription.providerSubscriptionId};
}

async function resolveCanonicalProviderSubscription(setup:SetupContext){
  if(!setup.provider.findRecurringSubscriptionByExternalReference)return null;
  const delays=[0,200,500,1000,2000];
  for(const delay of delays){
    if(delay>0)await sleep(delay);
    const candidate=await setup.provider.findRecurringSubscriptionByExternalReference(setup.externalReference);
    if(candidate)return candidate;
  }
  return null;
}

async function resolveSetupContext(subscriptionId:string,userClient:SupabaseClient):Promise<SetupContext>{
  const{data:rawContext,error:contextError}=await userClient.rpc("get_customer_monthly_renewal_context",{target_subscription:subscriptionId});
  if(contextError)throw new Error(contextError.message);
  const context=rawContext as RenewalContext;
  if(context.status!=="ACTIVE")throw new Error("RENEWAL_SUBSCRIPTION_NOT_ACTIVE");
  if(context.renewalProvider&&context.renewalProvider!=="ASAAS")throw new Error("RENEWAL_PROVIDER_UNSUPPORTED");

  const admin=createAdminClient();
  const{data:period,error:periodError}=await admin.from("monthly_billing_periods").select("id,amount,period_end").eq("subscription_id",subscriptionId).eq("status","PAID").order("period_end",{ascending:false}).limit(1).maybeSingle();
  if(periodError)throw new Error(`RENEWAL_PERIOD_LOOKUP_${periodError.message}`);
  if(!period?.id||!period.period_end)throw new Error("RENEWAL_PAID_COVERAGE_REQUIRED");

  const provider=getPaymentProvider();
  if(provider.name!=="ASAAS")throw new Error("RENEWAL_PROVIDER_UNSUPPORTED");
  const{data:rawCustomer,error:customerError}=await admin.rpc("get_payment_customer_context",{subject_type:"MONTHLY_BILLING_PERIOD",subject_id:period.id,target_provider:provider.name,target_environment:provider.environment});
  if(customerError)throw new Error(`RENEWAL_CUSTOMER_CONTEXT_${customerError.message}`);
  const customer=rawCustomer as CustomerContext;

  let providerCustomerId=customer.provider_customer_id;
  if(!providerCustomerId){
    const document=String(customer.billing_document??"").replace(/\D/g,"");
    if(!/^(?:\d{11}|\d{14})$/.test(document))throw new Error("CUSTOMER_BILLING_DOCUMENT_REQUIRED");
    const existing=await provider.findCustomerByExternalReference(customer.external_reference);
    const resolved=existing??await provider.createCustomer({name:customer.full_name,cpfCnpj:document,email:customer.email,externalReference:customer.external_reference});
    providerCustomerId=resolved.providerCustomerId;
    const{error:bindError}=await admin.rpc("bind_payment_provider_customer",{customer_user_id:customer.user_id,target_provider:provider.name,target_environment:provider.environment,target_provider_customer_id:providerCustomerId,target_external_reference:customer.external_reference});
    if(bindError)throw new Error(`RENEWAL_CUSTOMER_BIND_${bindError.message}`);
  }

  const amount=Number(period.amount);
  if(!Number.isFinite(amount)||amount<=0)throw new Error("RENEWAL_INVALID_AMOUNT");
  const nextBillingDate=addDays(String(period.period_end),1);
  const shortSubscriptionId=subscriptionId.replace(/-/g,"");
  const shortPeriodId=String(period.id).replace(/-/g,"");
  return{context,period:{id:String(period.id),amount,period_end:String(period.period_end)},provider,customer,providerCustomerId,nextBillingDate,externalReference:`sc:mr:${shortSubscriptionId}:${shortPeriodId}`};
}

function assertProviderSubscription(subscription:ProviderRecurringSubscription,setup:SetupContext){
  const unsafeStatus=subscription.providerStatus==="INACTIVE"||subscription.providerStatus==="EXPIRED";
  if(subscription.providerCustomerId!==setup.providerCustomerId||subscription.billingType!=="CREDIT_CARD"||subscription.cycle!=="MONTHLY"||unsafeStatus||Number(subscription.amount)!==Number(setup.period.amount)||subscription.nextDueDate!==setup.nextBillingDate||subscription.externalReference!==setup.externalReference)throw new Error("RENEWAL_PROVIDER_SUBSCRIPTION_MISMATCH");
}
function sleep(ms:number){return new Promise<void>((resolve)=>setTimeout(resolve,ms))}
function addDays(value:string,days:number){const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
