import { NextResponse } from "next/server";
import { resolveEfiCreditCardConfig } from "@/lib/payments/efi-credit-card-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = resolveEfiCreditCardConfig();
    const authorization = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

    const response = await fetch(`${config.baseUrl}/v1/authorize`, {
      method: "POST",
      headers: {
        authorization: `Basic ${authorization}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null) as { access_token?: unknown } | null;
    const oauthOk = response.ok && typeof payload?.access_token === "string" && payload.access_token.length > 0;

    return NextResponse.json(
      {
        configured: true,
        oauth: oauthOk ? "PASS" : "FAIL",
        status: response.status,
      },
      { status: 200 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json(
      {
        configured: false,
        oauth: "FAIL",
        status: null,
        code,
      },
      { status: 200 },
    );
  }
}
