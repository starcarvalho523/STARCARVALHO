import { decodeEfiCertificateBase64 } from "./efi-contracts.ts";

export type EfiAuthRuntimeConfig = { environment: "sandbox"; providerEnvironment: "SANDBOX"; baseUrl: "https://pix-h.api.efipay.com.br"; clientId: string; clientSecret: string; certificateP12: Buffer };
export type EfiPixRuntimeConfig = EfiAuthRuntimeConfig & { pixKey: string; payeeCode: string | null };

/** OAuth is sandbox-only and deliberately requires no PIX key. */
export function resolveEfiRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EfiAuthRuntimeConfig {
  if (String(env.EFI_ENABLED ?? "").trim().toLowerCase() !== "true") throw new Error("EFI_DISABLED");
  const environment = String(env.EFI_ENVIRONMENT ?? "").trim().toLowerCase();
  if (environment !== "sandbox" && environment !== "production") throw new Error("EFI_ENVIRONMENT_NOT_CONFIGURED");
  if (environment === "production") throw new Error("EFI_PRODUCTION_DISABLED");
  const clientId = env.EFI_CLIENT_ID ?? ""; if (!clientId) throw new Error("EFI_CLIENT_ID_MISSING");
  const clientSecret = env.EFI_CLIENT_SECRET ?? ""; if (!clientSecret) throw new Error("EFI_CLIENT_SECRET_MISSING");
  return { environment: "sandbox", providerEnvironment: "SANDBOX", baseUrl: "https://pix-h.api.efipay.com.br", clientId, clientSecret, certificateP12: decodeEfiCertificateBase64(env.EFI_CERTIFICATE_BASE64) };
}

/** Reserved for a future PIX operation; OAuth must not call this. */
export function resolveEfiPixRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EfiPixRuntimeConfig {
  const auth = resolveEfiRuntimeConfig(env);
  const pixKey = env.EFI_PIX_KEY ?? ""; if (!pixKey) throw new Error("EFI_PIX_KEY_MISSING");
  return { ...auth, pixKey, payeeCode: env.EFI_PAYEE_CODE ?? null };
}
export function isEfiConfigured(env: NodeJS.ProcessEnv = process.env) { try { resolveEfiRuntimeConfig(env); return true; } catch { return false; } }
