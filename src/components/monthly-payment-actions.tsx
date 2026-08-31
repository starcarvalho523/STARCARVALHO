"use client";
import { Banknote,LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCheckoutPanel } from "@/components/credit-checkout-panel";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import { MonthlyPixAutomaticPanel } from "@/components/monthly-pix-automatic-panel";

type ActiveMethod="PIX"|"CREDIT_CARD"|null;

export function MonthlyPaymentActions({billingPeriodId,allowCash=false,pendingMethod,pixEnabled=true,pixAutomaticEnabled=false,creditEnabled=true}:{billingPeriodId:string;allowCash?:boolean;pendingMethod?:string|null;pixEnabled?:boolean;pixAutomaticEnabled?:boolean;creditEnabled?:boolean}){
 const router=useRouter();
 const initialMethod:ActiveMethod=pendingMethod==="PIX"?"PIX":pendingMethod==="CREDIT_CARD"||pendingMethod==="CARD"?"CREDIT_CARD":null;
 const[activeMethod,setActiveMethod]=useState<ActiveMethod>(initialMethod);
 const[switchingTo,setSwitchingTo]=useState<Exclude<ActiveMethod,null>|null>(null);
 const[loading,setLoading]=useState(false);
 const[error,setError]=useState<string|null>(null);
 const[useAutomaticPix,setUseAutomaticPix]=useState(false);

 const cash=async()=>{if(loading)return;setLoading(true);setError(null);try{const response=await fetch("/api/payments/monthly/cash",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({billingPeriodId})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"Falha ao registrar pagamento.");router.refresh()}catch(cause){setError(cause instanceof Error?cause.message:"Falha ao registrar pagamento.")}finally{setLoading(false)}};
 const beginSwitch=(method:Exclude<ActiveMethod,null>)=>{if(method!==activeMethod)setSwitchingTo(method)};
 const finishSwitch=(method:Exclude<ActiveMethod,null>)=>{setActiveMethod(method);setSwitchingTo(null)};
 const switchingLabel=switchingTo==="PIX"?"Preparando PIX...":switchingTo==="CREDIT_CARD"?"Preparando cartão...":null;
 const hasPending=Boolean(pendingMethod)||activeMethod!==null;

 if(hasPending){
  return <div className="mt-3 space-y-3">
   <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800"><b>Pagamento em andamento.</b> Você pode continuar no método atual ou trocar agora. Ao escolher outro método, a tentativa anterior é encerrada automaticamente; não precisa esperar expirar.</div>
   <div className="grid gap-2 sm:grid-cols-2">
    {pixEnabled?<div className={activeMethod==="PIX"?"relative sm:col-span-2":switchingTo==="PIX"?"pointer-events-none opacity-0":""}>
      <PixPaymentPanel billingPeriodId={billingPeriodId} resumeExisting={initialMethod==="PIX"} onSwitchStart={()=>beginSwitch("PIX")} onSwitchReady={()=>finishSwitch("PIX")}/>
      {activeMethod==="PIX"&&switchingTo?<SwitchOverlay label={switchingLabel??"Preparando pagamento..."}/>:null}
    </div>:null}
    {creditEnabled?<div className={activeMethod==="CREDIT_CARD"?"relative sm:col-span-2":switchingTo==="CREDIT_CARD"?"pointer-events-none opacity-0":""}>
      <CreditCheckoutPanel billingPeriodId={billingPeriodId} resumeExisting={initialMethod==="CREDIT_CARD"} onSwitchStart={()=>beginSwitch("CREDIT_CARD")} onSwitchReady={()=>finishSwitch("CREDIT_CARD")}/>
      {activeMethod==="CREDIT_CARD"&&switchingTo?<SwitchOverlay label={switchingLabel??"Preparando pagamento..."}/>:null}
    </div>:null}
   </div>
  </div>
 }

 const onlinePixEnabled=pixEnabled||pixAutomaticEnabled;
 return <div className="mt-3 space-y-3">
   <div className="grid gap-2 sm:grid-cols-2">
     {allowCash?<button type="button" disabled={loading} onClick={()=>void cash()} className="flex h-16 items-center justify-center gap-2 rounded-xl border border-emerald-200 font-bold text-emerald-700 disabled:opacity-50">{loading?<LoaderCircle className="size-5 animate-spin"/>:<Banknote className="size-5"/>}Dinheiro</button>:null}
     {pixEnabled&&!useAutomaticPix?<PixPaymentPanel billingPeriodId={billingPeriodId} onSwitchStart={()=>beginSwitch("PIX")} onSwitchReady={()=>finishSwitch("PIX")}/>:null}
     {pixAutomaticEnabled&&useAutomaticPix?<div className="sm:col-span-2"><MonthlyPixAutomaticPanel billingPeriodId={billingPeriodId}/></div>:null}
     {creditEnabled?<CreditCheckoutPanel billingPeriodId={billingPeriodId} onSwitchStart={()=>beginSwitch("CREDIT_CARD")} onSwitchReady={()=>finishSwitch("CREDIT_CARD")}/>:null}
   </div>
   {pixAutomaticEnabled?<label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={useAutomaticPix} onChange={(event)=>setUseAutomaticPix(event.target.checked)} className="mt-0.5 size-4"/><span><b>Quero ativar o Pix Automático para as próximas mensalidades.</b><br/><span className="text-slate-500">Desmarcado, o Pix funciona normalmente e paga apenas esta competência. Marcado, você inicia a autorização recorrente do Pix Automático.</span></span></label>:null}
   {!allowCash&&!onlinePixEnabled&&!creditEnabled?<p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Pagamento online indisponível nesta unidade.</p>:null}
   {error?<p role="alert" className="text-sm font-semibold text-red-600">{error}</p>:null}
 </div>
}

function SwitchOverlay({label}:{label:string}){return <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/75 backdrop-blur-[1px]"><div className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm"><LoaderCircle className="size-4 animate-spin text-blue-600"/>{label}</div></div>}
