import { NextResponse } from "next/server";
import { efiPixCobProbeMethodNotAllowed, runEfiPixCobProbe } from "@/lib/payments/efi-pix-cob-probe";
import { runEfiPixConfigStagesProbe } from "@/lib/payments/efi-pix-config-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const result = request.headers.get("x-efi-probe-mode") === "config-stages" ? runEfiPixConfigStagesProbe(authorization) : await runEfiPixCobProbe(authorization);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
}

export function GET() {
  return NextResponse.json(efiPixCobProbeMethodNotAllowed, { status: 405, headers: { Allow: "POST", "cache-control": "no-store" } });
}
