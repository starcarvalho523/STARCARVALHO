"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Checkout={state:string;amount:number;hostedPaymentUrl:string|null;expiresAt:string|null};

type BillingPeriodRealtimeRow={id?:unknown;status?:unknown};

const FAST_POLL_MS=300;
const MEDIUM_POLL_MS=750;
const SLOW_POLL_MS=2500;
const AUTO_REDIRECT_MS=900;

export function PaymentReturnStatus({billingPeriodId}:{billingPeriodId:string}){
  const[state,setState]=useState<"CHECKING"|"PAID"|"PENDING">("CHECKING");
  const router=useRouter();

  useEffect(()=>{
    let cancelled=false;
    let attempts=0;
    let settled=false;
    let timer:number|undefined;
    let redirectTimer:number|undefined;
    const supabase=createClient();

    const markPaid=()=>{
      if(cancelled||settled)return;
      settled=true;
      setState("PAID");
      redirectTimer=window.setTimeout(()=>{
        if(!cancelled)router.replace("/cliente/mensalidade?payment=confirmed");
      },AUTO_REDIRECT_MS);
    };

    const nextDelay=()=>{
      if(attempts<12)return FAST_POLL_MS;
      if(attempts<24)return MEDIUM_POLL_MS;
      return SLOW_POLL_MS;
    };

    const check=async()=>{
      attempts+=1;
      try{
        const response=await fetch(`/api/payments/monthly/credit-checkout?billingPeriodId=${encodeURIComponent(billingPeriodId)}`,{cache:"no-store"});
        const body=await response.json().catch(()=>({}));
        const checkout=body.checkout as Checkout|null|undefined;
        if(cancelled||settled)return;
        if(response.ok&&checkout?.state==="PAID"){
          markPaid();
          return;
        }
      }catch{}
      if(cancelled||settled)return;
      if(attempts>=24)setState("PENDING");
      timer=window.setTimeout(()=>void check(),nextDelay());
    };

    const channel=supabase
      .channel(`monthly-payment-return:${billingPeriodId}`)
      .on(
        "postgres_changes",
        {
          event:"UPDATE",
          schema:"public",
          table:"monthly_billing_periods",
          filter:`id=eq.${billingPeriodId}`,
        },
        (payload)=>{
          const row=payload.new as BillingPeriodRealtimeRow;
          if(row.id===billingPeriodId&&row.status==="PAID")markPaid();
        },
      )
      .subscribe();

    void check();

    return()=>{
      cancelled=true;
      if(timer!==undefined)window.clearTimeout(timer);
      if(redirectTimer!==undefined)window.clearTimeout(redirectTimer);
      void supabase.removeChannel(channel);
    };
  },[billingPeriodId,router]);

  if(state==="PAID")return <section className="w-full max-w-xl rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
    <CheckCircle2 className="mx-auto size-12 text-emerald-600"/>
    <h1 className="mt-4 text-3xl font-bold text-emerald-800">Pagamento confirmado</h1>
    <p className="mt-3 text-lg font-semibold text-slate-800">Mensalidade ativada com sucesso.</p>
    <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
      <p className="flex items-center justify-center gap-2 font-bold"><ShieldCheck className="size-5"/>Confirmação segura recebida do Asaas</p>
      <p className="mt-2">Sua cobertura e renovação já estão atualizadas.</p>
    </div>
    <p className="mt-4 text-sm font-medium text-slate-500">Abrindo sua mensalidade...</p>
    <Link href="/cliente/mensalidade?payment=confirmed" className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Ir agora</Link>
  </section>;

  return <section className="w-full max-w-xl rounded-3xl border bg-white p-8 text-center shadow-sm">
    <LoaderCircle className="mx-auto size-8 animate-spin text-blue-600"/>
    <h1 className="mt-4 text-3xl font-bold">{state==="CHECKING"?"Confirmando seu pagamento":"Pagamento aprovado — finalizando"}</h1>
    <p className="mt-3 text-slate-600">{state==="CHECKING"?"A confirmação está sendo consultada em tempo real. Normalmente a tela atualiza quase imediatamente.":"O Asaas já concluiu o pagamento e continuamos sincronizando automaticamente. Você não precisa pagar novamente."}</p>
    {state==="PENDING"?<div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900"><b>Seu pagamento está preservado.</b> A confirmação continua sendo consultada automaticamente em tempo real e por verificação segura de fallback.</div>:null}
    {state==="PENDING"?<Link href="/cliente/mensalidade" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Voltar para minha mensalidade</Link>:null}
  </section>;
}
