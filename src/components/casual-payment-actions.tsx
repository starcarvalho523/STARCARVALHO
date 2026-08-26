"use client";
import { CreditCheckoutPanel } from "@/components/credit-checkout-panel";
import { EfiCardPaymentPanel } from "@/components/efi-card-payment-panel";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import type { EfiCardBrowserEnvironment } from "@/lib/payments/payment-availability";
export function CasualPaymentActions({sessionId,pix,credit,efiCard,efiCardEnvironment}:{sessionId:string;pix:boolean;credit:boolean;efiCard:boolean;efiCardEnvironment?:EfiCardBrowserEnvironment|null}){if(!pix&&!credit&&!efiCard)return <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Pagamento online indisponível nesta unidade.</p>;return <section className="mt-4"><h3 className="mb-2 font-bold">Pagar agora</h3><div className="grid gap-2 sm:grid-cols-2">{pix?<PixPaymentPanel sessionId={sessionId}/>:null}{credit?<CreditCheckoutPanel sessionId={sessionId}/>:null}{efiCard&&efiCardEnvironment?<EfiCardPaymentPanel sessionId={sessionId} environment={efiCardEnvironment}/>:null}</div></section>}
