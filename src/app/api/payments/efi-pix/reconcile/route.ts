import { PaymentService } from "@/lib/payments/payment-service";
import { resolveEfiPixRuntimeConfig } from "@/lib/payments/efi-config";
import { isEfiPixProductionRuntimeEnabled } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOperatorContext } from "@/lib/operator-data";

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

  let paymentId: string | null = null;
  const direct = await user.rpc("get_efi_pix_payment_for_session_for_environment", {
    target_session: body.sessionId,
    target_environment: providerEnvironment,
  });
  if (!direct.error && typeof direct.data === "string") {
    paymentId = direct.data;
  } else {
    try {
      const { unitId } = await getOperatorContext();
      const admin = createAdminClient();
      const { data: session } = await admin
        .from("parking_sessions")
        .select("unit_id")
        .eq("id", body.sessionId)
        .maybeSingle();
      if (!session || session.unit_id !== unitId) {
        return Response.json({ error: "PIX_PAYMENT_NOT_FOUND" }, { status: 404 });
      }

      const { data: payment } = await admin
        .from("payments")
        .select("id")
        .eq("parking_session_id", body.sessionId)
        .eq("provider", "EFI")
        .eq("method", "PIX")
        .eq("payment_channel", "QR")
        .eq("provider_environment", providerEnvironment)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (payment?.id) paymentId = payment.id;
    } catch {
      return Response.json({ error: "PIX_PAYMENT_NOT_FOUND" }, { status: 404 });
    }
  }

  if (!paymentId) return Response.json({ error: "PIX_PAYMENT_NOT_FOUND" }, { status: 404 });

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
