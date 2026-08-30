"use client";

import { CalendarClock, LoaderCircle, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MonthlyAutomaticChargeGuard({subscriptionId,nextBillingDate}:{subscriptionId:string;nextBillingDate:string|null}){
  const router=useRouter();
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);

  const useManualPayment=async()=>{
    if(loading)return;
    setLoading(true);setError(null);
    try{
      const response=await fetch("/api/payments/monthly/renewal",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subscriptionId,action:"DISABLE"})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(typeof body.error==="string"?body.error:"Não foi possível liberar o pagamento manual.");
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível liberar o pagamento manual.")}
    finally{setLoading(false)}
  };

  return <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-blue-700"/>
      <div>
        <h3 className="font-bold text-blue-950">Cobrança automática programada</h3>
        <p className="mt-1 text-sm text-blue-900">Sua renovação automática no cartão está ativa{nextBillingDate?<> e a próxima cobrança está programada para <b>{date(nextBillingDate)}</b></>:null}. Não é necessário gerar outro pagamento agora.</p>
        <p className="mt-1 text-sm text-slate-700">Se preferir PIX ou outro pagamento manual nesta competência, desative primeiro a renovação automática para evitar duas cobranças concorrentes.</p>
      </div>
    </div>
    <button type="button" disabled={loading} onClick={()=>void useManualPayment()} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white font-bold text-blue-700 disabled:opacity-50">
      {loading?<LoaderCircle className="size-4 animate-spin"/>:<WalletCards className="size-4"/>}
      {loading?"Liberando pagamento manual...":"Usar pagamento manual"}
    </button>
    {error?<p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p>:null}
  </section>;
}

function date(value:string){return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")}
