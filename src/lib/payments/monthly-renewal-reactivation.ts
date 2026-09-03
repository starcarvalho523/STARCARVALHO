import type { ProviderCharge } from "./payment-provider";

export function recurringReactivationUpdate(){
  return {status:"ACTIVE" as const};
}

export function isGeneratedFuturePendingCharge(charge:ProviderCharge,nextBillingDate:string){
  return charge.providerStatus==="PENDING"&&typeof charge.dueDate==="string"&&charge.dueDate>=nextBillingDate;
}
