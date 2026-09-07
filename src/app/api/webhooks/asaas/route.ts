import { BodyTooLargeError, readBoundedJson } from "@/lib/bounded-body";
import { getPaymentProvider } from "@/lib/payments/provider-factory";
import { PaymentService } from "@/lib/payments/payment-service";
import { safeTokenEquals } from "@/lib/payments/asaas-provider";
import { isAsaasPixAutomaticEvent } from "@/lib/payments/asaas-recurring-events";
import { processAsaasPixAutomaticWebhook } from "@/lib/payments/asaas-pix-automatic-webhook";
import { processAsaasPixAutomaticInitialPaymentWebhook } from "@/lib/payments/asaas-pix-automatic-initial-payment";
import { tryProcessMonthlyRenewalCardSetupSubscriptionWebhook } from "@/lib/payments/monthly-renewal-card-setup";
import { nextUngeneratedThirtyDayDueDate } from "@/lib/payments/recurring-30-day-schedule";
import type { PaymentProvider, ProviderWebhookEvent } from "@/lib/payments/payment-provider";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN ?? "";
  const received = request.headers.get("asaas-access-token");
  let eventName = "";

  try {
    if (!safeTokenEquals(received, expected)) {
      console.warn("ASAAS_WEBHOOK_UNAUTHORIZED");
      return Response.json({ error: "INVALID_WEBHOOK" }, { status: 401 });
    }

    const provider = getPaymentProvider();
    const payload = await readBoundedJson(request, 1024 * 1024);
    eventName = payload && typeof payload === "object" && "event" in payload ? String(payload.event) : "";

    if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(eventName)) {
      console.warn("ASAAS_WEBHOOK_INVALID_EVENT");
      return Response.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
    }

    const relevantEvent =
      isAsaasPixAutomaticEvent(eventName) ||
      eventName.startsWith("CHECKOUT_") ||
      eventName.startsWith("PAYMENT_") ||
      eventName.startsWith("SUBSCRIPTION_");

    if (!relevantEvent) {
      console.info("ASAAS_WEBHOOK_IGNORED", { eventName });
      return Response.json({ received: true, ignored: true }, { status: 200 });
    }

    const service = new PaymentService(provider);
    if (isAsaasPixAutomaticEvent(eventName)) {
      await processAsaasPixAutomaticWebhook(payload);
    } else if (eventName.startsWith("CHECKOUT_")) {
      await service.processCheckoutWebhook(provider.parseCheckoutWebhook(payload));
    } else if (eventName.startsWith("SUBSCRIPTION_")) {
      const renewalSetupHandled = await tryProcessMonthlyRenewalCardSetupSubscriptionWebhook(payload, provider.environment);
      if (!renewalSetupHandled) await service.processSubscriptionWebhook(payload);
    } else {
      const initial = await processAsaasPixAutomaticInitialPaymentWebhook(payload, provider.environment);
      if (!initial.handled) {
        const event = provider.parseWebhook(payload);
        const recurringHandled = await tryProcessMonthlyRecurringCardPayment(event, provider);
        if (!recurringHandled) {
          await service.processWebhook(event);
          if (event.type === "PAYMENT_CONFIRMED" && event.subscriptionId) {
            await bindInitialMonthlyRecurringCardFromPayment(event, provider);
            const reconciledAfterBind = await tryProcessMonthlyRecurringCardPayment(event, provider);
            if (!reconciledAfterBind) {
              throw new Error("ASAAS_INITIAL_RECURRING_PAYMENT_RECONCILIATION_UNRESOLVED");
            }
          }
        }
      }
    }

    return Response.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return Response.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
    const errorCode = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const invalid =
      error instanceof SyntaxError || (error instanceof Error &&
      (error.message === "INVALID_ASAAS_WEBHOOK" ||
        error.message.startsWith("ASAAS_SUBSCRIPTION_INVALID_") ||
        error.message.startsWith("ASAAS_PIX_AUTOMATIC_INVALID_") ||
        error.message.startsWith("ASAAS_RENEWAL_SETUP_") ||
        error.message.includes("EVENT_ID_REQUIRED")));

    console.warn("ASAAS_WEBHOOK_PROCESSING_ERROR", {
      eventName: /^[A-Z][A-Z0-9_]{0,79}$/.test(eventName) ? eventName : "INVALID_EVENT",
      errorCode: /^[A-Z][A-Z0-9_]{0,119}$/.test(errorCode) ? errorCode : "REDACTED_PROCESSING_ERROR",
      status: invalid ? 400 : 500,
    });

    return Response.json(
      { error: invalid ? "INVALID_WEBHOOK" : "WEBHOOK_PROCESSING_FAILED" },
      { status: invalid ? 400 : 500 },
    );
  }
}

