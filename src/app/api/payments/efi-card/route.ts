import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isEfiCardProductionRuntimeEnabled,
  isEfiCardQaPreviewRuntime,
} from "@/lib/supabase/env";
import { EfiCardService, EfiCardServiceError } from "@/lib/payments/efi-card-service";
import { EfiCardProviderError } from "@/lib/payments/efi-credit-card-client";
import type { EfiCardPayer } from "@/lib/payments/efi-credit-card-client";
import type { EfiCardMetadata } from "@/lib/payments/efi-card-service";
import type { EfiCardProviderEnvironment } from "@/lib/payments/efi-credit-card-config";

const allowed = new Set(["sessionId", "paymentToken", "payer", "cardMeta"]);
const forbidden = new Set(["amount", "paymentId", "provider", "cardNumber", "pan", "number", "cvv", "securityCode", "customId", "notificationUrl"]);

function payerFrom(value: unknown): EfiCardPayer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["name", "cpf", "email", "phone"].includes(key))) return null;
  const fields = [record.name, record.cpf, record.email, record.phone];
  if (!fields.every((field) => typeof field === "string" && field.trim().length > 0)) return null;
  return { name: String(record.name).trim(), cpf: String(record.cpf).trim(), email: String(record.email).trim(), phone: String(record.phone).trim() };
}

function cardMetaFrom(value: unknown): EfiCardMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["brand", "last4"].includes(key))) return null;
  if (typeof record.brand !== "string" || typeof record.last4 !== "string") return null;
  const brand = record.brand.trim().toUpperCase();
  const last4 = record.last4.trim();
  if (!/^[A-Z0-9 _-]{1,24}$/.test(brand) || !/^\d{4}$/.test(last4)) return null;
  return { brand, last4 };
}

export async function POST(request: Request) {
  const isQa = isEfiCardQaPreviewRuntime();
  const isProduction = isEfiCardProductionRuntimeEnabled();
  if (!isQa && !isProduction) return Response.json({ error: "EFI_CARD_NOT_AVAILABLE" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Object.keys(body).some((key) => forbidden.has(key) || !allowed.has(key))) return Response.json({ error: "EFI_CARD_INVALID_REQUEST" }, { status: 400 });
  if (typeof body.sessionId !== "string" || typeof body.paymentToken !== "string" || body.paymentToken.length < 8 || body.paymentToken.length > 4096) return Response.json({ error: "EFI_CARD_INVALID_REQUEST" }, { status: 400 });
  const payer = payerFrom(body.payer);
  const cardMeta = cardMetaFrom(body.cardMeta);
  if (!payer || !cardMeta) return Response.json({ error: "EFI_CARD_INVALID_REQUEST" }, { status: 400 });

  const user = await createClient();
  const { data: { user: actor } } = await user.auth.getUser();
  if (!actor) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const environment: EfiCardProviderEnvironment = isProduction ? "PRODUCTION" : "SANDBOX";
  const admin = createAdminClient();
  const { data: paymentId, error } = await admin.rpc("get_or_reserve_efi_card_payment_for_actor", {
    target_session: body.sessionId,
    target_actor: actor.id,
    target_environment: environment,
  });
  if (error || typeof paymentId !== "string") return Response.json({ error: "PAYMENT_FORBIDDEN" }, { status: 403 });

  try {
    const payment = await new EfiCardService(undefined, environment).createPayment(paymentId, body.paymentToken, payer, cardMeta);
    return Response.json({ payment }, { status: 201 });
  } catch (cause) {
    if (cause instanceof EfiCardProviderError) {
      console.error("EFI_CARD_PROVIDER_FAILURE", {
        code: cause.publicCode,
        stage: cause.stage,
        providerPostSent: cause.providerPostSent,
        uncertain: cause.uncertain,
        httpStatus: cause.httpStatus,
        providerCode: cause.providerCode,
        environment,
      });
      return Response.json({ error: cause.publicCode, stage: cause.stage, uncertain: cause.uncertain }, { status: 502 });
    }
    if (cause instanceof EfiCardServiceError) {
      console.error("EFI_CARD_SERVICE_FAILURE", { code: cause.publicCode, httpStatus: cause.httpStatus, environment });
      return Response.json({ error: cause.publicCode }, { status: cause.httpStatus });
    }
    console.error("EFI_CARD_UNCLASSIFIED_FAILURE", { environment });
    return Response.json({ error: "EFI_CARD_CREATE_FAILED" }, { status: 502 });
  }
}
