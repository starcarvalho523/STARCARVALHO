export type ProviderPaymentState = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REVIEW";

export type CreateChargeInput = {
  customerId: string;
  amount: number;
  dueDate: string;
  description: string;
  externalReference: string;
};

export type ProviderCharge = {
  providerPaymentId: string;
  providerCustomerId: string;
  providerStatus: string;
  amount: number;
  externalReference: string;
  hostedPaymentUrl: string | null;
  qrCodePayload: string | null;
  qrCodeImageBase64: string | null;
  expiresAt: string | null;
};

export type ProviderWebhookEvent = {
  id: string;
  type: string;
  paymentId: string;
  paymentStatus: string;
  amount: number | null;
  externalReference: string | null;
  billingType: string | null;
};

export interface PaymentProvider {
  readonly name: "ASAAS";
  readonly environment: "SANDBOX";
  createPixCharge(input: CreateChargeInput): Promise<ProviderCharge>;
  createCreditCardPayment(input: CreateChargeInput): Promise<ProviderCharge>;
  getPayment(providerPaymentId: string): Promise<ProviderCharge>;
  cancelPayment(providerPaymentId: string): Promise<void>;
  getHostedPaymentUrl(payment: ProviderCharge): string | null;
  validateWebhook(receivedToken: string | null, expectedToken: string): boolean;
  parseWebhook(payload: unknown): ProviderWebhookEvent;
}

