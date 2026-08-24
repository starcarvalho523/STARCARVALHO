import "server-only";

export type EfiCreditCardConfig = {
  baseUrl: "https://cobrancas-h.api.efipay.com.br";
  clientId: string;
  clientSecret: string;
  notificationUrl: string;
};

export function resolveEfiCreditCardConfig(env: NodeJS.ProcessEnv = process.env): EfiCreditCardConfig {
  if (String(env.EFI_ENABLED ?? "").trim().toLowerCase() !== "true") throw new Error("EFI_DISABLED");
  if (String(env.EFI_CARD_ENVIRONMENT ?? "").trim().toLowerCase() !== "sandbox") throw new Error("EFI_CARD_PRODUCTION_DISABLED");

  // Card credentials and environment are intentionally distinct from the Pix application.
  // Do not fall back to EFI_CLIENT_* or EFI_ENVIRONMENT: missing dedicated card
  // configuration must leave this flow unavailable rather than reuse Pix settings.
  const clientId = env.EFI_CARD_CLIENT_ID ?? "";
  const clientSecret = env.EFI_CARD_CLIENT_SECRET ?? "";
  const notificationUrl = env.EFI_CARD_NOTIFICATION_URL ?? "";
  if (!clientId || !clientSecret) throw new Error("EFI_CARD_CREDENTIALS_MISSING");
  if (!notificationUrl) throw new Error("EFI_CARD_NOTIFICATION_URL_MISSING");

  let parsed: URL;
  try {
    parsed = new URL(notificationUrl);
  } catch {
    throw new Error("EFI_CARD_NOTIFICATION_URL_INVALID");
  }
  if (parsed.protocol !== "https:") throw new Error("EFI_CARD_NOTIFICATION_URL_INVALID");

  return { baseUrl: "https://cobrancas-h.api.efipay.com.br", clientId, clientSecret, notificationUrl: parsed.toString() };
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
