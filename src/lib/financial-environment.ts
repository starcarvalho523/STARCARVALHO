export type FinancialPaymentLike = { provider?: string | null };

/**
 * Providers that are explicitly sandbox-only in the currently published code.
 * AsaasProvider rejects any ASAAS_ENVIRONMENT other than "sandbox", so an ASAAS
 * payment cannot be treated as operational revenue until live support is
 * intentionally implemented and this classification is replaced by persisted
 * per-payment environment filtering.
 */
const sandboxOnlyProviders = new Set(["ASAAS"]);

export function isOperationalFinancialPayment(payment: FinancialPaymentLike) {
  return !payment.provider || !sandboxOnlyProviders.has(payment.provider.toUpperCase());
}
