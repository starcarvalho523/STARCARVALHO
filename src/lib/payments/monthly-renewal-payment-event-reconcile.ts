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
  provider_customer_id:string|null;
};

type IgnoredProviderEvent={
  id:number;
  provider_event_id:string;
  provider_payment_id:string|null;
  sanitized_payload:unknown;
};

export async function reconcileMonthlyRenewalFromAuthenticatedPaymentEvent(subscriptionId:string,userClient:SupabaseClient){
  const{data:rawContext,error:contextError}=await userClient.rpc("get_customer_monthly_renewal_context",{target_subscription:subscriptionId});
  if(contextError)throw new Error(contextError.message);
  const context=rawContext as RenewalContext;
  if(context.status!=="ACTIVE")throw new Error("RENEWAL_SUBSCRIPTION_NOT_ACTIVE");
  if(context.autoRenew&&context.providerSubscriptionId)return{reconciled:true,alreadyActive:true,providerSubscriptionId:context.providerSubscriptionId,nextBillingDate:context.nextBillingDate};
  if(context.providerSubscriptionId)return null;

  const admin=createAdminClient();
  const{data:period,error:periodError}=await admin
    .from("monthly_billing_periods")
    .select("id,amount,period_end")
    .eq("subscription_id",subscriptionId)
    .eq("status","PAID")
    .order("period_end",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(periodError)throw new Error(`RENEWAL_EVENT_PERIOD_LOOKUP_${periodError.message}`);
  if(!period?.id||!period.period_end)throw new Error("RENEWAL_PAID_COVERAGE_REQUIRED");

  const provider=getPaymentProvider();
  if(provider.name!=="ASAAS")throw new Error("RENEWAL_PROVIDER_UNSUPPORTED");
  const{data:rawCustomer,error:customerError}=await admin.rpc("get_payment_customer_context",{
    subject_type:"MONTHLY_BILLING_PERIOD",
    subject_id:period.id,
    target_provider:provider.name,
    target_environment:provider.environment,
  });
  if(customerError)throw new Error(`RENEWAL_EVENT_CUSTOMER_CONTEXT_${customerError.message}`);
  const customer=rawCustomer as CustomerContext;
  if(!customer.provider_customer_id)return null;

  const expectedAmount=Number(period.amount);
  const expectedNextBillingDate=addDays(String(period.period_end),1);
  const expectedExternalReference=`starcarvalhos:monthly-renewal:${subscriptionId}`;
  const since=new Date(Date.now()-72*60*60*1000).toISOString();
  const{data:events,error:eventsError}=await admin.rpc("list_ignored_monthly_renewal_events",{target_since:since});
  if(eventsError)throw new Error(`RENEWAL_EVENT_LOOKUP_${eventsError.message}`);

  const matches:Array<{event:IgnoredProviderEvent;providerSubscriptionId:string}> = [];
  for(const event of (events??[]) as IgnoredProviderEvent[]){
    const payload=isRecord(event.sanitized_payload)?event.sanitized_payload:null;
    const providerPaymentId=event.provider_payment_id;
    const providerSubscriptionId=payload&&typeof payload.subscriptionId==="string"?payload.subscriptionId:null;
    if(!providerPaymentId||!providerSubscriptionId)continue;
    if(payload?.billingType!=="CREDIT_CARD")continue;
    if(payload?.externalReference!==expectedExternalReference)continue;
    if(Number(payload?.value)!==expectedAmount)continue;

    const snapshot=await provider.getPayment(providerPaymentId);
    if(snapshot.providerPaymentId!==providerPaymentId)continue;
    if(snapshot.subscriptionId!==providerSubscriptionId)continue;
    if(snapshot.billingType!=="CREDIT_CARD")continue;
    if(snapshot.providerCustomerId!==customer.provider_customer_id)continue;
    if(Number(snapshot.amount)!==expectedAmount)continue;
    if(snapshot.dueDate!==expectedNextBillingDate)continue;
    if(snapshot.externalReference!==expectedExternalReference)continue;
    if(!["PENDING","CONFIRMED"].includes(snapshot.providerStatus))continue;

    const{data:otherBinding,error:bindingLookupError}=await admin
      .from("monthly_recurring_provider_bindings")
      .select("subscription_id")
      .eq("provider","ASAAS")
      .eq("provider_subscription_id",providerSubscriptionId)
      .limit(1)
      .maybeSingle();
    if(bindingLookupError)throw new Error(`RENEWAL_EVENT_BINDING_LOOKUP_${bindingLookupError.message}`);
    if(otherBinding&&otherBinding.subscription_id!==subscriptionId)throw new Error("RENEWAL_EVENT_PROVIDER_SUBSCRIPTION_ALREADY_BOUND");
    matches.push({event,providerSubscriptionId});
  }

  if(matches.length===0)return null;
  if(matches.length!==1)throw new Error("RENEWAL_EVENT_RECONCILIATION_AMBIGUOUS");

  const match=matches[0];
  const now=new Date().toISOString();
  const{error:bindingError}=await admin.from("monthly_recurring_provider_bindings").upsert({
    subscription_id:subscriptionId,
    provider:"ASAAS",
    method:"CREDIT_CARD",
    provider_customer_id:customer.provider_customer_id,
    provider_subscription_id:match.providerSubscriptionId,
    authorization_status:"ACTIVE",
    initial_billing_period_id:period.id,
    last_provider_event_id:match.event.provider_event_id,
    last_provider_event_at:now,
    updated_at:now,
  },{onConflict:"subscription_id,method"});
  if(bindingError)throw new Error(`RENEWAL_EVENT_BINDING_${bindingError.message}`);

  const{error:subscriptionError}=await admin.from("monthly_subscriptions").update({
    auto_renew:true,
    preferred_payment_method:"CREDIT_CARD",
    renewal_provider:"ASAAS",
    next_billing_date:expectedNextBillingDate,
    cancel_at_period_end:false,
    updated_at:now,
  }).eq("id",subscriptionId).eq("status","ACTIVE");
  if(subscriptionError){
    await admin.from("monthly_recurring_provider_bindings").delete().eq("subscription_id",subscriptionId).eq("method","CREDIT_CARD").eq("provider_subscription_id",match.providerSubscriptionId);
    throw new Error(`RENEWAL_EVENT_SUBSCRIPTION_${subscriptionError.message}`);
  }

  const{data:marked,error:markError}=await admin.rpc("mark_ignored_monthly_renewal_event_processed",{target_event_id:match.event.id});
  if(markError||marked!==true)throw new Error("RENEWAL_EVENT_MARK_FAILED");

  return{reconciled:true,alreadyActive:false,providerSubscriptionId:match.providerSubscriptionId,nextBillingDate:expectedNextBillingDate};
}

function addDays(value:string,days:number){const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
