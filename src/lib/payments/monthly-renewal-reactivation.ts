import type { ProviderCharge } from "./payment-provider";

export function recurringReactivationUpdate(_nextDueDate:string){
  return {status:"ACTIVE" as const};
}

export function isGeneratedFuturePendingCharge(charge:ProviderCharge,nextBillingDate:string){
  return charge.providerStatus==="PENDING"&&charge.billingType==="CREDIT_CARD"&&typeof charge.dueDate==="string"&&charge.dueDate>=nextBillingDate;
}
