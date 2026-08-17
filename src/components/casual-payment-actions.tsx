"use client";
import { CreditCheckoutPanel } from "@/components/credit-checkout-panel";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
export function CasualPaymentActions({sessionId,pix,credit}:{sessionId:string;pix:boolean;credit:boolean}){if(!pix&&!credit)return <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Pagamento online indisponível nesta unidade.</p>;return <section className="mt-4"><h3 className="mb-2 font-bold">Pagar agora</h3><div className="grid gap-2 sm:grid-cols-2">{pix?<PixPaymentPanel sessionId={sessionId}/>:null}{credit?<CreditCheckoutPanel sessionId={sessionId}/>:null}</div></section>}
