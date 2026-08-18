export type FinancialPaymentLike = {
  provider?: string | null;
  provider_environment?: string | null;
};

/**
 * Manual/internal payments are operational by definition. Provider-backed
 * payments only enter real financial analytics when their persisted runtime
 * environment is PRODUCTION. This keeps historical/sandbox Asaas data out of
 * revenue without blocking future live Asaas payments.
 */
export function isOperationalFinancialPayment(payment: FinancialPaymentLike) {
  if (!payment.provider) return true;
  if (payment.provider.toUpperCase() !== "ASAAS") return true;
  return payment.provider_environment === "PRODUCTION";
}
