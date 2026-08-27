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

  const admin = createAdminClient();
  let targetActor = auth.user.id;
  let reservation = await admin.rpc("get_or_reserve_efi_pix_payment_for_actor", {
    target_session: body.sessionId,
    target_actor: targetActor,
    target_environment: providerEnvironment,
  });

  if (reservation.error || typeof reservation.data !== "string") {
    try {
      const { unitId } = await getOperatorContext();
      const { data: session } = await admin
        .from("parking_sessions")
        .select("unit_id,customer_owner_id")
        .eq("id", body.sessionId)
        .maybeSingle();

      if (!session || session.unit_id !== unitId || typeof session.customer_owner_id !== "string") {
        return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });
      }

      targetActor = session.customer_owner_id;
      reservation = await admin.rpc("get_or_reserve_efi_pix_payment_for_actor", {
        target_session: body.sessionId,
        target_actor: targetActor,
        target_environment: providerEnvironment,
      });
    } catch {
      return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });
    }
  }

  const paymentId = reservation.data;
  if (reservation.error || typeof paymentId !== "string") {
    return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });
  }

  try {
    const payment = await new PaymentService().createEfiPixPayment(paymentId);
    return Response.json({ payment }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "EFI_PIX_CREATE_FAILED" }, { status: 502 });
  }
}
