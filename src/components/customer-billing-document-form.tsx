"use client";

import { useActionState } from "react";
import { updateBillingDocument,type CustomerActionState } from "@/app/cliente/actions";

const initial:CustomerActionState={};

export function CustomerBillingDocumentForm({current}:{current:string|null}){
  const[state,action,pending]=useActionState(updateBillingDocument,initial);
  return <form action={action} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
    <div>
      <h2 className="text-lg font-bold">Dados para cobrança</h2>
      <p className="mt-1 text-sm text-slate-500">O CPF/CNPJ é usado somente para identificar você no provedor de pagamento e conciliar suas cobranças.</p>
    </div>
    <label className="block text-sm font-semibold">CPF ou CNPJ
      <input name="billingDocument" inputMode="numeric" autoComplete="off" required defaultValue={current??""} placeholder="Somente números" className="input"/>
    </label>
    {state.error||state.success?<p role="status" className={`text-sm font-semibold ${state.error?"text-red-600":"text-emerald-700"}`}>{state.error??state.success}</p>:null}
    <button disabled={pending} className="h-11 rounded-xl bg-blue-600 px-5 font-bold text-white disabled:opacity-50">{pending?"Salvando...":"Salvar CPF/CNPJ"}</button>
  </form>;
}
