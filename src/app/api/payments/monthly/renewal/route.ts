import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments/provider-factory";
import type { PaymentProvider } from "@/lib/payments/payment-provider";
import { isGeneratedFuturePendingCharge, recurringReactivationUpdate } from "@/lib/payments/monthly-renewal-reactivation";
import { cleanupOrphanedHostedRenewalSetups, prepareMonthlyRenewalNativeCardSetup } from "@/lib/payments/monthly-renewal-native-card";
import { reconcileMonthlyRenewalFromAuthenticatedPaymentEvent } from "@/lib/payments/monthly-renewal-payment-event-reconcile";
import { classifyRenewalActionError, errorCode } from "@/lib/payments/monthly-renewal-errors";

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

async function cancelGeneratedFuturePendingCharges(provider:PaymentProvider,providerSubscriptionId:string,nextBillingDate:string){
  if(!provider.listRecurringSubscriptionPayments)throw new Error("RECURRING_PAYMENT_LIST_NOT_SUPPORTED");
  const charges=await provider.listRecurringSubscriptionPayments(providerSubscriptionId);
  const pendingFuture=charges.filter((charge)=>isGeneratedFuturePendingCharge(charge,nextBillingDate));
  for(const charge of pendingFuture)await provider.cancelPayment(charge.providerPaymentId);
}

function todayInBahia(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Bahia",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const year=parts.find((part)=>part.type==="year")?.value;
  const month=parts.find((part)=>part.type==="month")?.value;
  const day=parts.find((part)=>part.type==="day")?.value;
  return year&&month&&day?`${year}-${month}-${day}`:new Date().toISOString().slice(0,10);
}

