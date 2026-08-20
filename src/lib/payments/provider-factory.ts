import "server-only";
import { AsaasProvider } from "./asaas-provider";
import { MercadoPagoPointProvider } from "./mercado-pago-point-provider";
import { EfiProvider } from "./efi-provider";
import { resolveEfiRuntimeConfig } from "./efi-config";
import { isAsaasConfigured, isAsaasLiveConfigured, isAsaasSandboxConfigured, resolveAsaasRuntimeConfig } from "./asaas-config";

export function getPaymentProvider(){
  const config=resolveAsaasRuntimeConfig();
  return new AsaasProvider({environment:config.environment,apiKey:config.apiKey,baseUrl:config.baseUrl});
}
export function getProviderByName(name:"ASAAS"|"EFI"){
  if(name==="EFI")return new EfiProvider(resolveEfiRuntimeConfig());
  return getPaymentProvider();
}
export type PaymentRoute={obligationType:"PARKING_SESSION"|"MONTHLY_BILLING_PERIOD";method:"PIX"|"CREDIT_CARD";channel:"QR"|"HOSTED_CHECKOUT";provider:"ASAAS"|"EFI"};
/** Current routes intentionally preserve Asaas; switching to Efí requires a future enabled data route. */
export function resolvePaymentRoute(route:Omit<PaymentRoute,"provider">):PaymentRoute{return{...route,provider:"ASAAS"}}

export { isAsaasConfigured, isAsaasSandboxConfigured, isAsaasLiveConfigured };

export function getMercadoPagoPointProvider(){return new MercadoPagoPointProvider()}
