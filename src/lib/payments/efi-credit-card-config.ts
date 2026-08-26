import "server-only";

export type EfiCreditCardConfig = {
  baseUrl: "https://cobrancas-h.api.efipay.com.br";
  clientId: string;
  clientSecret: string;
  notificationUrl: string;
};

/**
 * Efí card is deliberately sandbox-only in this phase.
 *
 * There is no environment switch and no production billing origin here. The
 * only accepted runtime credentials are the dedicated card credentials. This
 * prevents Pix settings from being reused and makes a future Production
 * rollout require an explicit code change and review.
 */
export function resolveEfiCreditCardConfig(env: NodeJS.ProcessEnv = process.env): EfiCreditCardConfig {
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

  return {
    baseUrl: "https://cobrancas-h.api.efipay.com.br",
    clientId,
    clientSecret,
    notificationUrl: parsed.toString(),
  };
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
