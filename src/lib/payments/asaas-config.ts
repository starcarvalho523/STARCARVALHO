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
  const environment = String(env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase();
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("ASAAS_ENVIRONMENT_NOT_CONFIGURED");
  }

  if (environment === "production" && String(env.ASAAS_LIVE_PAYMENTS_ENABLED ?? "").trim().toLowerCase() !== "true") {
    throw new Error("ASAAS_LIVE_PAYMENTS_DISABLED");
  }

  const expectedBaseUrl = environment === "sandbox" ? SANDBOX_URL : PRODUCTION_URL;
  const baseUrl = String(env.ASAAS_BASE_URL || expectedBaseUrl).trim().replace(/\/$/, "");
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

export function isAsaasConfigured(env: NodeJS.ProcessEnv = process.env) {
  try {
    resolveAsaasRuntimeConfig(env);
    return true;
  } catch {
    return false;
  }
}

export function isAsaasWebhookConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.ASAAS_WEBHOOK_TOKEN);
}

export function isAsaasSandboxConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.ASAAS_ENVIRONMENT !== "sandbox") return false;
  return isAsaasConfigured(env);
}

export function isAsaasLiveConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.ASAAS_ENVIRONMENT !== "production") return false;
  return isAsaasConfigured(env);
}