async function tryProcessMonthlyRecurringCardPayment(event: ProviderWebhookEvent, provider: PaymentProvider) {
  if (
    event.billingType !== "CREDIT_CARD" ||
    !event.subscriptionId ||
    (event.type !== "PAYMENT_CREATED" && event.type !== "PAYMENT_CONFIRMED")
  ) return false;

  const snapshot = await provider.getPayment(event.paymentId);
  if (
    snapshot.providerPaymentId !== event.paymentId ||
    snapshot.subscriptionId !== event.subscriptionId ||
    snapshot.billingType !== "CREDIT_CARD" ||
    !snapshot.dueDate ||
    Number(snapshot.amount) <= 0
  ) throw new Error("ASAAS_RECURRING_PAYMENT_CORRELATION_MISMATCH");

  const reportedAmount = event.amount ?? snapshot.amount;
  if (Number(reportedAmount) !== Number(snapshot.amount)) {
    throw new Error("ASAAS_RECURRING_PAYMENT_AMOUNT_MISMATCH");
  }

  const admin = createAdminClient();
  const { data: ensuredPeriodId, error: ensureError } = await admin.rpc("ensure_asaas_recurring_billing_period", {
    target_provider_subscription_id: event.subscriptionId,
    target_due_date: snapshot.dueDate,
    target_amount: reportedAmount,
  });
  if (ensureError) throw new Error(`ASAAS_RECURRING_PERIOD_RPC_${ensureError.message}`);
  if (ensuredPeriodId === null) return false;

  const { data, error } = await admin.rpc("process_asaas_monthly_recurring_payment_webhook", {
    event_id: event.id,
    event_type: event.type,
    provider_payment_id: event.paymentId,
    provider_subscription_id: event.subscriptionId,
    provider_status: event.paymentStatus,
    reported_amount: reportedAmount,
    due_date: snapshot.dueDate,
    provider_environment: provider.environment,
    sanitized_payload: {
      event: event.type,
      paymentId: event.paymentId,
      status: event.paymentStatus,
      value: reportedAmount,
      billingType: event.billingType,
      subscriptionId: event.subscriptionId,
      dueDate: snapshot.dueDate,
    },
  });
  if (error) throw new Error(`ASAAS_RECURRING_WEBHOOK_RPC_${error.message}`);

  const handled = String(data ?? "") !== "NOT_BOUND";
  if (handled && event.type === "PAYMENT_CONFIRMED") {
    await alignRecurringProviderSchedule(event.subscriptionId, snapshot.dueDate, provider);
  }
  return handled;
}

async function bindInitialMonthlyRecurringCardFromPayment(event: ProviderWebhookEvent, provider: PaymentProvider) {
  if (!event.subscriptionId) return;
  const snapshot = await provider.getPayment(event.paymentId);
  if (
    snapshot.providerPaymentId !== event.paymentId ||
    snapshot.subscriptionId !== event.subscriptionId ||
    snapshot.billingType !== "CREDIT_CARD" ||
    !snapshot.checkoutId ||
    !snapshot.providerCustomerId ||
    !snapshot.dueDate ||
    Number(snapshot.amount) <= 0
  ) throw new Error("ASAAS_INITIAL_RECURRING_BIND_CORRELATION_MISMATCH");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("bind_initial_monthly_card_recurring_from_payment", {
    target_event_id: `${event.id}:payment-fallback`,
    target_provider_payment_id: event.paymentId,
    target_provider_subscription_id: event.subscriptionId,
    target_provider_customer_id: snapshot.providerCustomerId,
    target_provider_checkout_id: snapshot.checkoutId,
    target_amount: snapshot.amount,
  });
  if (error) throw new Error(`ASAAS_INITIAL_RECURRING_BIND_RPC_${error.message}`);

  const result = data && typeof data === "object" ? data as { result?: unknown } : null;
  if (result?.result !== "bound") throw new Error("ASAAS_INITIAL_RECURRING_BIND_UNRESOLVED");
  await alignRecurringProviderSchedule(event.subscriptionId, snapshot.dueDate, provider);
}

async function alignRecurringProviderSchedule(providerSubscriptionId: string, confirmedDueDate: string, provider: PaymentProvider) {
  if (!provider.updateRecurringSubscription || !provider.listRecurringSubscriptionPayments) return;

  const admin = createAdminClient();
  const { data: reconciledNextDueDate, error: reconciliationError } = await admin.rpc(
    "reconcile_asaas_recurring_30_day_schedule",
    {
      target_provider_subscription_id: providerSubscriptionId,
      confirmed_due_date: confirmedDueDate,
    },
  );
  if (reconciliationError || typeof reconciledNextDueDate !== "string") {
    throw new Error("ASAAS_RECURRING_30_DAY_RECONCILIATION_FAILED");
  }

  const generatedPayments = await provider.listRecurringSubscriptionPayments(providerSubscriptionId);
  const providerNextDueDate = nextUngeneratedThirtyDayDueDate(
    reconciledNextDueDate,
    generatedPayments.map((payment) => payment.dueDate),
    new Date().toISOString().slice(0, 10),
  );

  await provider.updateRecurringSubscription(providerSubscriptionId, {
    status: "ACTIVE",
    nextDueDate: providerNextDueDate,
    updatePendingPayments: false,
  });
}
