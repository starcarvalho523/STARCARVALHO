type PaymentRouteFailure = { error: string; status: number };

type ProviderHttpError = Error & { status: number };

export function paymentRouteFailure(error: unknown, fallback: string): PaymentRouteFailure {
  const message = error instanceof Error ? error.message : "PAYMENT_REQUEST_FAILED";

  if (message.includes("AUTHENTICATION_REQUIRED")) return { error: "AUTHENTICATION_REQUIRED", status: 401 };
  if (message.includes("FORBIDDEN")) return { error: "PAYMENT_FORBIDDEN", status: 403 };
  if (message.includes("SESSION_NOT_FOUND") || message.includes("PAYMENT_CUSTOMER_NOT_FOUND")) return { error: "PAYMENT_NOT_FOUND", status: 404 };
  if (message.includes("CUSTOMER_BILLING_DOCUMENT_REQUIRED")) return { error: "CUSTOMER_BILLING_DOCUMENT_REQUIRED", status: 422 };
  if (message.includes("PAYMENT_NOT_READY") || message.includes("INVALID_PAYMENT_AMOUNT")) return { error: "PAYMENT_NOT_READY", status: 409 };
  if (message.includes("PAYMENT_METHOD_NOT_AVAILABLE")) return { error: "PAYMENT_METHOD_NOT_AVAILABLE", status: 409 };
  if (isProviderHttpError(error)) {
    if (error.status === 400 || error.status === 422) return { error: "PAYMENT_PROVIDER_VALIDATION_FAILED", status: 422 };
    return { error: "PAYMENT_PROVIDER_UNAVAILABLE", status: 502 };
  }
  if (/NOT_CONFIGURED|LIVE_PAYMENTS_DISABLED|ENVIRONMENT_MISMATCH/.test(message)) return { error: "PAYMENT_PROVIDER_UNAVAILABLE", status: 503 };
  return { error: fallback, status: 500 };
}

function isProviderHttpError(error: unknown): error is ProviderHttpError {
  return error instanceof Error && error.name === "AsaasPublicError" && typeof (error as { status?: unknown }).status === "number";
}
