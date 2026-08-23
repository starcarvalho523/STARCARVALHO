import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isAsaasConfigured } from "./asaas-config";
import { isEfiCreditCardConfigured } from "./efi-credit-card-config";
import type { PaymentCapability, PaymentChannel, PaymentMethod, PaymentProviderName } from "./payment-model";

type AvailabilityRow = { payment_method:PaymentMethod; payment_channel:PaymentChannel; payment_provider:PaymentProviderName; enabled:boolean; configuration_state:"READY"|"DISABLED"|"UNCONFIGURED"|"AWAITING_TERMINAL"; legacy:boolean };

export async function getPaymentAvailability(unitId:string):Promise<PaymentCapability[]> {
  const supabase=await createClient();
  const {data,error}=await supabase.from("payment_method_availability").select("payment_method,payment_channel,payment_provider,enabled,configuration_state,legacy").eq("unit_id",unitId);
  if(error)throw new Error("PAYMENT_AVAILABILITY_UNAVAILABLE");
  return ((data??[]) as AvailabilityRow[]).map(row=>({method:row.payment_method,channel:row.payment_channel,provider:row.payment_provider,enabled:row.enabled,configured:row.configuration_state==="READY"&&providerConfigured(row.payment_provider,row.payment_channel),legacy:row.legacy}));
}

export function canUsePayment(capabilities:PaymentCapability[],method:PaymentMethod,channel:PaymentChannel,provider:PaymentProviderName){return capabilities.some(item=>item.method===method&&item.channel===channel&&item.provider===provider&&item.enabled&&item.configured)}

function providerConfigured(provider:PaymentProviderName,channel:PaymentChannel){
  if(provider==="INTERNAL")return channel==="MANUAL";
  if(provider==="ASAAS"&&(channel==="QR"||channel==="HOSTED_CHECKOUT"))return isAsaasConfigured();
  if(provider==="EFI"&&channel==="TOKENIZED_CHECKOUT")return isEfiCreditCardConfigured();
  return false;
}
