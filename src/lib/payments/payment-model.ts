export type PaymentMethod = "CASH" | "PIX" | "CARD" | "DEBIT_CARD" | "CREDIT_CARD";
export type PaymentChannel = "MANUAL" | "QR" | "HOSTED_CHECKOUT" | "POINT" | "TAP";
export type PaymentProviderName = "INTERNAL" | "ASAAS" | "MERCADO_PAGO";
export type OperationalPaymentStatus = "PENDING" | "APPROVED" | "FAILED" | "CANCELLED" | "REFUNDED";
export type SettlementStatus = "PENDING" | "SETTLED" | "FAILED" | "CANCELLED" | "REFUNDED" | "UNKNOWN";
export type PaymentSubject =
  | { type: "PARKING_SESSION"; id: string }
  | { type: "MONTHLY_BILLING_PERIOD"; id: string };

export type PaymentCapability = {
  method: PaymentMethod;
  channel: PaymentChannel;
  provider: PaymentProviderName;
  enabled: boolean;
  configured: boolean;
  legacy: boolean;
};

export const providerCapabilities = {
  INTERNAL: [{ method: "CASH", channel: "MANUAL" }, { method: "CARD", channel: "MANUAL" }],
  ASAAS: [{ method: "PIX", channel: "QR" }, { method: "CREDIT_CARD", channel: "HOSTED_CHECKOUT" }],
  MERCADO_PAGO: [{ method: "DEBIT_CARD", channel: "POINT" }, { method: "CREDIT_CARD", channel: "POINT" }],
} as const;
