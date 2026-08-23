import { createClient } from "@/lib/supabase/server";
import { EfiCardService } from "@/lib/payments/efi-card-service";
import type { EfiCardPayer } from "@/lib/payments/efi-credit-card-client";

const allowed = new Set(["sessionId", "paymentToken", "payer"]);
const forbidden = new Set(["amount", "paymentId", "provider", "cardNumber", "pan", "number", "cvv", "securityCode", "customId", "notificationUrl"]);

function payerFrom(value: unknown): EfiCardPayer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["name", "cpf", "email", "phone"].includes(key))) return null;
  const fields = [record.name, record.cpf, record.email, record.phone];
  if (!fields.every((field) => typeof field === "string" && field.trim().length > 0)) return null;
  return { name: String(record.name).trim(), cpf: String(record.cpf).trim(), email: String(record.email).trim(), phone: String(record.phone).trim() };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Object.keys(body).some((key) => forbidden.has(key) || !allowed.has(key))) return Response.json({ error: "EFI_CARD_INVALID_REQUEST" }, { status: 400 });
  if (typeof body.sessionId !== "string" || typeof body.paymentToken !== "string" || body.paymentToken.length < 8 || body.paymentToken.length > 4096) return Response.json({ error: "EFI_CARD_INVALID_REQUEST" }, { status: 400 });
  const payer = payerFrom(body.payer);
  if (!payer) return Response.json({ error: "EFI_CARD_INVALID_REQUEST" }, { status: 400 });

  const user = await createClient();
  const { data: { user: actor } } = await user.auth.getUser();
  if (!actor) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { data: paymentId, error } = await user.rpc("get_or_reserve_efi_card_payment", { target_session: body.sessionId });
  if (error || typeof paymentId !== "string") return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });

  try {
    const payment = await new EfiCardService().createPayment(paymentId, body.paymentToken, payer);
    return Response.json({ payment }, { status: 201 });
  } catch {
    return Response.json({ error: "EFI_CARD_CREATE_FAILED" }, { status: 502 });
  }
}
