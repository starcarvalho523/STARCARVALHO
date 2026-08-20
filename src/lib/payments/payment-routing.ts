export type PaymentRoute={obligationType:"PARKING_SESSION"|"MONTHLY_BILLING_PERIOD";method:"PIX"|"CREDIT_CARD";channel:"QR"|"HOSTED_CHECKOUT";provider:"ASAAS"|"EFI"};
export function resolvePaymentRoute(route:Omit<PaymentRoute,"provider">):PaymentRoute{return{...route,provider:"ASAAS"}}
