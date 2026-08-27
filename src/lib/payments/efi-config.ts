import { decodeEfiCertificateBase64 } from "./efi-contracts.ts";

export type EfiProviderEnvironment = "SANDBOX" | "PRODUCTION";
export type EfiAuthRuntimeConfig = {
  environment: "sandbox" | "production";
  providerEnvironment: EfiProviderEnvironment;
  baseUrl: "https://pix-h.api.efipay.com.br" | "https://pix.api.efipay.com.br";
  clientId: string;
  clientSecret: string;
  certificateP12: Buffer;
};
export type EfiPixRuntimeConfig = EfiAuthRuntimeConfig & { pixKey: string; payeeCode: string | null };

function enabled(env: NodeJS.ProcessEnv) {
  return String(env.EFI_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function resolveEfiRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EfiAuthRuntimeConfig {
  if (!enabled(env)) throw new Error("EFI_DISABLED");
  const environment = String(env.EFI_ENVIRONMENT ?? "").trim().toLowerCase();
  if (environment !== "sandbox" && environment !== "production") throw new Error("EFI_ENVIRONMENT_NOT_CONFIGURED");

  if (environment === "production") {
    if (String(env.EFI_PIX_PRODUCTION_ENABLED ?? "").trim().toLowerCase() !== "true") throw new Error("EFI_PIX_PRODUCTION_DISABLED");
    const clientId = env.EFI_PIX_PRODUCTION_CLIENT_ID ?? "";
    const clientSecret = env.EFI_PIX_PRODUCTION_CLIENT_SECRET ?? "";
    if (!clientId) throw new Error("EFI_PRODUCTION_CLIENT_ID_MISSING");
    if (!clientSecret) throw new Error("EFI_PRODUCTION_CLIENT_SECRET_MISSING");
    return {
      environment: "production",
      providerEnvironment: "PRODUCTION",
      baseUrl: "https://pix.api.efipay.com.br",
      clientId,
      clientSecret,
      certificateP12: decodeEfiCertificateBase64(env.EFI_PIX_PRODUCTION_CERTIFICATE_BASE64),
    };
  }

  const clientId = env.EFI_CLIENT_ID ?? "";
  const clientSecret = env.EFI_CLIENT_SECRET ?? "";
  if (!clientId) throw new Error("EFI_CLIENT_ID_MISSING");
  if (!clientSecret) throw new Error("EFI_CLIENT_SECRET_MISSING");
  return {
    environment: "sandbox",
    providerEnvironment: "SANDBOX",
    baseUrl: "https://pix-h.api.efipay.com.br",
    clientId,
    clientSecret,
    certificateP12: decodeEfiCertificateBase64(env.EFI_CERTIFICATE_BASE64),
  };
}

export function resolveEfiPixRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EfiPixRuntimeConfig {
  const auth = resolveEfiRuntimeConfig(env);
  const pixKey = auth.environment === "production" ? env.EFI_PIX_PRODUCTION_KEY ?? "" : env.EFI_PIX_KEY ?? "";
  if (!pixKey) throw new Error(auth.environment === "production" ? "EFI_PRODUCTION_PIX_KEY_MISSING" : "EFI_PIX_KEY_MISSING");
  const payeeCode = auth.environment === "production" ? env.EFI_PIX_PRODUCTION_PAYEE_CODE ?? null : env.EFI_PAYEE_CODE ?? null;
  return { ...auth, pixKey, payeeCode };
}

export function isEfiConfigured(env: NodeJS.ProcessEnv = process.env) {
  try { resolveEfiRuntimeConfig(env); return true; } catch { return false; }
}
