import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const INITIAL_PAYMENT_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
]);

export async function processAsaasPixAutomaticInitialPaymentWebhook(
  payload: unknown,
  providerEnvironment: "SANDBOX" | "PRODUCTION",
) {
  const event = parseInitialPaymentEvent(payload);
  if (!event) return { handled: false as const, result: "not_applicable" as const };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_monthly_pix_automatic_initial_payment", {
    target_event_id: event.id,
    target_event_type: event.type,
    target_provider_payment_id: event.paymentId,
    target_provider_customer_id: event.customerId,
    target_provider_status: event.status,
    target_reported_amount: event.amount,
    target_conciliation_identifier: event.conciliationIdentifier,
    target_provider_environment: providerEnvironment,
    target_sanitized_payload: {
      event: event.type,
      paymentId: event.paymentId,
      status: event.status,
      value: event.amount,
      billingType: event.billingType,
      conciliationIdentifier: event.conciliationIdentifier,
    },
  });
  if (error) throw new Error(error.message);
  const result = data && typeof data === "object" && "result" in data ? String((data as { result?: unknown }).result) : "unknown";
  return { handled: result !== "unknown", result };
}

function parseInitialPaymentEvent(payload: unknown) {
  if (!isRecord(payload) || typeof payload.id !== "string" || typeof payload.event !== "string") return null;
  if (!INITIAL_PAYMENT_EVENTS.has(payload.event) || !isRecord(payload.payment) || typeof payload.payment.id !== "string") return null;
  const payment = payload.payment;
  const conciliationIdentifier = firstString(
    payment.conciliationIdentifier,
    isRecord(payment.pixTransaction) ? payment.pixTransaction.conciliationIdentifier : null,
    isRecord(payment.pixQrCode) ? payment.pixQrCode.conciliationIdentifier : null,
  );
  if (!conciliationIdentifier) return null;
  const amount = numberOrNull(payment.value);
  if (amount === null) return null;
  return {
    id: payload.id,
    type: payload.event,
    paymentId: payment.id,
    customerId: firstString(payment.customer),
    status: firstString(payment.status) ?? "UNKNOWN",
    amount,
    billingType: firstString(payment.billingType),
    conciliationIdentifier,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}
function numberOrNull(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}
