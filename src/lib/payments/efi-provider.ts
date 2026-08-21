import type { PaymentProvider,ProviderCharge,ProviderCheckout,ProviderCheckoutPayment,ProviderCustomer,ProviderPixQrCode,ProviderWebhookEvent,ProviderCheckoutWebhookEvent } from "./payment-provider";
import type { EfiAuthRuntimeConfig } from "./efi-config";

/** Boundary only: no HTTP client is attached until Efí sandbox approval and mTLS design are approved. */
export class EfiProvider implements PaymentProvider{
 readonly name="EFI" as const;readonly environment="SANDBOX" as const;readonly capabilities=[{method:"PIX" as const,channel:"QR" as const},{method:"CREDIT_CARD" as const,channel:"HOSTED_CHECKOUT" as const}];
 constructor(readonly config:EfiAuthRuntimeConfig){}
 private unavailable():never{throw new Error("EFI_NOT_CONFIGURED")}
 async findCustomerByExternalReference():Promise<ProviderCustomer|null>{return null}
 async createCustomer():Promise<ProviderCustomer>{return this.unavailable()}
 async createPixPayment():Promise<ProviderCharge>{return this.unavailable()}
 async getPixQrCode():Promise<ProviderPixQrCode>{return this.unavailable()}
 async findPaymentByExternalReference():Promise<ProviderCharge|null>{return this.unavailable()}
 async createCreditCardPayment():Promise<ProviderCharge>{return this.unavailable()}
 async createCreditCardCheckout():Promise<ProviderCheckout>{return this.unavailable()}
 async resolveCheckoutPayment():Promise<ProviderCheckoutPayment>{return this.unavailable()}
 async getPayment():Promise<ProviderCharge>{return this.unavailable()}
 async cancelPayment():Promise<void>{this.unavailable()}
 getHostedPaymentUrl(){return null}
 validateWebhook(){return false}
 parseWebhook():ProviderWebhookEvent{return this.unavailable()}
 parseCheckoutWebhook():ProviderCheckoutWebhookEvent{return this.unavailable()}
}
