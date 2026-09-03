import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "./provider-factory";

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

export async function createMonthlyRenewalCardSetup(subscriptionId:string,userClient:SupabaseClient,origin:string){
  const{data:rawContext,error:contextError}=await userClient.rpc("get_customer_monthly_renewal_context",{target_subscription:subscriptionId});
  if(contextError)throw new Error(contextError.message);
  const context=rawContext as RenewalContext;
  if(context.status!=="ACTIVE")throw new Error("RENEWAL_SUBSCRIPTION_NOT_ACTIVE");
  if(context.providerSubscriptionId)return{alreadyBound:true,checkoutUrl:null,nextBillingDate:context.nextBillingDate};

  const admin=createAdminClient();
  const{data:period,error:periodError}=await admin
    .from("monthly_billing_periods")
    .select("id,amount,period_end")
    .eq("subscription_id",subscriptionId)
    .eq("status","PAID")
    .order("period_end",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(periodError)throw new Error(`RENEWAL_PERIOD_LOOKUP_${periodError.message}`);
  if(!period?.id||!period.period_end)throw new Error("RENEWAL_PAID_COVERAGE_REQUIRED");

  const provider=getPaymentProvider();
  if(provider.name!=="ASAAS"||!provider.createCreditCardCheckout)throw new Error("RENEWAL_PROVIDER_UNSUPPORTED");

  const{data:rawCustomer,error:customerError}=await admin.rpc("get_payment_customer_context",{
    subject_type:"MONTHLY_BILLING_PERIOD",
    subject_id:period.id,
    target_provider:provider.name,
    target_environment:provider.environment,
  });
  if(customerError)throw new Error(`RENEWAL_CUSTOMER_CONTEXT_${customerError.message}`);
  const customer=rawCustomer as CustomerContext;
  const document=String(customer.billing_document??"").replace(/\D/g,"");
  if(!/^(?:\d{11}|\d{14})$/.test(document))throw new Error("CUSTOMER_BILLING_DOCUMENT_REQUIRED");

  let providerCustomerId=customer.provider_customer_id;
  if(!providerCustomerId){
    const existing=await provider.findCustomerByExternalReference(customer.external_reference);
    const resolved=existing??await provider.createCustomer({
      name:customer.full_name,
      cpfCnpj:document,
      email:customer.email,
      externalReference:customer.external_reference,
    });
    providerCustomerId=resolved.providerCustomerId;
    const{error:bindError}=await admin.rpc("bind_payment_provider_customer",{
      customer_user_id:customer.user_id,
      target_provider:provider.name,
      target_environment:provider.environment,
      target_provider_customer_id:providerCustomerId,
      target_external_reference:customer.external_reference,
    });
    if(bindError)throw new Error(`RENEWAL_CUSTOMER_BIND_${bindError.message}`);
  }

  const nextBillingDate=addDays(String(period.period_end),1);
  const externalReference=`starcarvalhos:monthly-renewal:${subscriptionId}`;
  const checkout=await provider.createCreditCardCheckout({
    customerId:providerCustomerId,
    amount:Number(period.amount),
    description:"Autorização da renovação automática da mensalidade Star Carvalhos",
    externalReference,
    expiresInMinutes:45,
    callback:{
      successUrl:`${origin}/cliente/mensalidade?renewal=success#renewal-management`,
      cancelUrl:`${origin}/cliente/mensalidade?renewal=cancel#renewal-management`,
      expiredUrl:`${origin}/cliente/mensalidade?renewal=expired#renewal-management`,
    },
    recurrence:{cycle:"MONTHLY",nextDueDate:`${nextBillingDate} 12:00:00`},
  });

  return{alreadyBound:false,checkoutUrl:checkout.link,nextBillingDate};
}

export async function tryProcessMonthlyRenewalCardSetupSubscriptionWebhook(payload:unknown,environment:"SANDBOX"|"PRODUCTION"){
  if(!isRecord(payload)||typeof payload.id!=="string"||typeof payload.event!=="string"||!isRecord(payload.subscription))return false;
  const subscription=payload.subscription;
  const externalReference=typeof subscription.externalReference==="string"?subscription.externalReference:"";
  const match=/^starcarvalhos:monthly-renewal:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(externalReference);
  if(!match)return false;
  if(!["SUBSCRIPTION_CREATED","SUBSCRIPTION_UPDATED"].includes(payload.event))return false;

  const providerSubscriptionId=stringRequired(subscription.id,"ASAAS_RENEWAL_SETUP_SUBSCRIPTION_ID_REQUIRED");
  const providerCustomerId=stringRequired(subscription.customer,"ASAAS_RENEWAL_SETUP_CUSTOMER_ID_REQUIRED");
  const billingType=stringRequired(subscription.billingType,"ASAAS_RENEWAL_SETUP_BILLING_TYPE_REQUIRED");
  const cycle=stringRequired(subscription.cycle,"ASAAS_RENEWAL_SETUP_CYCLE_REQUIRED");
  const status=stringRequired(subscription.status,"ASAAS_RENEWAL_SETUP_STATUS_REQUIRED");
  const nextDueDate=stringRequired(subscription.nextDueDate,"ASAAS_RENEWAL_SETUP_NEXT_DUE_DATE_REQUIRED").slice(0,10);
  const amount=Number(subscription.value);
  if(billingType!=="CREDIT_CARD"||cycle!=="MONTHLY"||status!=="ACTIVE"||!Number.isFinite(amount)||amount<=0)throw new Error("ASAAS_RENEWAL_SETUP_SUBSCRIPTION_INVALID");

  const localSubscriptionId=match[1];
  const admin=createAdminClient();
  const{data:local,error:localError}=await admin
    .from("monthly_subscriptions")
    .select("id,customer_id,status,contracted_price")
    .eq("id",localSubscriptionId)
    .maybeSingle();
  if(localError||!local?.id)throw new Error("ASAAS_RENEWAL_SETUP_LOCAL_SUBSCRIPTION_NOT_FOUND");
  if(local.status!=="ACTIVE"||Number(local.contracted_price)!==amount)throw new Error("ASAAS_RENEWAL_SETUP_LOCAL_SUBSCRIPTION_MISMATCH");

  const{data:period,error:periodError}=await admin
    .from("monthly_billing_periods")
    .select("id,period_end")
    .eq("subscription_id",localSubscriptionId)
    .eq("status","PAID")
    .order("period_end",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(periodError||!period?.id||!period.period_end)throw new Error("ASAAS_RENEWAL_SETUP_PAID_PERIOD_NOT_FOUND");
  const expectedNextBillingDate=addDays(String(period.period_end),1);
  if(nextDueDate!==expectedNextBillingDate)throw new Error("ASAAS_RENEWAL_SETUP_NEXT_DUE_DATE_MISMATCH");

  const{data:rawCustomer,error:customerError}=await admin.rpc("get_payment_customer_context",{
    subject_type:"MONTHLY_BILLING_PERIOD",
    subject_id:period.id,
    target_provider:"ASAAS",
    target_environment:environment,
  });
  if(customerError)throw new Error(`ASAAS_RENEWAL_SETUP_CUSTOMER_CONTEXT_${customerError.message}`);
  const customer=rawCustomer as CustomerContext;
  if(!customer.provider_customer_id||customer.provider_customer_id!==providerCustomerId)throw new Error("ASAAS_RENEWAL_SETUP_CUSTOMER_MISMATCH");

  const{data:existingEvent,error:eventLookupError}=await admin
    .from("monthly_recurring_provider_events")
    .select("processed_at")
    .eq("provider","ASAAS")
    .eq("provider_event_id",payload.id)
    .maybeSingle();
  if(eventLookupError)throw new Error(`ASAAS_RENEWAL_SETUP_EVENT_LOOKUP_${eventLookupError.message}`);
  if(existingEvent?.processed_at)return true;

  const{error:eventInsertError}=await admin.from("monthly_recurring_provider_events").upsert({
    provider:"ASAAS",
    provider_event_id:payload.id,
    event_type:payload.event,
    provider_subscription_id:providerSubscriptionId,
    processing_result:"RECEIVED",
  },{onConflict:"provider,provider_event_id",ignoreDuplicates:true});
  if(eventInsertError)throw new Error(`ASAAS_RENEWAL_SETUP_EVENT_INSERT_${eventInsertError.message}`);

  const now=new Date().toISOString();
  const{error:bindingError}=await admin.from("monthly_recurring_provider_bindings").upsert({
    subscription_id:localSubscriptionId,
    provider:"ASAAS",
    method:"CREDIT_CARD",
    provider_customer_id:providerCustomerId,
    provider_subscription_id:providerSubscriptionId,
    authorization_status:"ACTIVE",
    initial_billing_period_id:period.id,
    last_provider_event_id:payload.id,
    last_provider_event_at:now,
    updated_at:now,
  },{onConflict:"subscription_id,method"});
  if(bindingError)throw new Error(`ASAAS_RENEWAL_SETUP_BINDING_${bindingError.message}`);

  const{error:subscriptionError}=await admin.from("monthly_subscriptions").update({
    auto_renew:true,
    preferred_payment_method:"CREDIT_CARD",
    renewal_provider:"ASAAS",
    next_billing_date:expectedNextBillingDate,
    cancel_at_period_end:false,
    updated_at:now,
  }).eq("id",localSubscriptionId);
  if(subscriptionError)throw new Error(`ASAAS_RENEWAL_SETUP_LOCAL_UPDATE_${subscriptionError.message}`);

  const{error:eventUpdateError}=await admin.from("monthly_recurring_provider_events").update({
    processed_at:now,
    processing_result:"processed",
  }).eq("provider","ASAAS").eq("provider_event_id",payload.id);
  if(eventUpdateError)throw new Error(`ASAAS_RENEWAL_SETUP_EVENT_UPDATE_${eventUpdateError.message}`);
  return true;
}

function addDays(value:string,days:number){const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
function stringRequired(value:unknown,code:string){if(typeof value!=="string"||!value.trim())throw new Error(code);return value}
