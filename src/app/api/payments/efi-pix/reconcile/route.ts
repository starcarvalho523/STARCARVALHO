import { PaymentService } from "@/lib/payments/payment-service";
import { resolveEfiPixRuntimeConfig } from "@/lib/payments/efi-config";
import { isEfiPixProductionRuntimeEnabled } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  if (!body || Object.keys(body).length !== 1 || typeof body.sessionId !== "string") {
    return Response.json({ error: "SESSION_ID_REQUIRED" }, { status: 400 });
  }

  let providerEnvironment: "SANDBOX" | "PRODUCTION";
  try {
    const config = resolveEfiPixRuntimeConfig();
    providerEnvironment = config.providerEnvironment;
    if (providerEnvironment === "PRODUCTION" && !isEfiPixProductionRuntimeEnabled()) {
      return Response.json({ error: "EFI_PIX_NOT_AVAILABLE" }, { status: 404 });
    }
  } catch {
    return Response.json({ error: "EFI_PIX_NOT_AVAILABLE" }, { status: 404 });
  }

  const user = await createClient();
  const { data: auth, error: authError } = await user.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { data: paymentId, error } = await user.rpc("get_efi_pix_payment_for_session_for_environment", {
    target_session: body.sessionId,
    target_environment: providerEnvironment,
  });
  if (error || typeof paymentId !== "string") return Response.json({ error: "PIX_PAYMENT_NOT_FOUND" }, { status: 404 });

  try {
    const service = new PaymentService();
    const reconciled = await service.reconcileEfiPixPayment(paymentId);
    const payment = reconciled.state === "PENDING" && (!reconciled.qrCodePayload || !reconciled.qrCodeImageBase64)
      ? await service.createEfiPixPayment(paymentId)
      : reconciled;
    return Response.json({ payment }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "EFI_PIX_RECONCILIATION_FAILED" }, { status: 502 });
  }
}
