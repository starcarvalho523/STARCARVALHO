export type PaymentRoute={
  obligationType:"PARKING_SESSION"|"MONTHLY_BILLING_PERIOD";
  method:"PIX"|"CREDIT_CARD";
  channel:"QR"|"HOSTED_CHECKOUT";
  provider:"ASAAS"|"EFI";
};

/**
 * Política oficial de providers do Star Carvalhos:
 * - PIX avulso de estadia: Efí
 * - PIX de mensalidade: Asaas
 * - cartão via hosted checkout: Asaas
 *
 * Manter esta decisão centralizada evita regressões em que um fluxo
 * incidentalmente reutilize o provider do outro.
 */
export function resolvePaymentRoute(route:Omit<PaymentRoute,"provider">):PaymentRoute{
  if(route.method==="PIX"&&route.channel==="QR"){
    return{...route,provider:route.obligationType==="PARKING_SESSION"?"EFI":"ASAAS"};
  }
  return{...route,provider:"ASAAS"};
}
