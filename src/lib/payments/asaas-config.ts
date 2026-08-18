export type AsaasRuntimeEnvironment = "sandbox" | "production";

export type AsaasRuntimeConfig = {
  environment: AsaasRuntimeEnvironment;
  providerEnvironment: "SANDBOX" | "PRODUCTION";
  baseUrl: string;
  apiKey: string;
};

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PRODUCTION_URL = "https://api.asaas.com/v3";

export function resolveAsaasRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AsaasRuntimeConfig {
  const environment = env.ASAAS_ENVIRONMENT;
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("ASAAS_ENVIRONMENT_NOT_CONFIGURED");
  }

  if (environment === "production" && env.ASAAS_LIVE_PAYMENTS_ENABLED !== "true") {
    throw new Error("ASAAS_LIVE_PAYMENTS_DISABLED");
  }

  const expectedBaseUrl = environment === "sandbox" ? SANDBOX_URL : PRODUCTION_URL;
  const baseUrl = (env.ASAAS_BASE_URL || expectedBaseUrl).replace(/\/$/, "");
  if (baseUrl !== expectedBaseUrl) throw new Error("ASAAS_BASE_URL_ENVIRONMENT_MISMATCH");

  const apiKey = env.ASAAS_API_KEY ?? "";
  if (!apiKey) throw new Error("ASAAS_API_KEY_NOT_CONFIGURED");

  return {
    environment,
    providerEnvironment: environment === "sandbox" ? "SANDBOX" : "PRODUCTION",
    baseUrl,
    apiKey,
  };
}

export function isAsaasSandboxConfigured(env: NodeJS.ProcessEnv = process.env) {
  try {
    return resolveAsaasRuntimeConfig({ ...env, ASAAS_ENVIRONMENT: "sandbox" }).environment === "sandbox";
  } catch {
    return false;
  }
}

export function isAsaasLiveConfigured(env: NodeJS.ProcessEnv = process.env) {
  try {
    return resolveAsaasRuntimeConfig({ ...env, ASAAS_ENVIRONMENT: "production" }).environment === "production";
  } catch {
    return false;
  }
}
