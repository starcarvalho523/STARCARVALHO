export type ProviderPaymentState = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REVIEW";

export type ProviderCustomer = {
  providerCustomerId: string;
  externalReference: string | null;
};

export type CreateProviderCustomerInput = {
  name: string;
  cpfCnpj: string;
  email: string | null;
  externalReference: string;
};

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
  billingType: string | null;
  amount: number;
  externalReference: string;
  hostedPaymentUrl: string | null;
  qrCodePayload: string | null;
  qrCodeImageBase64: string | null;
  expiresAt: string | null;
};

export type CreateCheckoutInput = {
  customerId?: string | null;
  amount: number;
  description: string;
  externalReference: string;
  expiresInMinutes: number;
  callback: { successUrl: string; cancelUrl: string; expiredUrl: string };
};

export type ProviderCheckout = {
  providerCheckoutId: string;
  providerStatus: string;
  amount: number;
  externalReference: string;
  link: string;
  expiresAt: string;
};

export type ProviderCheckoutPayment = {
  providerCheckoutId: string;
  providerCheckoutStatus: string;
  providerPaymentId: string;
  providerPaymentStatus: string;
  amount: number;
  billingType: string | null;
  externalReference: string;
};

export type ProviderPixQrCode = Pick<ProviderCharge, "qrCodePayload" | "qrCodeImageBase64" | "expiresAt">;

export type ProviderWebhookEvent = {
  id: string;
  type: string;
  paymentId: string;
  paymentStatus: string;
  amount: number | null;
  externalReference: string | null;
  billingType: string | null;
  /** Server-side correlation data supplied by Asaas for Checkout charges. */
  checkoutId: string | null;
};

export type ProviderCheckoutWebhookEvent = {
  id: string;
  type: string;
  checkoutId: string;
  checkoutStatus: string;
  externalReference: string | null;
};

export interface PaymentProvider {
  readonly name: "ASAAS";
  readonly environment: "SANDBOX" | "PRODUCTION";
  readonly capabilities: ReadonlyArray<{ method:"PIX"|"CREDIT_CARD"; channel:"QR"|"HOSTED_CHECKOUT" }>;
  findCustomerByExternalReference(externalReference:string):Promise<ProviderCustomer|null>;
  createCustomer(input:CreateProviderCustomerInput):Promise<ProviderCustomer>;
  createPixPayment(input: CreateChargeInput): Promise<ProviderCharge>;
  getPixQrCode(providerPaymentId: string): Promise<ProviderPixQrCode>;
  findPaymentByExternalReference(externalReference: string): Promise<ProviderCharge | null>;
  createCreditCardPayment(input: CreateChargeInput): Promise<ProviderCharge>;
  createCreditCardCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout>;
  resolveCheckoutPayment(checkoutId:string,expectedExternalReference:string,expectedPaymentId:string,expectedAmount:number):Promise<ProviderCheckoutPayment>;
  getPayment(providerPaymentId: string): Promise<ProviderCharge>;
  cancelPayment(providerPaymentId: string): Promise<void>;
  getHostedPaymentUrl(payment: ProviderCharge): string | null;
  validateWebhook(receivedToken: string | null, expectedToken: string): boolean;
  parseWebhook(payload: unknown): ProviderWebhookEvent;
  parseCheckoutWebhook(payload: unknown): ProviderCheckoutWebhookEvent;
}

export type PointTerminalSnapshot = {
  enabled: boolean;
  status: "NOT_CONFIGURED" | "AWAITING_TERMINAL" | "READY" | "DISABLED" | "ERROR";
  operatingMode: "STANDALONE" | "PDV" | null;
};

export interface PointPaymentProvider {
  readonly name: "MERCADO_PAGO";
  readonly capabilities: ReadonlyArray<{ method: "DEBIT_CARD" | "CREDIT_CARD"; channel: "POINT" }>;
  evaluateReadiness(terminals: readonly PointTerminalSnapshot[], integrationEnabled: boolean): {
    terminalReady: boolean;
    operational: boolean;
    reason: "READY" | "INTEGRATION_DISABLED" | "AWAITING_TERMINAL";
  };
}
