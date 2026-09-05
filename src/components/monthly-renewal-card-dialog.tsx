"use client";

import { CalendarClock, CreditCard, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { FormEvent, useState } from "react";

type Props={
  subscriptionId:string;
  amount:number;
  nextBillingDate:string;
  onClose:()=>void;
  onSuccess:()=>void;
};

type Fields={
  number:string;
  holderName:string;
  expiryMonth:string;
  expiryYear:string;
  ccv:string;
  cpfCnpj:string;
  email:string;
  mobilePhone:string;
  postalCode:string;
  addressNumber:string;
  addressComplement:string;
};

const empty:Fields={number:"",holderName:"",expiryMonth:"",expiryYear:"",ccv:"",cpfCnpj:"",email:"",mobilePhone:"",postalCode:"",addressNumber:"",addressComplement:""};

export function MonthlyRenewalCardDialog({subscriptionId,amount,nextBillingDate,onClose,onSuccess}:Props){
  const[fields,setFields]=useState<Fields>(empty);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const set=(name:keyof Fields,value:string)=>setFields((current)=>({...current,[name]:value}));

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(loading)return;
    setLoading(true);setError(null);
    try{
      const response=await fetch("/api/payments/monthly/renewal/card",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          subscriptionId,
          creditCard:{holderName:fields.holderName,number:fields.number,expiryMonth:fields.expiryMonth,expiryYear:fields.expiryYear,ccv:fields.ccv},
          creditCardHolderInfo:{name:fields.holderName,email:fields.email,cpfCnpj:fields.cpfCnpj,postalCode:fields.postalCode,addressNumber:fields.addressNumber,addressComplement:fields.addressComplement,mobilePhone:fields.mobilePhone},
        }),
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        const serverMessage=typeof body.error==="string"?body.error:"Não foi possível ativar a renovação.";
        if(response.status===503||response.status===504)throw new Error("A autorização pode já ter sido recebida pelo Asaas. Feche este formulário e atualize a página antes de qualquer nova tentativa. Não envie o cartão novamente agora.");
        if(response.status===409)throw new Error(`${serverMessage} Atualize a página antes de tentar novamente.`);
        if(response.status===400&&serverMessage.includes("O Asaas não conseguiu validar o cartão"))throw new Error("O Asaas rejeitou a solicitação. Confira os dados informados; se este cartão já funcionou antes, não repita várias tentativas seguidas.");
        throw new Error(serverMessage);
      }
      setFields(empty);
      onSuccess();
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível ativar a renovação.")}
    finally{setLoading(false)}
  };

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="renewal-card-title" aria-busy={loading}>
    <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4 sm:px-6">
        <div><h2 id="renewal-card-title" className="text-lg font-black text-slate-950">Ativar renovação automática</h2><p className="mt-0.5 text-sm text-slate-500">Cadastre o cartão para as próximas mensalidades.</p></div>
        <button type="button" onClick={onClose} disabled={loading} aria-label="Fechar" className="grid size-10 place-items-center rounded-full border text-slate-600 hover:bg-slate-50 disabled:opacity-50"><X className="size-5"/></button>
      </div>

      <form onSubmit={submit} className="p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Hoje</p><p className="mt-1 text-2xl font-black text-emerald-800">R$ 0,00</p><p className="mt-1 text-xs text-emerald-700">Nenhuma mensalidade será cobrada agora.</p></div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Primeira cobrança</p><p className="mt-1 text-xl font-black text-blue-950">{date(nextBillingDate)}</p><p className="mt-1 text-xs text-blue-700">Somente nesta data.</p></div>
          <div className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Valor mensal</p><p className="mt-1 text-2xl font-black text-slate-950">{money(amount)}</p><p className="mt-1 text-xs text-slate-600">Recorrência mensal no Asaas.</p></div>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600"/><p><b>Você não está pagando novamente.</b> O cartão será validado para a renovação automática. A primeira cobrança da próxima mensalidade ocorrerá apenas em <b>{date(nextBillingDate)}</b>.</p></div>

        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2"><CreditCard className="size-5 text-blue-600"/><h3 className="font-black text-slate-950">Dados do cartão</h3></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número do cartão" className="sm:col-span-2"><input required autoComplete="cc-number" inputMode="numeric" maxLength={23} value={fields.number} onChange={(e)=>set("number",e.target.value)} placeholder="0000 0000 0000 0000" className={input}/></Field>
            <Field label="Nome impresso no cartão" className="sm:col-span-2"><input required autoComplete="cc-name" maxLength={80} value={fields.holderName} onChange={(e)=>set("holderName",e.target.value)} placeholder="NOME DO TITULAR" className={input}/></Field>
            <Field label="Validade"><div className="grid grid-cols-2 gap-2"><input required autoComplete="cc-exp-month" inputMode="numeric" maxLength={2} value={fields.expiryMonth} onChange={(e)=>set("expiryMonth",e.target.value)} placeholder="MM" className={input}/><input required autoComplete="cc-exp-year" inputMode="numeric" maxLength={4} value={fields.expiryYear} onChange={(e)=>set("expiryYear",e.target.value)} placeholder="AAAA" className={input}/></div></Field>
            <Field label="CVV"><input required autoComplete="cc-csc" inputMode="numeric" maxLength={4} value={fields.ccv} onChange={(e)=>set("ccv",e.target.value)} placeholder="000" className={input}/></Field>
          </div>
        </section>

        <section className="mt-6 border-t pt-5">
          <h3 className="font-black text-slate-950">Dados do titular</h3>
          <p className="mt-1 text-sm text-slate-500">Esses dados são exigidos pelo Asaas para validar o cartão e não alteram o valor da mensalidade.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="CPF ou CNPJ"><input required inputMode="numeric" maxLength={18} value={fields.cpfCnpj} onChange={(e)=>set("cpfCnpj",e.target.value)} placeholder="CPF ou CNPJ" className={input}/></Field>
            <Field label="E-mail"><input required type="email" autoComplete="email" maxLength={160} value={fields.email} onChange={(e)=>set("email",e.target.value)} placeholder="seu@email.com" className={input}/></Field>
            <Field label="Celular"><input required inputMode="tel" autoComplete="tel" maxLength={18} value={fields.mobilePhone} onChange={(e)=>set("mobilePhone",e.target.value)} placeholder="(00) 00000-0000" className={input}/></Field>
            <Field label="CEP"><input required inputMode="numeric" autoComplete="postal-code" maxLength={10} value={fields.postalCode} onChange={(e)=>set("postalCode",e.target.value)} placeholder="00000-000" className={input}/></Field>
            <Field label="Número do endereço"><input required autoComplete="address-line2" maxLength={20} value={fields.addressNumber} onChange={(e)=>set("addressNumber",e.target.value)} placeholder="123" className={input}/></Field>
            <Field label="Complemento (opcional)"><input maxLength={80} value={fields.addressComplement} onChange={(e)=>set("addressComplement",e.target.value)} placeholder="Apto, bloco..." className={input}/></Field>
          </div>
        </section>

        {loading?<div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">Validando e sincronizando com o Asaas. Não feche, atualize ou clique novamente durante esta etapa.</div>:null}
        {error?<div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><p className="font-semibold">{error}</p><p className="mt-1 text-xs">Antes de reenviar qualquer dado, feche o modal e atualize a página para verificar se a autorização já foi criada.</p></div>:null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={loading} className="h-12 rounded-xl border px-5 font-bold text-slate-700 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={loading} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 font-black text-white disabled:cursor-wait disabled:opacity-50">{loading?<LoaderCircle className="size-5 animate-spin"/>:<CalendarClock className="size-5"/>}{loading?"Validando e sincronizando...":"Autorizar renovação automática"}</button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Os dados completos do cartão não são armazenados pelo Star Carvalhos.</p>
      </form>
    </div>
  </div>;
}

function Field({label,className="",children}:{label:string;className?:string;children:React.ReactNode}){return <label className={`block ${className}`}><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}</label>}
const input="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
function money(value:number){return value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function date(value:string){return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")}
