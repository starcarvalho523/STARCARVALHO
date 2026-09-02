export type MonthlyPaymentMethod = "PIX_AUTOMATIC" | "CREDIT_CARD";

export type MonthlyPaymentRoute = {
  obligationType: "MONTHLY_BILLING_PERIOD";
  method: MonthlyPaymentMethod;
  provider: "ASAAS";
  channel: "PIX_AUTOMATIC" | "SUBSCRIPTION";
};

export function resolveMonthlyPaymentRoute(method: MonthlyPaymentMethod): MonthlyPaymentRoute {
  if (method === "PIX_AUTOMATIC") {
    return {
      obligationType: "MONTHLY_BILLING_PERIOD",
      method,
      provider: "ASAAS",
      channel: "PIX_AUTOMATIC",
    };
  }

  return {
    obligationType: "MONTHLY_BILLING_PERIOD",
    method,
    provider: "ASAAS",
    channel: "SUBSCRIPTION",
  };
}
