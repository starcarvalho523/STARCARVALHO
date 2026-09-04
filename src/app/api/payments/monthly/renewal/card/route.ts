import { createClient } from "@/lib/supabase/server";
import { AsaasPublicError } from "@/lib/payments/asaas-provider";
import { activateMonthlyRenewalWithNativeCard } from "@/lib/payments/monthly-renewal-native-card";

export const runtime="nodejs";

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>null);
    if(!isRecord(body))return Response.json({error:"Dados inválidos."},{status:400});
    const subscriptionId=text(body.subscriptionId,80);
    if(!/^[0-9a-f-]{36}$/i.test(subscriptionId))return Response.json({error:"Assinatura inválida."},{status:400});

    const card=isRecord(body.creditCard)?body.creditCard:null;
    const holder=isRecord(body.creditCardHolderInfo)?body.creditCardHolderInfo:null;
    if(!card||!holder)return Response.json({error:"Preencha os dados do cartão e do titular."},{status:400});

    const number=digits(card.number,19);
    const holderName=text(card.holderName,80);
    const expiryMonth=digits(card.expiryMonth,2).padStart(2,"0");
    let expiryYear=digits(card.expiryYear,4);
    const ccv=digits(card.ccv,4);
    if(expiryYear.length===2)expiryYear=`20${expiryYear}`;
    if(!/^\d{13,19}$/.test(number)||!/^(0[1-9]|1[0-2])$/.test(expiryMonth)||!/^20\d{2}$/.test(expiryYear)||!/^\d{3,4}$/.test(ccv)||holderName.length<2)return Response.json({error:"Confira os dados do cartão."},{status:400});

    const name=text(holder.name,100)||holderName;
    const email=text(holder.email,160).toLowerCase();
    const cpfCnpj=digits(holder.cpfCnpj,14);
    const postalCode=digits(holder.postalCode,8);
    const addressNumber=text(holder.addressNumber,20);
    const addressComplement=text(holder.addressComplement,80)||null;
    const mobilePhone=digits(holder.mobilePhone,13);
    if(!/^\S+@\S+\.\S+$/.test(email)||!^(?:\d{11}|\d{14})$/.test(cpfCnpj)||!/^\d{8}$/.test(postalCode)||!addressNumber||!/^\d{10,13}$/.test(mobilePhone))return Response.json({error:"Confira CPF/CNPJ, e-mail, celular, CEP e número do endereço."},{status:400});

    const remoteIp=clientIp(request);
    if(!remoteIp)return Response.json({error:"Não foi possível validar a origem segura da solicitação. Atualize a página e tente novamente."},{status:400});

    const supabase=await createClient();
    const{data:hasPending,error:pendingError}=await supabase.rpc("has_customer_monthly_pending_manual_payment",{target_subscription:subscriptionId});
    if(pendingError)throw new Error(pendingError.message);
    if(hasPending===true)return Response.json({error:"Existe um pagamento manual em andamento. Conclua ou troque essa tentativa antes de ativar a renovação automática."},{status:409});

    const renewal=await activateMonthlyRenewalWithNativeCard(subscriptionId,supabase,{
      creditCard:{holderName,number,expiryMonth,expiryYear,ccv},
      creditCardHolderInfo:{name,email,cpfCnpj,postalCode,addressNumber,addressComplement,mobilePhone,phone:mobilePhone},
    },remoteIp);
    return Response.json({renewal},{headers:{"cache-control":"no-store"}});
  }catch(error){
    const code=error instanceof Error?error.message:"UNKNOWN_ERROR";
    console.error("MONTHLY_NATIVE_CARD_ACTIVATION_FAILED",{code:safeCode(code)});
    if(error instanceof AsaasPublicError&&error.status===400)return Response.json({error:"O Asaas não conseguiu validar o cartão. Confira os dados informados ou tente outro cartão."},{status:400});
    if(code.includes("CUSTOMER_BILLING_DOCUMENT_REQUIRED"))return Response.json({error:"Complete seu CPF/CNPJ em Minha conta antes de ativar a renovação."},{status:409});
    if(code.includes("RENEWAL_ORPHAN_REVIEW_REQUIRED"))return Response.json({error:"Existe uma tentativa anterior de cartão que precisa ser revisada antes de criar outra recorrência."},{status:409});
    if(code.includes("TimeoutError")||code.includes("AbortError"))return Response.json({error:"A validação do cartão demorou mais que o esperado. Nenhuma nova tentativa foi feita automaticamente. Aguarde alguns segundos e tente novamente."},{status:504});
    return Response.json({error:"Não foi possível ativar a renovação automática agora."},{status:503});
  }
}

function clientIp(request:Request){
  const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real=request.headers.get("x-real-ip")?.trim();
  const value=forwarded||real||"";
  return value&&value.length<=64?value:null;
}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
function text(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):""}
function digits(value:unknown,max:number){return text(value,max+8).replace(/\D/g,"").slice(0,max)}
function safeCode(value:string){return value.replace(/\b\d{13,19}\b/g,"[redacted-card]").replace(/\b(?:pay|cus|sub)_[A-Za-z0-9_-]+\b/g,"[redacted-id]").slice(0,120)}
