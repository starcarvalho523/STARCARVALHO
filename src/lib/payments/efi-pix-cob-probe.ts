import { timingSafeEqual } from "node:crypto";
import { createImmediateEfiPixCob, type EfiImmediatePixCob } from "./efi-pix-client.ts";

type ProbeBody =
  | { ok: true; environment: "sandbox"; amount: "5.00"; status: string; txidPresent: boolean; locationIdPresent: boolean; pixCopyPastePresent: boolean }
  | { ok: false; error: "EFI_PROBE_UNAUTHORIZED" | "EFI_WRONG_ENVIRONMENT" | "EFI_PIX_CREATE_FAILED" | EfiPixCreateDiagnostic | "EFI_AUTH_FAILED" | "EFI_CERTIFICATE_INVALID" | "EFI_PIX_KEY_MISSING" | "EFI_TIMEOUT" | "EFI_INVALID_RESPONSE" };

type EfiPixCreateDiagnostic = `EFI_PIX_CREATE_FAILED:${number}` | `EFI_PIX_CREATE_FAILED:${number}:${"chave_invalida" | "valor_invalido" | "documento_bloqueado" | "txid_duplicado" | "erro_aplicacao" | "provider_error"}`;

export type EfiPixCobProbeResult = { status: number; body: ProbeBody };
type ProbeDependencies = { createCob?: () => Promise<EfiImmediatePixCob> };
export const efiPixCobProbeMethodNotAllowed = { ok: false, error: "EFI_PROBE_UNAUTHORIZED" } as const;

/** Temporary preview-only probe. It is intentionally isolated from payment workflows. */
export async function runEfiPixCobProbe(authorization: string | null, env: NodeJS.ProcessEnv = process.env, dependencies: ProbeDependencies = {}): Promise<EfiPixCobProbeResult> {
  if (!isEfiPixProbeAuthorized(authorization, env)) return failure(401, "EFI_PROBE_UNAUTHORIZED");
  if (env.VERCEL_ENV !== "preview" || env.EFI_ENABLED !== "true" || env.EFI_ENVIRONMENT !== "sandbox") return failure(400, "EFI_WRONG_ENVIRONMENT");

  try {
    const cob = await (dependencies.createCob ?? (() => createImmediateEfiPixCob({ amount: 5 })))();
    return { status: 200, body: { ok: true, environment: "sandbox", amount: "5.00", status: cob.status, txidPresent: Boolean(cob.txid), locationIdPresent: cob.locationId !== null, pixCopyPastePresent: cob.pixCopyPaste !== null } };
  } catch (error) {
    return failure(errorStatus(error), errorCode(error));
  }
}

export function isEfiPixProbeAuthorized(authorization: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const expectedToken = env.EFI_PIX_PROBE_TOKEN;
  if (!expectedToken) return false;
  if (!authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function errorCode(error: unknown): Extract<ProbeBody, { ok: false }> ["error"] {
  const code = error instanceof Error ? error.message : "";
  if (isSafePixCreateDiagnostic(code)) return code;
  if (code === "EFI_AUTH_FAILED" || code === "EFI_TIMEOUT" || code === "EFI_INVALID_RESPONSE" || code === "EFI_PIX_KEY_MISSING") return code;
  if (code === "EFI_CERTIFICATE_INVALID" || code === "EFI_CERTIFICATE_MISSING") return "EFI_CERTIFICATE_INVALID";
  return "EFI_PIX_CREATE_FAILED";
}

function isSafePixCreateDiagnostic(code: string): code is EfiPixCreateDiagnostic {
  return /^EFI_PIX_CREATE_FAILED:\d{3}(?::(?:chave_invalida|valor_invalido|documento_bloqueado|txid_duplicado|erro_aplicacao|provider_error))?$/.test(code);
}

function errorStatus(error: unknown): number {
  const code = errorCode(error);
  if (code === "EFI_TIMEOUT") return 504;
  if (code === "EFI_PIX_KEY_MISSING") return 400;
  return 502;
}

function failure(status: number, error: Extract<ProbeBody, { ok: false }> ["error"]): EfiPixCobProbeResult {
  return { status, body: { ok: false, error } };
}
