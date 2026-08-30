"use client";

import Link from "next/link";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
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
      if(attempts>=20){setState("PENDING");return}
      window.setTimeout(()=>void check(),750);
    };
    void check();
    return()=>{cancelled=true};
  },[billingPeriodId]);

  if(state==="PAID")return <section className="w-full max-w-xl rounded-3xl border border-emerald-200 bg-white p-8 shadow-sm">
    <div className="flex items-center gap-3 text-emerald-700"><CheckCircle2 className="size-8"/><h1 className="text-3xl font-bold">Pagamento confirmado</h1></div>
    <p className="mt-4 text-lg font-semibold text-slate-800">Sua mensalidade foi atualizada com sucesso.</p>
    <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
      <p className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5"/>Confirmação segura recebida do Asaas</p>
      <p className="mt-2">Você não precisa pagar novamente. A cobertura e os dados da renovação já podem ser consultados na sua mensalidade.</p>
    </div>
    <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-slate-700">
      <p className="font-bold text-blue-900">Renovação automática no cartão ativada.</p>
      <p className="mt-2">As próximas mensalidades serão cobradas automaticamente. Você poderá desativar a renovação ou cancelar a assinatura quando quiser; o período já pago continua válido até o fim da cobertura.</p>
    </div>
    <Link href="/cliente/mensalidade" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Ver minha mensalidade</Link>
  </section>;

  return <section className="w-full max-w-xl rounded-3xl border bg-white p-8 text-center shadow-sm">
    <LoaderCircle className="mx-auto size-8 animate-spin text-blue-600"/>
    <h1 className="mt-4 text-3xl font-bold">{state==="CHECKING"?"Pagamento concluído no Asaas":"Pagamento concluído — sincronizando"}</h1>
    <p className="mt-3 text-slate-600">{state==="CHECKING"?"Estamos registrando a confirmação na sua mensalidade. Isso normalmente leva poucos segundos.":"Seu pagamento foi concluído no Asaas e a sincronização continua automaticamente. Você não precisa pagar novamente."}</p>
    {state==="PENDING"?<div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900"><b>Seu pagamento não foi perdido.</b> Você pode voltar para a mensalidade; a confirmação continuará sendo processada com segurança.</div>:null}
    {state==="PENDING"?<Link href="/cliente/mensalidade" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Voltar para minha mensalidade</Link>:null}
  </section>;
}
