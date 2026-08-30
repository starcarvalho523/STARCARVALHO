"use client";
import { Banknote,LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCheckoutPanel } from "@/components/credit-checkout-panel";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import { MonthlyPixAutomaticPanel } from "@/components/monthly-pix-automatic-panel";

export function MonthlyPaymentActions({billingPeriodId,allowCash=false,pendingMethod,pixEnabled=true,pixAutomaticEnabled=false,creditEnabled=true}:{billingPeriodId:string;allowCash?:boolean;pendingMethod?:string|null;pixEnabled?:boolean;pixAutomaticEnabled?:boolean;creditEnabled?:boolean}){
 const router=useRouter();const[loading,setLoading]=useState(false);const[error,setError]=useState<string|null>(null);const[useAutomaticPix,setUseAutomaticPix]=useState(false);
 const cash=async()=>{if(loading)return;setLoading(true);setError(null);try{const response=await fetch("/api/payments/monthly/cash",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({billingPeriodId})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"Falha ao registrar pagamento.");router.refresh()}catch(cause){setError(cause instanceof Error?cause.message:"Falha ao registrar pagamento.")}finally{setLoading(false)}};
 const pendingPix=pendingMethod==="PIX";
 const pendingCredit=pendingMethod==="CREDIT_CARD"||pendingMethod==="CARD";
 if(pendingMethod){return <div className="mt-3 space-y-3"><div className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800"><b>Pagamento em andamento.</b> Você pode continuar no método atual ou trocar agora. Ao escolher outro método, a tentativa anterior é encerrada automaticamente; não precisa esperar expirar.</div><div className="grid gap-2 sm:grid-cols-2">{pendingPix?<div className="sm:col-span-2"><PixPaymentPanel billingPeriodId={billingPeriodId} resumeExisting/></div>:pendingCredit?<div className="sm:col-span-2"><CreditCheckoutPanel billingPeriodId={billingPeriodId} resumeExisting/></div>:<p className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-600 sm:col-span-2">Existe uma cobrança em processamento. Atualize a página em instantes para continuar.</p>}{pendingPix&&creditEnabled?<CreditCheckoutPanel billingPeriodId={billingPeriodId}/>:null}{pendingCredit&&pixEnabled?<PixPaymentPanel billingPeriodId={billingPeriodId}/>:null}</div></div>}
 const onlinePixEnabled=pixEnabled||pixAutomaticEnabled;
 return <div className="mt-3 space-y-3">
   <div className="grid gap-2 sm:grid-cols-2">
     {allowCash?<button type="button" disabled={loading} onClick={()=>void cash()} className="flex h-16 items-center justify-center gap-2 rounded-xl border border-emerald-200 font-bold text-emerald-700 disabled:opacity-50">{loading?<LoaderCircle className="size-5 animate-spin"/>:<Banknote className="size-5"/>}Dinheiro</button>:null}
     {pixEnabled&&!useAutomaticPix?<PixPaymentPanel billingPeriodId={billingPeriodId}/>:null}
     {pixAutomaticEnabled&&useAutomaticPix?<div className="sm:col-span-2"><MonthlyPixAutomaticPanel billingPeriodId={billingPeriodId}/></div>:null}
     {creditEnabled?<CreditCheckoutPanel billingPeriodId={billingPeriodId}/>:null}
   </div>
   {pixAutomaticEnabled?<label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={useAutomaticPix} onChange={(event)=>setUseAutomaticPix(event.target.checked)} className="mt-0.5 size-4"/><span><b>Quero ativar o Pix Automático para as próximas mensalidades.</b><br/><span className="text-slate-500">Desmarcado, o Pix funciona normalmente e paga apenas esta competência. Marcado, você inicia a autorização recorrente do Pix Automático.</span></span></label>:null}
   {!allowCash&&!onlinePixEnabled&&!creditEnabled?<p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Pagamento online indisponível nesta unidade.</p>:null}
   {error?<p role="alert" className="text-sm font-semibold text-red-600">{error}</p>:null}
 </div>
}
