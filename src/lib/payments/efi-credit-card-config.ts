import "server-only";

export type EfiCardProviderEnvironment = "SANDBOX" | "PRODUCTION";

export type EfiCreditCardConfig = {
  baseUrl: "https://cobrancas-h.api.efipay.com.br" | "https://cobrancas.api.efipay.com.br";
  clientId: string;
  clientSecret: string;
  notificationUrl: string;
};

function requireHttpsUrl(value: string, missingCode: string, invalidCode: string) {
  if (!value) throw new Error(missingCode);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(invalidCode);
  }
  if (parsed.protocol !== "https:") throw new Error(invalidCode);
  return parsed.toString();
}

/**
 * Active Efí card configuration.
 *
 * This resolver intentionally remains Sandbox-only. Production has a separate
 * resolver below and is not wired into payment availability or API routes.
 */
export function resolveEfiCreditCardConfig(env: NodeJS.ProcessEnv = process.env): EfiCreditCardConfig {
  const clientId = env.EFI_CARD_CLIENT_ID ?? "";
  const clientSecret = env.EFI_CARD_CLIENT_SECRET ?? "";
  const notificationUrl = env.EFI_CARD_NOTIFICATION_URL ?? "";

  if (!clientId || !clientSecret) throw new Error("EFI_CARD_CREDENTIALS_MISSING");

  return {
    baseUrl: "https://cobrancas-h.api.efipay.com.br",
    clientId,
    clientSecret,
    notificationUrl: requireHttpsUrl(
      notificationUrl,
      "EFI_CARD_NOTIFICATION_URL_MISSING",
      "EFI_CARD_NOTIFICATION_URL_INVALID",
    ),
  };
}

/**
 * Production-readiness resolver.
 *
 * It uses a completely separate credential namespace and the Efí Production
 * billing origin. Merely configuring these variables does NOT activate card
 * payments: the current availability and API runtime gates remain QA-only.
 */
export function resolveEfiCreditCardProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): EfiCreditCardConfig {
  const clientId = env.EFI_CARD_PRODUCTION_CLIENT_ID ?? "";
  const clientSecret = env.EFI_CARD_PRODUCTION_CLIENT_SECRET ?? "";
  const notificationUrl = env.EFI_CARD_PRODUCTION_NOTIFICATION_URL ?? "";

  if (!clientId || !clientSecret) throw new Error("EFI_CARD_PRODUCTION_CREDENTIALS_MISSING");

  return {
    baseUrl: "https://cobrancas.api.efipay.com.br",
    clientId,
    clientSecret,
    notificationUrl: requireHttpsUrl(
      notificationUrl,
      "EFI_CARD_PRODUCTION_NOTIFICATION_URL_MISSING",
      "EFI_CARD_PRODUCTION_NOTIFICATION_URL_INVALID",
    ),
  };
}

export function resolveEfiCreditCardConfigForEnvironment(
  environment: EfiCardProviderEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): EfiCreditCardConfig {
  return environment === "PRODUCTION"
    ? resolveEfiCreditCardProductionConfig(env)
    : resolveEfiCreditCardConfig(env);
}

/** Server-only readiness check. It deliberately exposes no configuration values. */
export function isEfiCreditCardConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    resolveEfiCreditCardConfig(env);
    return true;
  } catch {
    return false;
  }
}

/** Production readiness only; this does not enable the Production card flow. */
export function isEfiCreditCardProductionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    resolveEfiCreditCardProductionConfig(env);
    return true;
  } catch {
    return false;
  }
}
