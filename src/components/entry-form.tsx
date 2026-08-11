"use client";
import { useActionState,useRef,useState } from "react";
import { CarFront,CheckCircle2,LoaderCircle,LogIn,ShieldCheck } from "lucide-react";
import { registerEntry,requestMonthlyEntryAuthorization,type OperatorActionState } from "@/app/frentista/actions";
import Link from "next/link";
const initial:OperatorActionState={};

export function EntryForm({carEnabled,motorcycleEnabled}:{carEnabled:boolean;motorcycleEnabled:boolean}){
  const[plate,setPlate]=useState("");const input=useRef<HTMLInputElement>(null);
  const[state,action,pending]=useActionState(async(previous:OperatorActionState,formData:FormData)=>{const result=await registerEntry(previous,formData);if(result.success){setPlate("");setTimeout(()=>input.current?.focus(),0);}return result;},initial);
  const[requestState,requestAction,requestPending]=useActionState(requestMonthlyEntryAuthorization,initial);
  const normalized=plate.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);const valid=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized);
  return <div className="space-y-3">
    <form action={action} className="grid gap-3 lg:grid-cols-[1fr_180px_280px]">
      <input type="hidden" name="entryDecision" value="REQUIRE_DECISION"/>
      <label className="flex h-16 items-center rounded-xl border-2 border-blue-500 bg-white px-5 focus-within:ring-4 focus-within:ring-blue-100"><CarFront className="size-5 text-slate-400"/><span className="sr-only">Placa do veículo</span><input ref={input} autoFocus name="plate" value={normalized} onChange={event=>setPlate(event.target.value)} aria-invalid={normalized.length>0&&!valid} className="h-full min-w-0 flex-1 bg-transparent px-4 text-xl font-bold uppercase outline-none" placeholder="Digite a placa" autoComplete="off"/></label>
      <label className="sr-only" htmlFor="vehicleType">Tipo do veículo</label><select id="vehicleType" name="vehicleType" className="h-16 rounded-xl border bg-white px-4 font-semibold"><option value="CAR" disabled={!carEnabled}>Carro{!carEnabled?" — sem tarifa":""}</option><option value="MOTORCYCLE" disabled={!motorcycleEnabled}>Moto{!motorcycleEnabled?" — sem tarifa":""}</option></select>
      <button disabled={pending||!valid||(!carEnabled&&!motorcycleEnabled)} className="flex h-16 items-center justify-center gap-3 rounded-xl bg-blue-600 font-bold text-white shadow-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{pending?<LoaderCircle className="size-5 animate-spin"/>:<LogIn className="size-5"/>}{pending?"Verificando...":"Registrar entrada"}</button>
    </form>
    {(!carEnabled||!motorcycleEnabled)&&<p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Tarifa ausente para: {[!carEnabled&&"carro",!motorcycleEnabled&&"moto"].filter(Boolean).join(" e ")}. Entradas desse tipo estão bloqueadas.</p>}
    {(state.error||state.success)&&<div role="status" className={`flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${state.error?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}><CheckCircle2 className="size-5"/><span>{state.error??state.success}{state.relatedMessage&&!state.error?` ${state.relatedMessage}`:""}</span>{state.relatedHref?<Link className="ml-auto underline" href={state.relatedHref}>{state.error?state.relatedMessage:"Ver histórico"}</Link>:null}</div>}
    {state.monthlyDecisionRequired&&state.plate?<div className="grid gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 md:grid-cols-2"><div className="md:col-span-2"><p className="font-bold text-amber-900">Mensalidade sem cobertura neste momento</p><p className="text-sm text-amber-800">Motivo operacional: {state.coverageReason}. A assinatura não será alterada.</p></div><form action={action}><input type="hidden" name="plate" value={state.plate}/><input type="hidden" name="vehicleType" value={state.vehicleType}/><input type="hidden" name="entryDecision" value="CASUAL"/><button disabled={pending} className="h-12 w-full rounded-xl bg-slate-900 font-bold text-white">Cobrar como avulso</button></form><form action={requestAction} className="space-y-2"><input type="hidden" name="plate" value={state.plate}/><label className="sr-only" htmlFor="exceptionReason">Justificativa</label><input id="exceptionReason" name="reason" required minLength={5} maxLength={500} placeholder="Justificativa para autorização" className="h-12 w-full rounded-xl border bg-white px-3"/><button disabled={requestPending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-600 bg-white font-bold text-amber-800"><ShieldCheck className="size-5"/>{requestPending?"Solicitando...":"Solicitar exceção"}</button></form></div>:null}
    {(requestState.error||requestState.success)&&<p role="status" className={`rounded-xl px-4 py-3 text-sm font-semibold ${requestState.error?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}>{requestState.error??requestState.success}</p>}
  </div>;
}
