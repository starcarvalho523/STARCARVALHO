import "server-only";
import { AsaasProvider } from "./asaas-provider";
import { MercadoPagoPointProvider } from "./mercado-pago-point-provider";
import { isAsaasConfigured, isAsaasLiveConfigured, resolveAsaasRuntimeConfig } from "./asaas-config";

export function getPaymentProvider(){
  const config=resolveAsaasRuntimeConfig();
  return new AsaasProvider({environment:config.environment,apiKey:config.apiKey,baseUrl:config.baseUrl});
}

export { isAsaasConfigured, isAsaasLiveConfigured };

/** @deprecated Compatibility alias for older UI. Use isAsaasConfigured. */
export const isAsaasSandboxConfigured = isAsaasConfigured;

export function getMercadoPagoPointProvider(){return new MercadoPagoPointProvider()}
