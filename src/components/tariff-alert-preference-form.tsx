"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { saveTariffAlertPreference, type PreferenceActionState } from "@/app/cliente/notificacoes/actions";

const initial:PreferenceActionState={};

export function TariffAlertPreferenceForm({initialMinutes}:{initialMinutes:number}){
  const[state,action,pending]=useActionState(saveTariffAlertPreference,initial);
  const[selected,setSelected]=useState<number>(initialMinutes);
  return <div className="mt-4">
    <form action={action} className="flex flex-wrap gap-2">
      {[5,10,15].map((minutes)=>(
        <label key={minutes} className={`cursor-pointer rounded-xl border px-4 py-3 text-sm font-bold transition ${selected===minutes?"border-blue-500 bg-blue-50 text-blue-700":"bg-white text-slate-700 hover:bg-slate-50"}`}>
          <input type="radio" name="tariffAlertMinutes" value={minutes} checked={selected===minutes} onChange={()=>setSelected(minutes)} className="sr-only"/>
          {minutes} minutos antes
        </label>
      ))}
      <button disabled={pending} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">
        {pending?<span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin"/>Salvando...</span>:"Salvar preferência"}
      </button>
    </form>
    {state.success?<div role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="size-4"/>{state.success}</div>:null}
    {state.error?<p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p>:null}
  </div>;
}
