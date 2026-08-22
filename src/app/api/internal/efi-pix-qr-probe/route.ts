import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveEfiPixRuntimeConfig, resolveEfiRuntimeConfig } from "@/lib/payments/efi-config";
import { EfiOAuthClient } from "@/lib/payments/efi-oauth-client";
import { EfiPixClient } from "@/lib/payments/efi-pix-client";
import { EfiPixQrClient } from "@/lib/payments/efi-pix-qr-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(value: string | null): boolean {
  const expected = process.env.EFI_PIX_PROBE_TOKEN;
  if (!expected || !value?.startsWith("Bearer ")) return false;
  const received = Buffer.from(value.slice(7)); const target = Buffer.from(expected);
  return received.length === target.length && timingSafeEqual(received, target);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ ok: false, error: "EFI_PROBE_UNAUTHORIZED" }, { status: 401 });
  if (process.env.VERCEL_ENV !== "preview" || process.env.EFI_ENABLED !== "true" || process.env.EFI_ENVIRONMENT !== "sandbox") return NextResponse.json({ ok: false, error: "EFI_WRONG_ENVIRONMENT" }, { status: 400 });
  try {
    const authConfig = resolveEfiRuntimeConfig(); const pixConfig = resolveEfiPixRuntimeConfig();
    const token = await new EfiOAuthClient(authConfig).getAccessToken();
    const oauth = { getAccessToken: async () => token };
    const cob = await new EfiPixClient(pixConfig, { oauth }).createImmediateCob({ amount: 5 });
    if (cob.locationId === null) throw new Error("EFI_INVALID_RESPONSE");
    const qr = await new EfiPixQrClient(authConfig, { oauth }).getQrCode(cob.locationId);
    return NextResponse.json({ ok: true, config: "CONFIG_CHECK_OK", oauth: "EFI_OAUTH_OK", cob: "EFI_PIX_COB_OK", qr: "EFI_PIX_QR_OK", environment: "sandbox", qrPayloadPresent: Boolean(qr.qrPayload), qrImagePresent: Boolean(qr.qrImageDataUri) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EFI_PIX_QR_FAILED";
    const safe = /^(EFI_(?:AUTH_FAILED|CERTIFICATE_INVALID|TIMEOUT|INVALID_RESPONSE|PIX_CREATE_FAILED(?::\d{3}(?::(?:chave_invalida|valor_invalido|documento_bloqueado|txid_duplicado|erro_aplicacao|provider_error))?)?|PIX_QR_FAILED(?::\d{3}:(?:location_nao_encontrada|provider_error))?))$/.test(code) ? code : "EFI_PIX_QR_FAILED";
    return NextResponse.json({ ok: false, error: safe }, { status: 502 });
  }
}

export function GET() { return NextResponse.json({ ok: false, error: "EFI_PROBE_UNAUTHORIZED" }, { status: 405, headers: { Allow: "POST" } }); }
