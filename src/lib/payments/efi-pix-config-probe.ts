import { resolveEfiPixRuntimeConfig } from "./efi-config.ts";
import { isEfiPixProbeAuthorized } from "./efi-pix-probe-auth.ts";

export type EfiPixConfigProbeStage =
  | "PROBE_AUTH_OK" | "VERCEL_PREVIEW_OK" | "EFI_ENABLED_OK" | "EFI_ENVIRONMENT_SANDBOX_OK" | "EFI_CLIENT_ID_OK"
  | "EFI_CLIENT_SECRET_OK" | "EFI_CERTIFICATE_BASE64_FORMAT_OK" | "EFI_CERTIFICATE_BUFFER_OK" | "EFI_PIX_KEY_OK" | "CONFIG_CHECK_OK"
  | "PROBE_AUTH_FAILED" | "VERCEL_ENV_INVALID" | "EFI_ENABLED_INVALID" | "EFI_ENVIRONMENT_INVALID" | "EFI_CLIENT_ID_INVALID"
  | "EFI_CLIENT_SECRET_INVALID" | "EFI_CERTIFICATE_BASE64_INVALID" | "EFI_CERTIFICATE_DECODE_INVALID" | "EFI_PIX_KEY_INVALID" | "EFI_CONFIG_RESOLVER_UNKNOWN";
export type EfiPixConfigStagesProbeResult = { status: number; body: { ok: boolean; stages: EfiPixConfigProbeStage[] } };
type ConfigProbeDependencies = { decodeCertificate?: (value: string) => Buffer; resolveConfig?: (env: NodeJS.ProcessEnv) => unknown };

function failed(stages: EfiPixConfigProbeStage[], stage: EfiPixConfigProbeStage, status = 400): EfiPixConfigStagesProbeResult {
  return { status, body: { ok: false, stages: [...stages, stage] } };
}

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** Local-only staged configuration check. It never instantiates OAuth, mTLS, or HTTP clients. */
export function runEfiPixConfigStagesProbe(authorization: string | null, env: NodeJS.ProcessEnv = process.env, dependencies: ConfigProbeDependencies = {}): EfiPixConfigStagesProbeResult {
  const stages: EfiPixConfigProbeStage[] = [];
  if (!isEfiPixProbeAuthorized(authorization, env)) return failed(stages, "PROBE_AUTH_FAILED", 401);
  stages.push("PROBE_AUTH_OK");
  if (env.VERCEL_ENV !== "preview") return failed(stages, "VERCEL_ENV_INVALID");
  stages.push("VERCEL_PREVIEW_OK");
  if (env.EFI_ENABLED?.trim().toLowerCase() !== "true") return failed(stages, "EFI_ENABLED_INVALID");
  stages.push("EFI_ENABLED_OK");
  if (env.EFI_ENVIRONMENT?.trim().toLowerCase() !== "sandbox") return failed(stages, "EFI_ENVIRONMENT_INVALID");
  stages.push("EFI_ENVIRONMENT_SANDBOX_OK");
  if (!env.EFI_CLIENT_ID) return failed(stages, "EFI_CLIENT_ID_INVALID");
  stages.push("EFI_CLIENT_ID_OK");
  if (!env.EFI_CLIENT_SECRET) return failed(stages, "EFI_CLIENT_SECRET_INVALID");
  stages.push("EFI_CLIENT_SECRET_OK");
  const certificateBase64 = env.EFI_CERTIFICATE_BASE64?.replace(/\s/g, "") ?? "";
  if (!isBase64(certificateBase64)) return failed(stages, "EFI_CERTIFICATE_BASE64_INVALID");
  stages.push("EFI_CERTIFICATE_BASE64_FORMAT_OK");
  let certificate: Buffer;
  try {
    certificate = (dependencies.decodeCertificate ?? ((value) => Buffer.from(value, "base64")))(certificateBase64);
  } catch {
    return failed(stages, "EFI_CERTIFICATE_DECODE_INVALID");
  }
  if (certificate.length === 0) return failed(stages, "EFI_CERTIFICATE_DECODE_INVALID");
  stages.push("EFI_CERTIFICATE_BUFFER_OK");
  if (!env.EFI_PIX_KEY) return failed(stages, "EFI_PIX_KEY_INVALID");
  stages.push("EFI_PIX_KEY_OK");
  try {
    (dependencies.resolveConfig ?? resolveEfiPixRuntimeConfig)(env);
  } catch {
    return failed(stages, "EFI_CONFIG_RESOLVER_UNKNOWN");
  }
  return { status: 200, body: { ok: true, stages: [...stages, "CONFIG_CHECK_OK"] } };
}
