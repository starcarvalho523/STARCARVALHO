import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAsaasRuntimeConfig } from "@/lib/payments/asaas-config";
import { AsaasPublicError } from "@/lib/payments/asaas-provider";
import { getPaymentProvider } from "@/lib/payments/provider-factory";

type MonthlyPaymentMethod = "PIX" | "CREDIT_CARD";

type SwitchContext = {
  shouldClose?: unknown;
  paymentId?: unknown;
  method?: unknown;
  providerPaymentId?: unknown;
  providerCheckoutId?: unknown;
  expiresAt?: unknown;
  state?: unknown;
};

export async function prepareMonthlyPaymentAttempt(
  billingPeriodId: string,
  targetMethod: MonthlyPaymentMethod,
  userClient: SupabaseClient,
) {
  const { data, error } = await userClient.rpc("get_monthly_payment_switch_context", {
    target_billing_period: billingPeriodId,
    target_method: targetMethod,
  });
  if (error) throw new Error(error.message);

  const context = (data ?? {}) as SwitchContext;
  if (context.shouldClose !== true) return { closed: false as const };

  const paymentId = typeof context.paymentId === "string" ? context.paymentId : null;
  const currentMethod = context.method === "PIX" || context.method === "CREDIT_CARD" ? context.method : null;
  if (!paymentId || !currentMethod) throw new Error("MONTHLY_PAYMENT_SWITCH_CONTEXT_INVALID");

  if (currentMethod === "PIX") {
    const providerPaymentId = typeof context.providerPaymentId === "string" ? context.providerPaymentId : null;
    if (!providerPaymentId) throw new Error("MONTHLY_PAYMENT_SWITCH_PROVIDER_REFERENCE_PENDING");
    await cancelPixCharge(providerPaymentId);
  } else {
    const providerCheckoutId = typeof context.providerCheckoutId === "string" ? context.providerCheckoutId : null;
    if (!providerCheckoutId) throw new Error("MONTHLY_PAYMENT_SWITCH_PROVIDER_REFERENCE_PENDING");
    await cancelCreditCheckout(providerCheckoutId);
  }

  const { error: finalizeError } = await userClient.rpc("finalize_monthly_payment_method_switch", {
    target_billing_period: billingPeriodId,
    target_payment: paymentId,
    target_method: targetMethod,
  });
  if (finalizeError) throw new Error(finalizeError.message);

  return { closed: true as const, previousMethod: currentMethod };
}

async function cancelPixCharge(providerPaymentId: string) {
  const provider = getPaymentProvider();
  if (provider.name !== "ASAAS") throw new Error("MONTHLY_PAYMENT_SWITCH_PROVIDER_MISMATCH");
  try {
    await provider.cancelPayment(providerPaymentId);
  } catch (error) {
    // A missing charge is already closed from the provider's point of view.
    if (error instanceof AsaasPublicError && error.status === 404) return;
    throw error;
  }
}

async function cancelCreditCheckout(providerCheckoutId: string) {
  const config = resolveAsaasRuntimeConfig();
  const response = await fetch(`${config.baseUrl}/checkouts/${encodeURIComponent(providerCheckoutId)}/cancel`, {
    method: "POST",
    headers: {
      accept: "application/json",
      access_token: config.apiKey,
      "user-agent": `StarCarvalhos-${config.providerEnvironment}/1.0`,
    },
    cache: "no-store",
  });

  if (response.ok || response.status === 404) return;
  throw new Error(`ASAAS_CHECKOUT_CANCEL_FAILED_${response.status}`);
}
