import "server-only";
import { AsaasProvider } from "./asaas-provider";

export function getPaymentProvider(){
  const environment=process.env.ASAAS_ENVIRONMENT;
  if(environment!=="sandbox")throw new Error("PAYMENTS_SANDBOX_NOT_CONFIGURED");
  return new AsaasProvider({environment,apiKey:process.env.ASAAS_API_KEY??"",baseUrl:process.env.ASAAS_BASE_URL??"https://api-sandbox.asaas.com/v3"});
}

export function isAsaasSandboxConfigured(){return process.env.ASAAS_ENVIRONMENT==="sandbox"&&Boolean(process.env.ASAAS_API_KEY)&&Boolean(process.env.ASAAS_BASE_URL)}

