import { assertEfiTxid, parseEfiAmountToCents } from "./efi-contracts.ts";
export type EfiPixWebhookEvent={txid:string;endToEndId:string;amountCents:number;paidAt:string};
/** Pure parser only; inbound mTLS termination and database effects are intentionally out of scope. */
export function parseEfiPixWebhook(payload:unknown):EfiPixWebhookEvent[]{if(!payload||typeof payload!=="object"||!Array.isArray((payload as Record<string,unknown>).pix))throw new Error("EFI_WEBHOOK_INVALID");return (payload as {pix:unknown[]}).pix.map(parseEvent)}
export function efiPixIdempotencyKey(event:Pick<EfiPixWebhookEvent,"endToEndId">):string{if(!isEfiEndToEndId(event.endToEndId))throw new Error("EFI_WEBHOOK_INVALID");return`efi:pix:${event.endToEndId}`}
function parseEvent(value:unknown):EfiPixWebhookEvent{if(!value||typeof value!=="object")throw new Error("EFI_WEBHOOK_INVALID");const pix=value as Record<string,unknown>;const txid=assertEfiTxid(pix.txid);if(!isEfiEndToEndId(pix.endToEndId)||typeof pix.horario!=="string"||!Number.isFinite(Date.parse(pix.horario)))throw new Error("EFI_WEBHOOK_INVALID");try{return{txid,endToEndId:pix.endToEndId,amountCents:parseEfiAmountToCents(pix.valor),paidAt:pix.horario}}catch{throw new Error("EFI_WEBHOOK_INVALID")}}
function isEfiEndToEndId(value:unknown):value is string{return typeof value==="string"&&/^[A-Za-z0-9]{1,64}$/.test(value)}
