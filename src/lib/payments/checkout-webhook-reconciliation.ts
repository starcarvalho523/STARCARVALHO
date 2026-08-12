export type CheckoutCandidate = {
  transactionId: string;
  checkoutId: string;
  externalReference: string;
  amount: number;
};

export function selectCheckoutCandidates(
  candidates: readonly CheckoutCandidate[],
  reportedAmount: number,
  providerCheckoutId: string | null,
) {
  return candidates.filter((candidate) =>
    Number(candidate.amount) === Number(reportedAmount)
    && (providerCheckoutId === null || candidate.checkoutId === providerCheckoutId),
  );
}

export function checkoutResolutionDisposition(cause: unknown): "NO_MATCH" | "REVIEW" | "ERROR" {
  if (!(cause instanceof Error)) return "ERROR";
  if (cause.message === "ASAAS_CHECKOUT_PAYMENT_NOT_FOUND" || cause.message === "ASAAS_CHECKOUT_PAYMENT_ID_MISMATCH") return "NO_MATCH";
  if (/^ASAAS_CHECKOUT_(PAYMENT_AMBIGUOUS|PAYMENT_METHOD_MISMATCH|PAYMENT_AMOUNT_MISMATCH|SESSION_MISMATCH)$/.test(cause.message)) return "REVIEW";
  return "ERROR";
}
