import type { AsaasPixAutomaticAuthorizationStatus } from "./asaas-pix-automatic-contract";

export type ExistingMonthlySubscriptionStatus =
  | "PENDING_ACTIVATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "CANCELED"
  | "ENDED";

export function authorizationAllowsActivation(status: AsaasPixAutomaticAuthorizationStatus | null) {
  return status === "ACTIVE";
}

export function subscriptionStatusAfterAuthorization(
  current: ExistingMonthlySubscriptionStatus,
  authorization: AsaasPixAutomaticAuthorizationStatus | null,
): ExistingMonthlySubscriptionStatus {
  if (current === "CANCELED" || current === "ENDED") return current;
  if (authorization === "CANCELLED" || authorization === "EXPIRED") return "SUSPENDED";
  return current;
}

export function canActivateMonthlyCoverage(input: {
  subscriptionStatus: ExistingMonthlySubscriptionStatus;
  authorizationStatus: AsaasPixAutomaticAuthorizationStatus | null;
  billingPeriodStatus: string;
}) {
  return input.subscriptionStatus === "PENDING_ACTIVATION"
    && authorizationAllowsActivation(input.authorizationStatus)
    && input.billingPeriodStatus === "PAID";
}
