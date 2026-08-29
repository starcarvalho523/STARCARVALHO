"use client";

import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type Checkout={state:string;amount:number;hostedPaymentUrl:string|null;expiresAt:string|null};

export function PaymentReturnStatus({billingPeriodId}:{billingPeriodId:string}){
  const[state,setState]=useState<"CHECKING"|"PAID"|"PENDING">("CHECKING");

  useEffect(()=>{
    let cancelled=false;
    let attempts=0;
    const check=async()=>{
      attempts+=1;
      try{
        const response=await fetch(`/api/payments/monthly/credit-checkout?billingPeriodId=${encodeURIComponent(billingPeriodId)}`,{cache:"no-store"});
        const body=await response.json().catch(()=>({}));
        const checkout=body.checkout as Checkout|null|undefined;
        if(cancelled)return;
        if(response.ok&&checkout?.state==="PAID"){setState("PAID");return}
      }catch{}
      if(cancelled)return;
      if(attempts>=8){setState("PENDING");return}
      window.setTimeout(()=>void check(),1500);
    };
    void check();
    return()=>{cancelled=true};
  },[billingPeriodId]);

  if(state==="PAID")return <section className="w-full max-w-xl rounded-3xl border bg-white p-8 shadow-sm">
    <div className="flex items-center gap-3 text-emerald-700"><CheckCircle2 className="size-7"/><h1 className="text-3xl font-bold">Pagamento confirmado</h1></div>
    <p className="mt-4 text-slate-700">Sua mensalidade está ativa.</p>
    <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-slate-700">
      <p className="font-bold text-blue-900">Renovação automática no cartão ativada.</p>
      <p className="mt-2">As próximas mensalidades serão cobradas automaticamente. Você poderá desativar a renovação ou cancelar a assinatura quando quiser; o período já pago continua válido até o fim da cobertura.</p>
    </div>
    <Link href="/cliente/mensalidade" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Ver minha mensalidade</Link>
  </section>;

  return <section className="w-full max-w-xl rounded-3xl border bg-white p-8 text-center shadow-sm">
    <LoaderCircle className="mx-auto size-8 animate-spin text-blue-600"/>
    <h1 className="mt-4 text-3xl font-bold">{state==="CHECKING"?"Confirmando seu pagamento":"Pagamento em confirmação"}</h1>
    <p className="mt-3 text-slate-600">{state==="CHECKING"?"O Star Carvalhos está verificando a confirmação segura recebida do Asaas.":"A confirmação continua automaticamente. Você não precisa pagar novamente nem gerar outra cobrança."}</p>
    {state==="PENDING"?<Link href="/cliente/mensalidade" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Voltar para minha mensalidade</Link>:null}
  </section>;
}
