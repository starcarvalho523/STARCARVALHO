import { resolveEfiPixRuntimeConfig, resolveEfiRuntimeConfig } from "./efi-config.ts";
import { isEfiPixProbeAuthorized } from "./efi-pix-probe-auth.ts";

type EfiResolverErrorCode =
  | "EFI_DISABLED" | "EFI_ENVIRONMENT_NOT_CONFIGURED" | "EFI_PRODUCTION_DISABLED" | "EFI_CLIENT_ID_MISSING"
  | "EFI_CLIENT_SECRET_MISSING" | "EFI_CERTIFICATE_MISSING" | "EFI_CERTIFICATE_INVALID" | "EFI_PIX_KEY_MISSING";
type EfiResolverErrorStage = `EFI_CONFIG_RESOLVER_ERROR:${EfiResolverErrorCode}`;
type EfiResolverThrowStage = "EFI_RESOLVER_THROW_ERROR_OBJECT" | "EFI_RESOLVER_THROW_STRING" | "EFI_RESOLVER_THROW_OTHER";

export type EfiPixConfigProbeStage =
  | "PROBE_AUTH_OK" | "VERCEL_PREVIEW_OK" | "EFI_ENABLED_OK" | "EFI_ENVIRONMENT_SANDBOX_OK" | "EFI_CLIENT_ID_OK"
  | "EFI_CLIENT_SECRET_OK" | "EFI_CERTIFICATE_BASE64_FORMAT_OK" | "EFI_CERTIFICATE_BUFFER_OK" | "EFI_PIX_KEY_OK"
  | "EFI_AUTH_CONFIG_RESOLVER_OK" | "EFI_AUTH_CONFIG_RESOLVER_FAILED" | "EFI_PIX_CONFIG_RESOLVER_OK" | "EFI_PIX_CONFIG_RESOLVER_FAILED"
  | "CONFIG_CHECK_OK" | "PROBE_AUTH_FAILED" | "VERCEL_ENV_INVALID" | "EFI_ENABLED_INVALID" | "EFI_ENVIRONMENT_INVALID"
  | "EFI_CLIENT_ID_INVALID" | "EFI_CLIENT_SECRET_INVALID" | "EFI_CERTIFICATE_BASE64_INVALID" | "EFI_CERTIFICATE_DECODE_INVALID" | "EFI_PIX_KEY_INVALID"
  | EfiResolverErrorStage | EfiResolverThrowStage;

export type EfiPixConfigStagesProbeResult = { status: number; body: { ok: boolean; stages: EfiPixConfigProbeStage[] } };
type ConfigProbeDependencies = {
  decodeCertificate?: (value: string) => Buffer;
  resolveAuthConfig?: (env: NodeJS.ProcessEnv) => unknown;
  resolvePixConfig?: (env: NodeJS.ProcessEnv) => unknown;
};

const allowedResolverErrors: readonly EfiResolverErrorCode[] = [
  "EFI_DISABLED", "EFI_ENVIRONMENT_NOT_CONFIGURED", "EFI_PRODUCTION_DISABLED", "EFI_CLIENT_ID_MISSING",
  "EFI_CLIENT_SECRET_MISSING", "EFI_CERTIFICATE_MISSING", "EFI_CERTIFICATE_INVALID", "EFI_PIX_KEY_MISSING",
];

function failed(stages: EfiPixConfigProbeStage[], stage: EfiPixConfigProbeStage, status = 400): EfiPixConfigStagesProbeResult {
  return { status, body: { ok: false, stages: [...stages, stage] } };
}

function resolverFailure(stages: EfiPixConfigProbeStage[], resolverStage: "EFI_AUTH_CONFIG_RESOLVER_FAILED" | "EFI_PIX_CONFIG_RESOLVER_FAILED", error: unknown): EfiPixConfigStagesProbeResult {
  return { status: 400, body: { ok: false, stages: [...stages, resolverStage, resolverErrorStage(error)] } };
}

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function resolverErrorStage(error: unknown): EfiResolverErrorStage | EfiResolverThrowStage {
  const code = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (allowedResolverErrors.includes(code as EfiResolverErrorCode)) return `EFI_CONFIG_RESOLVER_ERROR:${code as EfiResolverErrorCode}`;
  if (error instanceof Error) return "EFI_RESOLVER_THROW_ERROR_OBJECT";
  if (typeof error === "string") return "EFI_RESOLVER_THROW_STRING";
  return "EFI_RESOLVER_THROW_OTHER";
}

function hasAuthInvariants(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return config.environment === "sandbox" && config.providerEnvironment === "SANDBOX" && config.baseUrl === "https://pix-h.api.efipay.com.br"
    && typeof config.clientId === "string" && config.clientId.length > 0 && typeof config.clientSecret === "string" && config.clientSecret.length > 0
    && Buffer.isBuffer(config.certificateP12) && config.certificateP12.length > 0;
}

function hasPixInvariants(value: unknown): boolean {
  return hasAuthInvariants(value) && typeof (value as Record<string, unknown>).pixKey === "string" && (value as Record<string, string>).pixKey.length > 0;
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
  try { certificate = (dependencies.decodeCertificate ?? ((value) => Buffer.from(value, "base64")))(certificateBase64); } catch { return failed(stages, "EFI_CERTIFICATE_DECODE_INVALID"); }
  if (certificate.length === 0) return failed(stages, "EFI_CERTIFICATE_DECODE_INVALID");
  stages.push("EFI_CERTIFICATE_BUFFER_OK");
  if (!env.EFI_PIX_KEY) return failed(stages, "EFI_PIX_KEY_INVALID");
  stages.push("EFI_PIX_KEY_OK");

  let authConfig: unknown;
  try { authConfig = (dependencies.resolveAuthConfig ?? resolveEfiRuntimeConfig)(env); } catch (error) { return resolverFailure(stages, "EFI_AUTH_CONFIG_RESOLVER_FAILED", error); }
  if (!hasAuthInvariants(authConfig)) return failed(stages, "EFI_AUTH_CONFIG_RESOLVER_FAILED");
  stages.push("EFI_AUTH_CONFIG_RESOLVER_OK");

  let pixConfig: unknown;
  try { pixConfig = (dependencies.resolvePixConfig ?? resolveEfiPixRuntimeConfig)(env); } catch (error) { return resolverFailure(stages, "EFI_PIX_CONFIG_RESOLVER_FAILED", error); }
  if (!hasPixInvariants(pixConfig)) return failed(stages, "EFI_PIX_CONFIG_RESOLVER_FAILED");
  return { status: 200, body: { ok: true, stages: [...stages, "EFI_PIX_CONFIG_RESOLVER_OK", "CONFIG_CHECK_OK"] } };
}
