import { getEfiAccessToken, type EfiAccessToken } from "./efi-oauth-client.ts";
import { isEfiPixProbeAuthorized } from "./efi-pix-probe-auth.ts";

type OAuthProbeBody =
  | { ok: true; result: "EFI_OAUTH_OK"; tokenTypePresent: boolean; expiresInPresent: boolean; scopePresent: boolean }
  | { ok: false; error: "EFI_PROBE_UNAUTHORIZED" | "EFI_WRONG_ENVIRONMENT" | "EFI_AUTH_FAILED" | "EFI_CERTIFICATE_INVALID" | "EFI_TIMEOUT" };
export type EfiOAuthProbeResult = { status: number; body: OAuthProbeBody };

export async function runEfiOAuthProbe(authorization: string | null, env: NodeJS.ProcessEnv = process.env, dependencies: { getToken?: () => Promise<EfiAccessToken> } = {}): Promise<EfiOAuthProbeResult> {
  if (!isEfiPixProbeAuthorized(authorization, env)) return { status: 401, body: { ok: false, error: "EFI_PROBE_UNAUTHORIZED" } };
  if (env.VERCEL_ENV !== "preview" || env.EFI_ENABLED !== "true" || env.EFI_ENVIRONMENT !== "sandbox") return { status: 400, body: { ok: false, error: "EFI_WRONG_ENVIRONMENT" } };
  try {
    const token = await (dependencies.getToken ?? (() => getEfiAccessToken({ env })))();
    return { status: 200, body: { ok: true, result: "EFI_OAUTH_OK", tokenTypePresent: Boolean(token.tokenType), expiresInPresent: Number.isFinite(token.expiresIn) && token.expiresIn > 0, scopePresent: Boolean(token.scope) } };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const safe = code === "EFI_TIMEOUT" || code === "EFI_CERTIFICATE_INVALID" ? code : "EFI_AUTH_FAILED";
    return { status: safe === "EFI_TIMEOUT" ? 504 : 502, body: { ok: false, error: safe } };
  }
}
