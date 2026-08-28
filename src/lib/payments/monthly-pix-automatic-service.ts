import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAsaasRuntimeConfig } from "./asaas-config";
import { createAsaasPixAutomaticAuthorization } from "./asaas-pix-automatic-client";
import { getPaymentProvider } from "./provider-factory";

type CustomerContext = {
  user_id: string;
  full_name: string;
  email: string | null;
  billing_document: string | null;
  external_reference: string;
  provider_customer_id: string | null;
};

type BindingRow = {
  provider_authorization_id: string | null;
  authorization_status: string | null;
  initial_qr_payload: string | null;
  initial_qr_image_base64: string | null;
  initial_qr_expires_at: string | null;
};

export type MonthlyPixAutomaticView = {
  state: "PENDING" | "ACTIVE" | "PAID" | "SUSPENDED" | "REFUSED" | "EXPIRED";
  amount: number;
  qrCodePayload: string | null;
  qrCodeImageBase64: string | null;
  expiresAt: string | null;
};

export async function getMonthlyPixAutomatic(billingPeriodId: string, userClient: SupabaseClient): Promise<MonthlyPixAutomaticView | null> {
  await authorizeBillingPeriod(billingPeriodId, userClient);
  const admin = createAdminClient();
  const period = await loadPeriod(admin, billingPeriodId);
  const binding = await loadBinding(admin, period.subscription_id);
  if (!binding) return null;
  return publicView(period.amount, period.status, binding);
}

export async function createMonthlyPixAutomatic(billingPeriodId: string, userClient: SupabaseClient): Promise<MonthlyPixAutomaticView> {
  await authorizeBillingPeriod(billingPeriodId, userClient);
  const admin = createAdminClient();
  const period = await loadPeriod(admin, billingPeriodId);
  if (period.status !== "PENDING") throw new Error("MONTHLY_BILLING_PERIOD_NOT_PAYABLE");

  const existing = await loadBinding(admin, period.subscription_id);
  if (existing?.provider_authorization_id) return publicView(period.amount, period.status, existing);

  const config = resolveAsaasRuntimeConfig();
  const { data: contextData, error: contextError } = await admin.rpc("get_payment_customer_context", {
    subject_type: "MONTHLY_BILLING_PERIOD",
    subject_id: billingPeriodId,
    target_provider: "ASAAS",
    target_environment: config.providerEnvironment,
  });
  if (contextError) throw new Error(contextError.message);
  const context = parseCustomerContext(contextData);
  if (!context.billing_document) throw new Error("PAYMENT_CUSTOMER_DOCUMENT_REQUIRED");

  const provider = getPaymentProvider();
  let providerCustomerId = context.provider_customer_id;
  if (!providerCustomerId) {
    const found = await provider.findCustomerByExternalReference(context.external_reference);
    const customer = found ?? await provider.createCustomer({
      name: context.full_name,
      cpfCnpj: context.billing_document,
      email: context.email,
      externalReference: context.external_reference,
    });
    providerCustomerId = customer.providerCustomerId;
    const { error: bindError } = await admin.rpc("bind_payment_provider_customer", {
      customer_user_id: context.user_id,
      target_provider: "ASAAS",
      target_environment: config.providerEnvironment,
      target_provider_customer_id: providerCustomerId,
      target_external_reference: context.external_reference,
    });
    if (bindError) throw new Error(bindError.message);
  }

  const today = new Date().toISOString().slice(0, 10);
  const startDate = period.due_date > today ? period.due_date : today;
  const authorization = await createAsaasPixAutomaticAuthorization({
    customerId: providerCustomerId,
    contractId: `sc${period.subscription_id.replace(/-/g, "")}`,
    value: Number(period.amount),
    startDate,
    description: "Mensalidade Star Carvalhos",
  });

  const authorizationStatus = normalizeAuthorizationStatus(authorization.status);
  const { error: upsertError } = await admin.rpc("upsert_monthly_recurring_binding", {
    target_subscription: period.subscription_id,
    target_method: "PIX_AUTOMATIC",
    target_provider_customer_id: providerCustomerId,
    target_provider_authorization_id: authorization.id,
    target_provider_subscription_id: null,
    target_authorization_status: authorizationStatus,
  });
  if (upsertError) throw new Error(upsertError.message);

  const { error: qrError } = await admin.rpc("save_monthly_recurring_initial_qr", {
    target_subscription: period.subscription_id,
    target_method: "PIX_AUTOMATIC",
    qr_payload: authorization.qrCodePayload,
    qr_image_base64: authorization.qrCodeImageBase64,
    qr_expires_at: authorization.expiresAt,
  });
  if (qrError) throw new Error(qrError.message);

  return {
    state: authorizationStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
    amount: Number(period.amount),
    qrCodePayload: authorization.qrCodePayload,
    qrCodeImageBase64: authorization.qrCodeImageBase64,
    expiresAt: authorization.expiresAt,
  };
}

