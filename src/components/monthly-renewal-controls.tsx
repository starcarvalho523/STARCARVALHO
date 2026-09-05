"use client";

import { CalendarClock, CheckCircle2, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MonthlyRenewalCardDialog } from "@/components/monthly-renewal-card-dialog";

type CardSetup={amount:number;nextBillingDate:string};

export function MonthlyRenewalControls({
  subscriptionId,
  autoRenew,
  nextBillingDate,
  coverageUntil,
  cancelAtPeriodEnd,
}:{
  subscriptionId:string;
  autoRenew:boolean;
  nextBillingDate:string|null;
  coverageUntil:string|null;
  cancelAtPeriodEnd:boolean;
}){
  const router=useRouter();
  const[loading,setLoading]=useState<"ENABLE"|"DISABLE"|"CANCEL_AT_PERIOD_END"|null>(null);
  const[error,setError]=useState<string|null>(null);
  const[errorAttempt,setErrorAttempt]=useState<string|null>(null);
  const[cardSetup,setCardSetup]=useState<CardSetup|null>(null);

  const act=async(action:"ENABLE"|"DISABLE"|"CANCEL_AT_PERIOD_END")=>{
    if(loading)return;
    if(action==="CANCEL_AT_PERIOD_END"&&!window.confirm("Cancelar a renovação da assinatura ao fim do período já pago? Sua cobertura atual continuará válida até a data informada."))return;
    const attemptId=crypto.randomUUID();
    setLoading(action);setError(null);setErrorAttempt(null);
    try{
      const response=await fetch("/api/payments/monthly/renewal",{method:"POST",headers:{"content-type":"application/json","x-renewal-attempt-id":attemptId},body:JSON.stringify({subscriptionId,action})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        setErrorAttempt(typeof body.attemptId==="string"?body.attemptId:attemptId);
        throw new Error(typeof body.error==="string"?body.error:"Não foi possível atualizar a renovação.");
      }
      if(body?.setup?.mode==="NATIVE_CARD"&&typeof body.setup.amount==="number"&&typeof body.setup.nextBillingDate==="string"){
        setCardSetup({amount:body.setup.amount,nextBillingDate:body.setup.nextBillingDate});
        return;
      }
      router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível atualizar a renovação.")}
    finally{setLoading(null)}
  };

  const cardActivated=()=>{
    setCardSetup(null);
    setError(null);
    setErrorAttempt(null);
    router.refresh();
  };

  if(cancelAtPeriodEnd){
    return <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3"><XCircle className="mt-0.5 size-5 text-amber-700"/><div><h3 className="font-bold text-amber-900">Cancelamento agendado</h3><p className="mt-1 text-sm text-amber-800">Não haverá nova renovação automática. Sua cobertura já paga continua válida até <b>{date(coverageUntil)}</b>.</p></div></div>
      {error?<ErrorMessage text={error} attemptId={errorAttempt}/>:null}
    </section>;
  }

  return <>
    <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5" aria-busy={Boolean(loading)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600"/><h3 className="font-bold">Pagamento confirmado e mensalidade ativa</h3></div>
          <p className="mt-2 text-sm text-slate-700">Sua cobertura atual continua válida até <b>{date(coverageUntil)}</b>.</p>
          {autoRenew?<>
            <p className="mt-2 text-sm font-semibold text-blue-900">Renovação automática no cartão: ativada.</p>
            <p className="mt-1 text-sm text-slate-700">As próximas mensalidades serão cobradas automaticamente no cartão. Você pode desativar a renovação quando quiser; isso não interrompe o período que já foi pago.</p>
          </>:<>
            <p className="mt-2 text-sm font-semibold text-slate-900">Renovação automática no cartão: desativada.</p>
            <p className="mt-1 text-sm text-slate-700">Ao ativar, você cadastra o cartão aqui no Star Carvalhos. <b>Nenhuma nova mensalidade será cobrada hoje.</b> A primeira cobrança automática será somente na próxima renovação.</p>
          </>}
        </div>
        <div className="rounded-xl border bg-white px-4 py-3 text-sm"><div className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4"/>Próxima cobrança</div><p className="mt-1 text-slate-600">{autoRenew?date(nextBillingDate):"Desativada"}</p></div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {autoRenew?<button type="button" disabled={Boolean(loading)} onClick={()=>void act("DISABLE")} className="flex h-11 items-center justify-center gap-2 rounded-xl border bg-white font-bold text-slate-700 disabled:cursor-wait disabled:opacity-50">{loading==="DISABLE"?<LoaderCircle className="size-4 animate-spin"/>:<RefreshCw className="size-4"/>}{loading==="DISABLE"?"Sincronizando com o Asaas...":"Desativar renovação automática"}</button>:<button type="button" disabled={Boolean(loading)} onClick={()=>void act("ENABLE")} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white disabled:cursor-wait disabled:opacity-50">{loading==="ENABLE"?<LoaderCircle className="size-4 animate-spin"/>:<RefreshCw className="size-4"/>}{loading==="ENABLE"?"Verificando recorrência existente...":"Cadastrar cartão e ativar renovação"}</button>}
        <button type="button" disabled={Boolean(loading)} onClick={()=>void act("CANCEL_AT_PERIOD_END")} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white font-bold text-red-700 disabled:cursor-wait disabled:opacity-50">{loading==="CANCEL_AT_PERIOD_END"?<LoaderCircle className="size-4 animate-spin"/>:<XCircle className="size-4"/>}{loading==="CANCEL_AT_PERIOD_END"?"Confirmando cancelamento...":"Cancelar assinatura ao fim do período"}</button>
      </div>
      {loading?<p className="mt-3 text-xs font-medium text-slate-600">Aguarde a sincronização terminar. Não clique novamente nem atualize a página durante esta etapa.</p>:null}
      {error?<ErrorMessage text={error} attemptId={errorAttempt}/>:null}
    </section>
    {cardSetup?<MonthlyRenewalCardDialog subscriptionId={subscriptionId} amount={cardSetup.amount} nextBillingDate={cardSetup.nextBillingDate} onClose={()=>setCardSetup(null)} onSuccess={cardActivated}/>:null}
  </>;
}

function ErrorMessage({text,attemptId}:{text:string;attemptId:string|null}){return <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><p className="font-semibold">{text}</p><p className="mt-1 text-xs">Não repita a operação várias vezes. Atualize a página primeiro para o sistema reconciliar uma tentativa que possa ter sido criada.</p>{attemptId?<p className="mt-1 text-[11px] text-red-500">Referência da tentativa: {attemptId.slice(0,8)}</p>:null}</div>}
function date(value:string|null){if(!value)return"data a confirmar";return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")}