export async function POST(request:Request){
  const attemptId=attemptIdFrom(request);
  try{
    const body=await request.json().catch(()=>({}));
    const subscriptionId=typeof body?.subscriptionId==="string"?body.subscriptionId:"";
    const action=typeof body?.action==="string"?body.action:"";
    if(!subscriptionId||!["ENABLE","DISABLE","CANCEL_AT_PERIOD_END"].includes(action))return Response.json({error:"Solicitação de renovação inválida.",code:"INVALID_RENEWAL_REQUEST",retryable:false,attemptId},{status:400});

    const supabase=await createClient();
    const{data,error}=await supabase.rpc("get_customer_monthly_renewal_context",{target_subscription:subscriptionId});
    if(error)throw new Error(error.message);
    const context=data as RenewalContext;
    const provider=getPaymentProvider();

    if(context.renewalProvider&&context.renewalProvider!=="ASAAS")return Response.json({error:"O provedor desta renovação não é compatível com esta ação.",code:"RENEWAL_PROVIDER_UNSUPPORTED",retryable:false,attemptId},{status:409});

    if(action==="ENABLE"){
      const{data:hasPending,error:pendingError}=await supabase.rpc("has_customer_monthly_pending_manual_payment",{target_subscription:subscriptionId});
      if(pendingError)throw new Error(pendingError.message);
      if(hasPending===true)return Response.json({error:"Existe um pagamento manual em andamento. Conclua ou troque essa tentativa antes de reativar a renovação automática.",code:"MANUAL_PAYMENT_PENDING",retryable:false,attemptId},{status:409});

      if(!context.providerSubscriptionId){
        const reconciled=await reconcileMonthlyRenewalFromAuthenticatedPaymentEvent(subscriptionId,supabase);
        if(reconciled)return Response.json({renewal:reconciled,reconciled:true,attemptId},{headers:{"cache-control":"no-store"}});

        const cleanup=await cleanupOrphanedHostedRenewalSetups(subscriptionId,supabase);
        const setup=await prepareMonthlyRenewalNativeCardSetup(subscriptionId,supabase);
        return Response.json({setup,cleanup,attemptId},{headers:{"cache-control":"no-store"}});
      }

      if(!context.nextBillingDate||!provider.updateRecurringSubscription||!provider.listRecurringSubscriptionPayments)return Response.json({error:"A renovação ainda não está pronta para esta alteração.",code:"RENEWAL_NOT_READY",retryable:false,attemptId},{status:409});
      if(context.nextBillingDate<=todayInBahia())return Response.json({error:"A próxima cobrança precisa estar em uma data futura para reativar a renovação automática.",code:"INVALID_NEXT_DUE_DATE",retryable:false,attemptId},{status:409});

      await cancelGeneratedFuturePendingCharges(provider,context.providerSubscriptionId,context.nextBillingDate);
      await provider.updateRecurringSubscription(context.providerSubscriptionId,recurringReactivationUpdate(context.nextBillingDate));
      const{data:updated,error:updateError}=await supabase.rpc("set_customer_monthly_auto_renew",{target_subscription:subscriptionId,target_enabled:true});
      if(updateError){
        try{
          await provider.updateRecurringSubscription(context.providerSubscriptionId,{status:"INACTIVE"});
          await cancelGeneratedFuturePendingCharges(provider,context.providerSubscriptionId,context.nextBillingDate);
        }catch(rollbackError){console.error("MONTHLY_RENEWAL_ENABLE_ROLLBACK_FAILED",{attemptId,code:errorCode(rollbackError).slice(0,100)})}
        throw new Error(updateError.message);
      }
      return Response.json({renewal:updated,attemptId});
    }

    if(action==="DISABLE"){
      if(context.providerSubscriptionId&&context.nextBillingDate&&provider.updateRecurringSubscription){
        await provider.updateRecurringSubscription(context.providerSubscriptionId,{status:"INACTIVE"});
        await cancelGeneratedFuturePendingCharges(provider,context.providerSubscriptionId,context.nextBillingDate);
      }
      const{data:updated,error:updateError}=await supabase.rpc("set_customer_monthly_auto_renew",{target_subscription:subscriptionId,target_enabled:false});
      if(updateError){
        if(context.providerSubscriptionId&&context.nextBillingDate&&provider.updateRecurringSubscription){
          try{await provider.updateRecurringSubscription(context.providerSubscriptionId,recurringReactivationUpdate(context.nextBillingDate))}catch(rollbackError){console.error("MONTHLY_RENEWAL_DISABLE_ROLLBACK_FAILED",{attemptId,code:errorCode(rollbackError).slice(0,100)})}
        }
        throw new Error(updateError.message);
      }
      return Response.json({renewal:updated,attemptId});
    }

    if(context.providerSubscriptionId&&provider.cancelRecurringSubscription)await provider.cancelRecurringSubscription(context.providerSubscriptionId);
    const{data:updated,error:updateError}=await supabase.rpc("cancel_customer_monthly_subscription_at_period_end",{target_subscription:subscriptionId});
    if(updateError)throw new Error(updateError.message);

    if(context.providerSubscriptionId){
      const admin=createAdminClient();
      const{error:bindingError}=await admin.from("monthly_recurring_provider_bindings").update({
        authorization_status:"CANCELLED",
        updated_at:new Date().toISOString(),
      }).eq("subscription_id",subscriptionId).eq("method","CREDIT_CARD").eq("provider_subscription_id",context.providerSubscriptionId);
      if(bindingError)throw new Error(`RENEWAL_BINDING_CANCEL_${bindingError.message}`);
    }

    return Response.json({renewal:updated,attemptId});
  }catch(error){
    const policy=classifyRenewalActionError(error);
    console.error("MONTHLY_RENEWAL_ACTION_FAILED",{attemptId,code:errorCode(error).slice(0,100),publicCode:policy.code,status:policy.status});
    return Response.json({error:policy.message,code:policy.code,retryable:policy.retryable,attemptId},{status:policy.status});
  }
}

function attemptIdFrom(request:Request){
  const provided=request.headers.get("x-renewal-attempt-id")?.trim();
  return provided&&/^[A-Za-z0-9_-]{8,64}$/.test(provided)?provided:crypto.randomUUID();
}