async function authorizeBillingPeriod(billingPeriodId: string, userClient: SupabaseClient) {
  const { error } = await userClient.rpc("get_monthly_provider_payment", {
    billing_period_id: billingPeriodId,
    payment_method: "PIX",
  });
  if (error) throw new Error(error.message);
}

async function loadPeriod(admin: ReturnType<typeof createAdminClient>, billingPeriodId: string) {
  const { data, error } = await admin.from("monthly_billing_periods")
    .select("id,subscription_id,amount,due_date,status")
    .eq("id", billingPeriodId)
    .single();
  if (error || !data) throw new Error("MONTHLY_BILLING_PERIOD_NOT_FOUND");
  return data as { id: string; subscription_id: string; amount: number | string; due_date: string; status: string };
}

async function loadBinding(admin: ReturnType<typeof createAdminClient>, subscriptionId: string): Promise<BindingRow | null> {
  const { data, error } = await admin.from("monthly_recurring_provider_bindings")
    .select("provider_authorization_id,authorization_status,initial_qr_payload,initial_qr_image_base64,initial_qr_expires_at")
    .eq("subscription_id", subscriptionId)
    .eq("provider", "ASAAS")
    .eq("method", "PIX_AUTOMATIC")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BindingRow | null;
}

function parseCustomerContext(value: unknown): CustomerContext {
  if (!value || typeof value !== "object") throw new Error("PAYMENT_CUSTOMER_PROFILE_UNAVAILABLE");
  const item = value as Record<string, unknown>;
  if (typeof item.user_id !== "string" || typeof item.full_name !== "string" || typeof item.external_reference !== "string") {
    throw new Error("PAYMENT_CUSTOMER_PROFILE_UNAVAILABLE");
  }
  return {
    user_id: item.user_id,
    full_name: item.full_name,
    email: typeof item.email === "string" ? item.email : null,
    billing_document: typeof item.billing_document === "string" ? item.billing_document : null,
    external_reference: item.external_reference,
    provider_customer_id: typeof item.provider_customer_id === "string" ? item.provider_customer_id : null,
  };
}

function normalizeAuthorizationStatus(value: string | null) {
  const status = String(value ?? "").toUpperCase();
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "REFUSED") return "REFUSED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "EXPIRED") return "EXPIRED";
  return "PENDING";
}

function publicView(amount: number | string, billingStatus: string, binding: BindingRow): MonthlyPixAutomaticView {
  const auth = String(binding.authorization_status ?? "PENDING").toUpperCase();
  const state: MonthlyPixAutomaticView["state"] = billingStatus === "PAID" && auth === "ACTIVE"
    ? "PAID"
    : auth === "ACTIVE" ? "ACTIVE"
    : auth === "REFUSED" ? "REFUSED"
    : auth === "EXPIRED" ? "EXPIRED"
    : auth === "CANCELLED" ? "SUSPENDED"
    : "PENDING";
  return {
    state,
    amount: Number(amount),
    qrCodePayload: binding.initial_qr_payload,
    qrCodeImageBase64: binding.initial_qr_image_base64,
    expiresAt: binding.initial_qr_expires_at,
  };
}
