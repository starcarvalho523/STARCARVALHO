import { AsaasPublicError } from "./asaas-provider";

export type RenewalHttpError={
  status:number;
  code:string;
  message:string;
  retryable:boolean;
};

export function classifyCardActivationError(error:unknown):RenewalHttpError{
  const code=errorCode(error);

  if(error instanceof AsaasPublicError){
    if(error.status===400){
      const detail=`${error.publicCode??""} ${error.publicDescription??""}`.toLowerCase();
      const isCardSpecific=/credit.?card|cart[aã]o|cvv|ccv|security.?code|expiry|expiration|validade|holder|titular/.test(detail);
      if(isCardSpecific)return{status:400,code:"CARD_DATA_REJECTED",message:"O Asaas recusou os dados do cartão. Confira os dados do cartão e do titular antes de tentar novamente.",retryable:false};
      return{status:422,code:"PROVIDER_REQUEST_REJECTED",message:"O Asaas rejeitou os dados da solicitação antes de concluir a autorização. O cartão não foi classificado como recusado.",retryable:false};
    }
    if(error.status===429)return{status:503,code:"PROVIDER_RATE_LIMITED",message:"O Asaas está temporariamente limitando novas solicitações. Aguarde um momento; não envie o cartão repetidamente.",retryable:true};
    if(error.status>=500)return{status:503,code:"PROVIDER_UNAVAILABLE",message:"O Asaas está temporariamente indisponível. A solicitação não será repetida automaticamente.",retryable:true};
    if(error.status===401||error.status===403)return{status:502,code:"PROVIDER_AUTH_CONFIGURATION",message:"A integração de pagamentos precisa de revisão administrativa. Não tente reenviar o cartão agora.",retryable:false};
  }

  if(includesAny(code,["CUSTOMER_BILLING_DOCUMENT_REQUIRED"]))return{status:409,code:"BILLING_DOCUMENT_REQUIRED",message:"Complete seu CPF/CNPJ em Minha conta antes de ativar a renovação.",retryable:false};
  if(includesAny(code,["RENEWAL_ORPHAN_REVIEW_REQUIRED","RENEWAL_EVENT_RECONCILIATION_AMBIGUOUS","RENEWAL_EVENT_PROVIDER_SUBSCRIPTION_ALREADY_BOUND"]))return{status:409,code:"RENEWAL_REVIEW_REQUIRED",message:"Encontramos uma tentativa anterior que precisa ser reconciliada antes de criar outra recorrência.",retryable:false};
  if(includesAny(code,["RENEWAL_BINDING_ALREADY_EXISTS"]))return{status:409,code:"RENEWAL_ALREADY_BOUND",message:"A renovação já possui uma autorização vinculada. Atualize a página antes de tentar novamente.",retryable:false};
  if(includesAny(code,["RENEWAL_PROVIDER_INITIAL_CHARGE_NOT_READY","RENEWAL_PROVIDER_CANONICAL_NOT_FOUND","RENEWAL_PROVIDER_INITIAL_CHARGE_MISMATCH"]))return{status:409,code:"RENEWAL_SYNC_PENDING",message:"O Asaas recebeu a autorização e o Star Carvalhos ainda está sincronizando o estado. Atualize a página em alguns segundos; não envie o cartão novamente.",retryable:false};
  if(includesAny(code,["TimeoutError","AbortError"]))return{status:504,code:"PROVIDER_TIMEOUT",message:"O Asaas demorou para responder. A autorização pode já ter sido criada; atualize a página antes de qualquer nova tentativa.",retryable:false};
  if(includesAny(code,["ASAAS_RECURRING_SUBSCRIPTION_MISMATCH","RENEWAL_PROVIDER_SUBSCRIPTION_MISMATCH"]))return{status:409,code:"RENEWAL_RECONCILIATION_REQUIRED",message:"A recorrência foi recebida pelo provedor e precisa ser reconciliada. Atualize a página; não cadastre o cartão novamente.",retryable:false};

  return{status:500,code:"RENEWAL_INTERNAL_ERROR",message:"Não foi possível concluir a ativação. O sistema bloqueou novas tentativas automáticas para evitar duplicidade.",retryable:false};
}

export function classifyRenewalActionError(error:unknown):RenewalHttpError{
  const code=errorCode(error);
  if(error instanceof AsaasPublicError){
    if(error.status===429)return{status:503,code:"PROVIDER_RATE_LIMITED",message:"O Asaas está temporariamente limitando solicitações. Aguarde um momento e atualize a página.",retryable:true};
    if(error.status>=500)return{status:503,code:"PROVIDER_UNAVAILABLE",message:"O Asaas está temporariamente indisponível. Tente novamente mais tarde.",retryable:true};
    if(error.status>=400)return{status:409,code:"PROVIDER_ACTION_REJECTED",message:"O Asaas rejeitou esta alteração de renovação. O estado anterior foi preservado.",retryable:false};
  }
  if(code.includes("invalid_nextDueDate"))return{status:409,code:"INVALID_NEXT_DUE_DATE",message:"A próxima cobrança informada não é válida para reativação.",retryable:false};
  if(code.includes("CUSTOMER_BILLING_DOCUMENT_REQUIRED"))return{status:409,code:"BILLING_DOCUMENT_REQUIRED",message:"Para ativar a renovação automática, complete seu CPF/CNPJ em Minha conta.",retryable:false};
  if(code.includes("RENEWAL_PAID_COVERAGE_REQUIRED"))return{status:409,code:"PAID_COVERAGE_REQUIRED",message:"É necessário ter um ciclo pago antes de ativar a renovação automática.",retryable:false};
  if(includesAny(code,["RENEWAL_ORPHAN_REVIEW_REQUIRED","RENEWAL_EVENT_RECONCILIATION_AMBIGUOUS","RENEWAL_EVENT_PROVIDER_SUBSCRIPTION_ALREADY_BOUND"]))return{status:409,code:"RENEWAL_REVIEW_REQUIRED",message:"Existe uma tentativa anterior que precisa ser reconciliada antes de continuar.",retryable:false};
  return{status:500,code:"RENEWAL_INTERNAL_ERROR",message:"Não foi possível atualizar a renovação. O estado anterior foi preservado e nenhuma nova cobrança foi criada automaticamente.",retryable:false};
}

export function isAmbiguousRecurringCreationError(error:unknown){
  if(error instanceof AsaasPublicError)return error.status>=500||error.status===429;
  const code=errorCode(error);
  return includesAny(code,["ASAAS_RECURRING_SUBSCRIPTION_MISMATCH","RENEWAL_PROVIDER_SUBSCRIPTION_MISMATCH","TimeoutError","AbortError"]);
}

export function errorCode(error:unknown){return error instanceof Error?error.message:"UNKNOWN_ERROR"}
function includesAny(value:string,needles:string[]){return needles.some((needle)=>value.includes(needle))}
