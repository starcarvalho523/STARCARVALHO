"use client";
import { Banknote,LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCheckoutPanel } from "@/components/credit-checkout-panel";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import { MonthlyPixAutomaticPanel } from "@/components/monthly-pix-automatic-panel";

export function MonthlyPaymentActions({billingPeriodId,allowCash=false,pendingMethod,pixEnabled=true,pixAutomaticEnabled=false,creditEnabled=true}:{billingPeriodId:string;allowCash?:boolean;pendingMethod?:string|null;pixEnabled?:boolean;pixAutomaticEnabled?:boolean;creditEnabled?:boolean}){
 const router=useRouter();const[loading,setLoading]=useState(false);const[error,setError]=useState<string|null>(null);
 const cash=async()=>{if(loading)return;setLoading(true);setError(null);try{const response=await fetch("/api/payments/monthly/cash",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({billingPeriodId})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"Falha ao registrar pagamento.");router.refresh()}catch(cause){setError(cause instanceof Error?cause.message:"Falha ao registrar pagamento.")}finally{setLoading(false)}};
 const pendingPix=pendingMethod==="PIX";
 const pendingCredit=pendingMethod==="CREDIT_CARD"||pendingMethod==="CARD";
 if(pendingMethod){return <div className="mt-3 space-y-2"><p className="text-sm font-semibold text-amber-800">Você já iniciou este pagamento. Continue a mesma cobrança abaixo; não será criada outra.</p>{pendingPix?<PixPaymentPanel billingPeriodId={billingPeriodId} resumeExisting/>:pendingCredit?<CreditCheckoutPanel billingPeriodId={billingPeriodId} resumeExisting/>:<p className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-600">Existe uma cobrança em processamento. Atualize a página em instantes para continuar.</p>}</div>}
 const onlinePixEnabled=pixEnabled||pixAutomaticEnabled;
 return <div className="mt-3 grid gap-2 sm:grid-cols-3">{allowCash?<button type="button" disabled={loading} onClick={()=>void cash()} className="flex h-16 items-center justify-center gap-2 rounded-xl border border-emerald-200 font-bold text-emerald-700 disabled:opacity-50">{loading?<LoaderCircle className="size-5 animate-spin"/>:<Banknote className="size-5"/>}Dinheiro</button>:null}{pixAutomaticEnabled?<MonthlyPixAutomaticPanel billingPeriodId={billingPeriodId}/>:pixEnabled?<PixPaymentPanel billingPeriodId={billingPeriodId}/>:null}{creditEnabled?<CreditCheckoutPanel billingPeriodId={billingPeriodId}/>:null}{!allowCash&&!onlinePixEnabled&&!creditEnabled?<p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600 sm:col-span-3">Pagamento online indisponível nesta unidade.</p>:null}{error?<p role="alert" className="text-sm font-semibold text-red-600 sm:col-span-3">{error}</p>:null}</div>
}
