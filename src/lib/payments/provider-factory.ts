import "server-only";
import { AsaasProvider } from "./asaas-provider";
import { MercadoPagoPointProvider } from "./mercado-pago-point-provider";
import { EfiProvider } from "./efi-provider";
import { resolveEfiRuntimeConfig } from "./efi-config";
export { resolvePaymentRoute, type PaymentRoute } from "./payment-routing";
import { isAsaasConfigured, isAsaasLiveConfigured, isAsaasSandboxConfigured, resolveAsaasRuntimeConfig } from "./asaas-config";

export function getPaymentProvider(){
  const config=resolveAsaasRuntimeConfig();
  return new AsaasProvider({environment:config.environment,apiKey:config.apiKey,baseUrl:config.baseUrl});
}
export function getProviderByName(name:"ASAAS"|"EFI"){
  if(name==="EFI")return new EfiProvider(resolveEfiRuntimeConfig());
  return getPaymentProvider();
}

export { isAsaasConfigured, isAsaasSandboxConfigured, isAsaasLiveConfigured };

export function getMercadoPagoPointProvider(){return new MercadoPagoPointProvider()}
