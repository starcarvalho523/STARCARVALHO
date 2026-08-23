import { PaymentService } from "@/lib/payments/payment-service";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
  if (!body || Object.keys(body).length !== 1 || typeof body.sessionId !== "string") return Response.json({ error: "SESSION_ID_REQUIRED" }, { status: 400 });
  const user = await createClient();
  const { data: auth, error: authError } = await user.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { data: paymentId, error } = await user.rpc("get_or_reserve_efi_pix_payment", { target_session: body.sessionId });
  if (error || typeof paymentId !== "string") return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });
  try {
    const payment = await new PaymentService().createEfiPixPayment(paymentId);
    return Response.json({ payment }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "EFI_PIX_CREATE_FAILED" }, { status: 502 }); }
}
