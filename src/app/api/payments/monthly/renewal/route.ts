import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments/provider-factory";
import type { PaymentProvider } from "@/lib/payments/payment-provider";
import { isGeneratedFuturePendingCharge, recurringReactivationUpdate } from "@/lib/payments/monthly-renewal-reactivation";

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

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const subscriptionId=typeof body?.subscriptionId==="string"?body.subscriptionId:"";
    const action=typeof body?.action==="string"?body.action:"";
    if(!subscriptionId||!["ENABLE","DISABLE","CANCEL_AT_PERIOD_END"].includes(action))return Response.json({error:"INVALID_RENEWAL_REQUEST"},{status:400});

    const supabase=await createClient();
    const{data,error}=await supabase.rpc("get_customer_monthly_renewal_context",{target_subscription:subscriptionId});
    if(error)throw new Error(error.message);
    const context=data as RenewalContext;
    const provider=getPaymentProvider();

    if(context.renewalProvider&&context.renewalProvider!=="ASAAS")return Response.json({error:"RENEWAL_PROVIDER_UNSUPPORTED"},{status:409});

    if(action==="ENABLE"){
      const{data:hasPending,error:pendingError}=await supabase.rpc("has_customer_monthly_pending_manual_payment",{target_subscription:subscriptionId});
      if(pendingError)throw new Error(pendingError.message);
      if(hasPending===true)return Response.json({error:"Existe um pagamento manual em andamento. Conclua ou troque essa tentativa antes de reativar a renovação automática."},{status:409});
      if(!context.providerSubscriptionId||!context.nextBillingDate||!provider.updateRecurringSubscription||!provider.listRecurringSubscriptionPayments)return Response.json({error:"RENEWAL_NOT_READY"},{status:409});

      await cancelGeneratedFuturePendingCharges(provider,context.providerSubscriptionId,context.nextBillingDate);
      await provider.updateRecurringSubscription(context.providerSubscriptionId,recurringReactivationUpdate(context.nextBillingDate));
      const{data:updated,error:updateError}=await supabase.rpc("set_customer_monthly_auto_renew",{target_subscription:subscriptionId,target_enabled:true});
      if(updateError){
        try{
          await provider.updateRecurringSubscription(context.providerSubscriptionId,{status:"INACTIVE"});
          await cancelGeneratedFuturePendingCharges(provider,context.providerSubscriptionId,context.nextBillingDate);
        }catch(rollbackError){console.error("MONTHLY_RENEWAL_ENABLE_ROLLBACK_FAILED",{code:rollbackError instanceof Error?rollbackError.message.slice(0,100):"UNKNOWN"})}
        throw new Error(updateError.message);
      }
      return Response.json({renewal:updated});
    }

    if(action==="DISABLE"){
      if(context.providerSubscriptionId&&context.nextBillingDate&&provider.updateRecurringSubscription){
        await provider.updateRecurringSubscription(context.providerSubscriptionId,{status:"INACTIVE"});
        await cancelGeneratedFuturePendingCharges(provider,context.providerSubscriptionId,context.nextBillingDate);
      }
      const{data:updated,error:updateError}=await supabase.rpc("set_customer_monthly_auto_renew",{target_subscription:subscriptionId,target_enabled:false});
      if(updateError){
        if(context.providerSubscriptionId&&context.nextBillingDate&&provider.updateRecurringSubscription){
          try{await provider.updateRecurringSubscription(context.providerSubscriptionId,recurringReactivationUpdate(context.nextBillingDate))}catch(rollbackError){console.error("MONTHLY_RENEWAL_DISABLE_ROLLBACK_FAILED",{code:rollbackError instanceof Error?rollbackError.message.slice(0,100):"UNKNOWN"})}
        }
        throw new Error(updateError.message);
      }
      return Response.json({renewal:updated});
    }

    if(context.providerSubscriptionId&&provider.cancelRecurringSubscription)await provider.cancelRecurringSubscription(context.providerSubscriptionId);
    const{data:updated,error:updateError}=await supabase.rpc("cancel_customer_monthly_subscription_at_period_end",{target_subscription:subscriptionId});
    if(updateError)throw new Error(updateError.message);
    return Response.json({renewal:updated});
  }catch(error){
    console.error("MONTHLY_RENEWAL_ACTION_FAILED",{code:error instanceof Error?error.message.slice(0,100):"UNKNOWN"});
    return Response.json({error:"Não foi possível atualizar a renovação agora."},{status:503});
  }
}
