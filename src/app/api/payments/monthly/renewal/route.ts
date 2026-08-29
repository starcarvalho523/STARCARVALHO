import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments/provider-factory";

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
      if(!context.providerSubscriptionId||!context.nextBillingDate||!provider.updateRecurringSubscription)return Response.json({error:"RENEWAL_NOT_READY"},{status:409});
      await provider.updateRecurringSubscription(context.providerSubscriptionId,{status:"ACTIVE",nextDueDate:context.nextBillingDate});
      const{data:updated,error:updateError}=await supabase.rpc("set_customer_monthly_auto_renew",{target_subscription:subscriptionId,target_enabled:true});
      if(updateError)throw new Error(updateError.message);
      return Response.json({renewal:updated});
    }

    if(action==="DISABLE"){
      if(context.providerSubscriptionId&&provider.updateRecurringSubscription)await provider.updateRecurringSubscription(context.providerSubscriptionId,{status:"INACTIVE"});
      const{data:updated,error:updateError}=await supabase.rpc("set_customer_monthly_auto_renew",{target_subscription:subscriptionId,target_enabled:false});
      if(updateError)throw new Error(updateError.message);
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
