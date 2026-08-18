import "server-only";
import { AsaasProvider } from "./asaas-provider";
import { MercadoPagoPointProvider } from "./mercado-pago-point-provider";
import { isAsaasLiveConfigured, isAsaasSandboxConfigured, resolveAsaasRuntimeConfig } from "./asaas-config";

export function getPaymentProvider(){
  const config=resolveAsaasRuntimeConfig();
  return new AsaasProvider({environment:config.environment,apiKey:config.apiKey,baseUrl:config.baseUrl});
}

export { isAsaasSandboxConfigured, isAsaasLiveConfigured };

export function getMercadoPagoPointProvider(){return new MercadoPagoPointProvider()}
