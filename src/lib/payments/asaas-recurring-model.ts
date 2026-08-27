export type AsaasPixAutomaticAuthorizationStatus =
  | "PENDING"
  | "ACTIVE"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUSED";

export type MonthlyRecurringAgreementStatus =
  | "PENDING_AUTHORIZATION"
  | "ACTIVE"
  | "GRACE"
  | "SUSPENDED"
  | "CANCELLED";

export type AsaasRecurringMethod = "PIX_AUTOMATIC" | "CREDIT_CARD";

export type AsaasRecurringAgreement = {
  subscriptionId: string;
  customerId: string;
  method: AsaasRecurringMethod;
  providerAuthorizationId: string | null;
  providerSubscriptionId: string | null;
  authorizationStatus: AsaasPixAutomaticAuthorizationStatus | null;
  status: MonthlyRecurringAgreementStatus;
};
