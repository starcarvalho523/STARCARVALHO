import { readBoundedJson } from "@/lib/bounded-body";
import { PaymentService } from "@/lib/payments/payment-service";
import { cancelImmediateEfiPixCob } from "@/lib/payments/efi-pix-client";
import { resolveEfiPixRuntimeConfig } from "@/lib/payments/efi-config";
import { isEfiPixProductionRuntimeEnabled } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOperatorContext } from "@/lib/operator-data";

async function environment() {
  const config = resolveEfiPixRuntimeConfig();
  if (config.providerEnvironment === "PRODUCTION" && !isEfiPixProductionRuntimeEnabled()) throw new Error("EFI_PIX_NOT_AVAILABLE");
  return config.providerEnvironment;
}

async function authorizedActor(sessionId: string, actorId: string) {
  const admin = createAdminClient();
  const { data: session } = await admin.from("parking_sessions").select("unit_id,customer_owner_id").eq("id", sessionId).maybeSingle();
  if (!session) return null;
  if (session.customer_owner_id === actorId) return actorId;
  try {
    const { unitId } = await getOperatorContext();
    if (unitId === session.unit_id && typeof session.customer_owner_id === "string") return session.customer_owner_id;
  } catch {}
  return null;
}

async function withExpiry(paymentId: string, payment: Record<string, unknown>) {
  const admin = createAdminClient();
  const { data } = await admin.rpc("get_efi_pix_payment_context", { target_payment: paymentId });
  const value = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return { ...payment, expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : payment.expiresAt ?? null };
}

export async function POST(request: Request) {
  const body = await readBoundedJson(request).catch(() => null) as { sessionId?: unknown } | null;
  if (!body || Object.keys(body).length !== 1 || typeof body.sessionId !== "string") return Response.json({ error: "SESSION_ID_REQUIRED" }, { status: 400 });

  let providerEnvironment: "SANDBOX" | "PRODUCTION";
  try { providerEnvironment = await environment(); } catch { return Response.json({ error: "EFI_PIX_NOT_AVAILABLE" }, { status: 404 }); }

  const user = await createClient();
  const { data: auth, error: authError } = await user.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const targetActor = await authorizedActor(body.sessionId, auth.user.id);
  if (!targetActor) return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();
  const reservation = await admin.rpc("get_or_reserve_efi_pix_payment_for_actor", {
    target_session: body.sessionId,
    target_actor: targetActor,
    target_environment: providerEnvironment,
  });
  const paymentId = reservation.data;
  if (reservation.error || typeof paymentId !== "string") return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });

  try {
    const payment = await new PaymentService().createEfiPixPayment(paymentId) as Record<string, unknown>;
    return Response.json({ payment: await withExpiry(paymentId, payment) }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "EFI_PIX_CREATE_FAILED" }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const body = await readBoundedJson(request).catch(() => null) as { sessionId?: unknown } | null;
  if (!body || Object.keys(body).length !== 1 || typeof body.sessionId !== "string") return Response.json({ error: "SESSION_ID_REQUIRED" }, { status: 400 });

  let providerEnvironment: "SANDBOX" | "PRODUCTION";
  try { providerEnvironment = await environment(); } catch { return Response.json({ error: "EFI_PIX_NOT_AVAILABLE" }, { status: 404 }); }

  const user = await createClient();
  const { data: auth } = await user.auth.getUser();
  if (!auth.user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!await authorizedActor(body.sessionId, auth.user.id)) return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("id").eq("parking_session_id", body.sessionId).eq("provider", "EFI").eq("method", "PIX").eq("payment_channel", "QR").eq("provider_environment", providerEnvironment).eq("status", "PENDING").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!payment?.id) return Response.json({ cancelled: false }, { headers: { "cache-control": "no-store" } });

  const { data: context, error: contextError } = await admin.rpc("get_efi_pix_payment_context", { target_payment: payment.id });
  if (contextError) return Response.json({ error: "EFI_PIX_CANCEL_FAILED" }, { status: 502 });
  const value = context && typeof context === "object" ? context as Record<string, unknown> : {};
  const txid = typeof value.txid === "string" ? value.txid : null;

  try {
    if (txid) await cancelImmediateEfiPixCob(txid);
    const { error } = await admin.rpc("finalize_efi_pix_cancellation", { target_payment: payment.id });
    if (error) throw error;
    return Response.json({ cancelled: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "EFI_PIX_CANCEL_FAILED" }, { status: 502 });
  }
}
