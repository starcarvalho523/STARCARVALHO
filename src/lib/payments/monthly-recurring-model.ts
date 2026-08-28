export type MonthlyRecurringProvider = "ASAAS";
export type MonthlyRecurringMethod = "PIX_AUTOMATIC" | "CREDIT_CARD";

export type MonthlySubscriptionState =
  | "PENDING_ACTIVATION"
  | "ACTIVE"
  | "GRACE"
  | "SUSPENDED"
  | "CANCEL_AT_PERIOD_END"
  | "CANCELED";

export type AsaasPixAutomaticAuthorizationState =
  | "PENDING"
  | "ACTIVE"
  | "REFUSED"
  | "CANCELLED"
  | "EXPIRED";

export type MonthlyRecurringBinding = {
  subscriptionId: string;
  provider: MonthlyRecurringProvider;
  method: MonthlyRecurringMethod;
  providerCustomerId: string | null;
  providerAuthorizationId: string | null;
  providerSubscriptionId: string | null;
  authorizationState: AsaasPixAutomaticAuthorizationState | null;
};

export function monthlyRecurringRoute(method: MonthlyRecurringMethod) {
  return {
    obligationType: "MONTHLY_BILLING_PERIOD" as const,
    method,
    provider: "ASAAS" as const,
  };
}
