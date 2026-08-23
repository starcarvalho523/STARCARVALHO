import "server-only";
import { resolveEfiCreditCardConfig } from "./efi-credit-card-config";

export type EfiCardPayer={name:string;cpf:string;email:string;phone:string};
export type EfiCardCharge={chargeId:string;status:"PENDING"|"PAID"|"FAILED"|"REVIEW";brand:string|null;last4:string|null};
export async function createEfiOneStep(input:{paymentToken:string;amountCents:number;payer:EfiCardPayer;externalReference:string}) :Promise<EfiCardCharge>{
 if(!input.paymentToken||!Number.isSafeInteger(input.amountCents)||input.amountCents<=0)throw new Error("EFI_CREDIT_CREATE_FAILED");
 const c=resolveEfiCreditCardConfig(); const auth=Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
 const oauth=await fetch(`${c.baseUrl}/v1/authorize`,{method:"POST",headers:{authorization:`Basic ${auth}`,"content-type":"application/json"},body:"{\"grant_type\":\"client_credentials\"}"});
 if(!oauth.ok)throw new Error("EFI_AUTH_FAILED"); const token=(await oauth.json() as {access_token?:unknown}).access_token;if(typeof token!=="string")throw new Error("EFI_AUTH_FAILED");
 const response=await fetch(`${c.baseUrl}/v1/charge/one-step`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({items:[{name:"Estadia Star Carvalhos",value:input.amountCents,amount:1}],metadata:{custom_id:input.externalReference,notification_url:c.notificationUrl},payment:{credit_card:{customer:{name:input.payer.name,cpf:input.payer.cpf,email:input.payer.email,phone_number:input.payer.phone},installments:1,payment_token:input.paymentToken}}})});
 if(!response.ok)throw new Error("EFI_CREDIT_CREATE_FAILED"); const body=await response.json() as {data?:{charge_id?:unknown;status?:unknown;payment?:{credit_card?:{brand?:unknown;card_mask?:unknown}}}};const data=body.data;if(!data||typeof data.charge_id!=="number"||typeof data.status!=="string")throw new Error("EFI_INVALID_RESPONSE");
 const s=data.status.toLowerCase();return{chargeId:String(data.charge_id),status:s==="paid"?"PAID":s==="unpaid"||s==="waiting"?"PENDING":s==="canceled"?"FAILED":"REVIEW",brand:typeof data.payment?.credit_card?.brand==="string"?data.payment.credit_card.brand:null,last4:typeof data.payment?.credit_card?.card_mask==="string"?data.payment.credit_card.card_mask.slice(-4):null};
}
