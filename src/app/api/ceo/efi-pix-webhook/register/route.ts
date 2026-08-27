import { canAccessCeoScope, getAccess } from "@/lib/auth";
import { configureEfiPixServerlessWebhook } from "@/lib/payments/efi-pix-webhook-client";
import { isEfiPixProductionRuntimeEnabled } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}

export async function POST() {
  const access = await getAccess();
  if (!access) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (access.area !== "ceo" || !canAccessCeoScope(access.roles, "admin")) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!isEfiPixProductionRuntimeEnabled()) {
    return Response.json({ error: "EFI_PIX_NOT_AVAILABLE" }, { status: 404 });
  }

  try {
    await configureEfiPixServerlessWebhook();
    return Response.json({ ok: true, result: "EFI_PIX_WEBHOOK_REGISTERED" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "EFI_PIX_WEBHOOK_REGISTER_FAILED" }, { status: 502 });
  }
}
