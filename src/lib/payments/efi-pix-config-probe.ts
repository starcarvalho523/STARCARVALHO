import { resolveEfiPixRuntimeConfig } from "./efi-config.ts";
import { isEfiPixProbeAuthorized } from "./efi-pix-cob-probe.ts";

type Presence = { EFI_ENABLED_PRESENT: boolean; EFI_ENVIRONMENT_PRESENT: boolean; EFI_CLIENT_ID_PRESENT: boolean; EFI_CLIENT_SECRET_PRESENT: boolean; EFI_CERTIFICATE_BASE64_PRESENT: boolean; EFI_PIX_KEY_PRESENT: boolean };
type SafeConfigError = "EFI_DISABLED" | "EFI_ENVIRONMENT_NOT_CONFIGURED" | "EFI_PRODUCTION_DISABLED" | "EFI_CLIENT_ID_MISSING" | "EFI_CLIENT_SECRET_MISSING" | "EFI_CERTIFICATE_MISSING" | "EFI_CERTIFICATE_INVALID" | "EFI_PIX_KEY_MISSING" | "EFI_CONFIG_INVALID";
type ConfigBody = { ok: true; result: "CONFIG_CHECK_OK"; presence: Presence } | { ok: false; error: SafeConfigError; presence: Presence };
export type EfiPixConfigProbeResult = { status: number; body: ConfigBody };

/** Preview-only configuration check. It does not instantiate OAuth, mTLS, or HTTP clients. */
export function runEfiPixConfigProbe(authorization: string | null, env: NodeJS.ProcessEnv = process.env): EfiPixConfigProbeResult {
  if (!isEfiPixProbeAuthorized(authorization, env)) return { status: 401, body: { ok: false, error: "EFI_CONFIG_INVALID", presence: presenceOf(env) } };
  const presence = presenceOf(env);
  if (env.VERCEL_ENV !== "preview") return { status: 400, body: { ok: false, error: "EFI_CONFIG_INVALID", presence } };

  try {
    resolveEfiPixRuntimeConfig(env);
    return { status: 200, body: { ok: true, result: "CONFIG_CHECK_OK", presence } };
  } catch (error) {
    return { status: 400, body: { ok: false, error: safeConfigError(error), presence } };
  }
}

function presenceOf(env: NodeJS.ProcessEnv): Presence {
  return {
    EFI_ENABLED_PRESENT: Boolean(env.EFI_ENABLED),
    EFI_ENVIRONMENT_PRESENT: Boolean(env.EFI_ENVIRONMENT),
    EFI_CLIENT_ID_PRESENT: Boolean(env.EFI_CLIENT_ID),
    EFI_CLIENT_SECRET_PRESENT: Boolean(env.EFI_CLIENT_SECRET),
    EFI_CERTIFICATE_BASE64_PRESENT: Boolean(env.EFI_CERTIFICATE_BASE64),
    EFI_PIX_KEY_PRESENT: Boolean(env.EFI_PIX_KEY),
  };
}

function safeConfigError(error: unknown): SafeConfigError {
  const code = error instanceof Error ? error.message : "";
  return ["EFI_DISABLED", "EFI_ENVIRONMENT_NOT_CONFIGURED", "EFI_PRODUCTION_DISABLED", "EFI_CLIENT_ID_MISSING", "EFI_CLIENT_SECRET_MISSING", "EFI_CERTIFICATE_MISSING", "EFI_CERTIFICATE_INVALID", "EFI_PIX_KEY_MISSING"].includes(code) ? code as SafeConfigError : "EFI_CONFIG_INVALID";
}
