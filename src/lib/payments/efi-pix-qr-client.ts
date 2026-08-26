import { resolveEfiRuntimeConfig, type EfiAuthRuntimeConfig } from "./efi-config.ts";
import { EfiMtlsHttpClient, type EfiHttpTransport } from "./efi-http-client.ts";
import { EfiOAuthClient } from "./efi-oauth-client.ts";

export type EfiPixQrCode = { qrPayload: string; qrImageDataUri: string | null };
type OAuthPort = Pick<EfiOAuthClient, "getAccessToken">;
type QrDependencies = { oauth?: OAuthPort; transport?: EfiHttpTransport };
const safeProviderCodes = new Set(["location_nao_encontrada"]);

/** Sandbox-only QR recovery for an existing Efí Pix location. */
export class EfiPixQrClient {
  private readonly oauth: OAuthPort;
  private readonly transport: EfiHttpTransport;
  constructor(private readonly config: EfiAuthRuntimeConfig, dependencies: QrDependencies = {}) {
    this.oauth = dependencies.oauth ?? new EfiOAuthClient(config);
    this.transport = dependencies.transport ?? new EfiMtlsHttpClient(config);
  }

  async getQrCode(locationId: number): Promise<EfiPixQrCode> {
    assertLocationId(locationId);
    try {
      const token = await this.oauth.getAccessToken();
      const response = await this.transport.request({ path: `/v2/loc/${locationId}/qrcode`, method: "GET", headers: { authorization: `Bearer ${token.accessToken}` }, body: "" });
      if (response.status < 200 || response.status >= 300) throw qrHttpError(response.status, response.body);
      return parseQrCode(response.body);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "EFI_AUTH_FAILED" || code === "EFI_CERTIFICATE_INVALID" || code === "EFI_TIMEOUT" || code === "EFI_INVALID_RESPONSE" || code === "EFI_PIX_QR_FAILED" || code.startsWith("EFI_PIX_QR_FAILED:")) throw error;
      throw new Error("EFI_PIX_QR_FAILED");
    }
  }
}

export function getEfiPixQrCode(locationId: number, options: { env?: NodeJS.ProcessEnv; dependencies?: QrDependencies } = {}) {
  return new EfiPixQrClient(resolveEfiRuntimeConfig(options.env), options.dependencies).getQrCode(locationId);
}

function assertLocationId(locationId: number): void {
  if (!Number.isInteger(locationId) || locationId <= 0) throw new Error("EFI_PIX_QR_FAILED");
}

function qrHttpError(status: number, body: string): Error {
  let providerCode = "provider_error";
  try {
    const parsed: unknown = JSON.parse(body);
    const name = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).nome : null;
    if (typeof name === "string" && safeProviderCodes.has(name)) providerCode = name;
  } catch { /* provider body is intentionally ignored */ }
  return new Error(`EFI_PIX_QR_FAILED:${status}:${providerCode}`);
}

function parseQrCode(body: string): EfiPixQrCode {
  let parsed: unknown; try { parsed = JSON.parse(body); } catch { throw new Error("EFI_INVALID_RESPONSE"); }
  if (!parsed || typeof parsed !== "object" || typeof (parsed as Record<string, unknown>).qrcode !== "string" || !(parsed as Record<string, unknown>).qrcode) throw new Error("EFI_INVALID_RESPONSE");
  const image = (parsed as Record<string, unknown>).imagemQrcode;
  const normalizedImage = typeof image === "string" && image
    ? image.startsWith("data:image/") ? image : `data:image/png;base64,${image}`
    : null;
  return { qrPayload: (parsed as Record<string, string>).qrcode, qrImageDataUri: normalizedImage };
}
