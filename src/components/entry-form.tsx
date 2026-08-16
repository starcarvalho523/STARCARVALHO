"use client";
import { useActionState,useRef,useState } from "react";
import { CarFront,CheckCircle2,Clock3,Info,LoaderCircle,LogIn,ShieldCheck } from "lucide-react";
import { registerEntry,requestMonthlyEntryAuthorization,type OperatorActionState } from "@/app/frentista/actions";
import Link from "next/link";
const initial:OperatorActionState={};

type VehicleType="CAR"|"MOTORCYCLE";

export function EntryForm({carEnabled,motorcycleEnabled}:{carEnabled:boolean;motorcycleEnabled:boolean}){
  const[plate,setPlate]=useState("");
  const[vehicleType,setVehicleType]=useState<VehicleType>(carEnabled?"CAR":"MOTORCYCLE");
  const input=useRef<HTMLInputElement>(null);
  const[state,action,pending]=useActionState(async(previous:OperatorActionState,formData:FormData)=>{const result=await registerEntry(previous,formData);if(result.success){setPlate("");setTimeout(()=>input.current?.focus(),0);}return result;},initial);
  const[requestState,requestAction,requestPending]=useActionState(requestMonthlyEntryAuthorization,initial);
  const normalized=plate.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);
  const valid=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized);
  const selectedTypeEnabled=vehicleType==="CAR"?carEnabled:motorcycleEnabled;
  const noTariffAvailable=!carEnabled&&!motorcycleEnabled;
  const selectedTypeLabel=vehicleType==="CAR"?"Carro":"Moto";

  return <div className="space-y-4">
    <form action={action} className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_260px_280px]">
      <input type="hidden" name="entryDecision" value="REQUIRE_DECISION"/>

      <div className="space-y-2">
        <label htmlFor="entryPlate" className="text-sm font-semibold text-slate-700">Placa do veículo</label>
        <label className="flex h-16 items-center rounded-xl border-2 border-blue-500 bg-white px-4 shadow-sm transition focus-within:ring-4 focus-within:ring-blue-100">
          <CarFront className="size-5 shrink-0 text-blue-600"/>
          <span className="sr-only">Placa do veículo</span>
          <input id="entryPlate" ref={input} autoFocus name="plate" value={normalized} onChange={event=>setPlate(event.target.value)} aria-invalid={normalized.length>0&&!valid} className="h-full min-w-0 flex-1 bg-transparent px-3 text-xl font-bold uppercase outline-none placeholder:text-base placeholder:font-medium placeholder:normal-case placeholder:text-slate-400" placeholder="Digite a placa do veículo" autoComplete="off"/>
        </label>
        <p className="text-xs text-slate-500">Digite apenas letras e números, sem espaços ou traços.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700" htmlFor="vehicleType">Tipo de veículo</label>
        <div className="relative">
          <CarFront className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"/>
          <select id="vehicleType" name="vehicleType" value={vehicleType} onChange={event=>setVehicleType(event.target.value as VehicleType)} className="h-16 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50">
            <option value="CAR" disabled={!carEnabled}>Carro{!carEnabled?" — sem tarifa":""}</option>
            <option value="MOTORCYCLE" disabled={!motorcycleEnabled}>Moto{!motorcycleEnabled?" — sem tarifa":""}</option>
          </select>
        </div>
        <p className="text-xs text-slate-500">Somente tipos com tarifa ativa podem entrar.</p>
      </div>

      <div className="space-y-2">
        <button disabled={pending||!valid||!selectedTypeEnabled} className="flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-5 font-bold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {pending?<LoaderCircle className="size-5 animate-spin"/>:<LogIn className="size-5"/>}
          {pending?"Verificando...":"Registrar entrada"}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="size-3.5 text-slate-500"/>Entrada registrada em tempo real</p>
      </div>
    </form>

    {!noTariffAvailable?<div className="grid gap-3 md:grid-cols-2">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-5"/></span>
        <div><p className="text-sm font-bold text-emerald-900">Tarifa ativa para {selectedTypeLabel}</p><p className="mt-0.5 text-xs text-emerald-800">Entrada liberada. A tarifa será aplicada conforme as regras vigentes.</p></div>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700"><Clock3 className="size-5"/></span>
        <div><p className="text-sm font-bold text-slate-900">Registro automático</p><p className="mt-0.5 text-xs text-slate-600">Horário oficial, tarifa e operador serão registrados ao confirmar.</p></div>
      </div>
    </div>:<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><Info className="mt-0.5 size-5 shrink-0"/><span>Nenhuma tarifa ativa disponível para entrada. Configure ao menos uma tarifa de carro ou moto antes de registrar veículos.</span></div>}

    {(state.error||state.success)&&<div role="status" className={`flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${state.error?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}><CheckCircle2 className="size-5"/><span>{state.error??state.success}{state.relatedMessage&&!state.error?` ${state.relatedMessage}`:""}</span>{state.relatedHref?<Link className="ml-auto underline" href={state.relatedHref}>{state.error?state.relatedMessage:"Ver histórico"}</Link>:null}</div>}

    {state.monthlyDecisionRequired&&state.plate?<div className="grid gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 md:grid-cols-2"><div className="md:col-span-2"><p className="font-bold text-amber-900">Mensalidade sem cobertura neste momento</p><p className="text-sm text-amber-800">Motivo operacional: {state.coverageReason}. A assinatura não será alterada.</p></div><form action={action}><input type="hidden" name="plate" value={state.plate}/><input type="hidden" name="vehicleType" value={state.vehicleType}/><input type="hidden" name="entryDecision" value="CASUAL"/><button disabled={pending} className="h-12 w-full rounded-xl bg-slate-900 font-bold text-white">Cobrar como avulso</button></form><form action={requestAction} className="space-y-2"><input type="hidden" name="plate" value={state.plate}/><label className="sr-only" htmlFor="exceptionReason">Justificativa</label><input id="exceptionReason" name="reason" required minLength={5} maxLength={500} placeholder="Justificativa para autorização" className="h-12 w-full rounded-xl border bg-white px-3"/><button disabled={requestPending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-600 bg-white font-bold text-amber-800"><ShieldCheck className="size-5"/>{requestPending?"Solicitando...":"Solicitar exceção"}</button></form></div>:null}
    {(requestState.error||requestState.success)&&<p role="status" className={`rounded-xl px-4 py-3 text-sm font-semibold ${requestState.error?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}>{requestState.error??requestState.success}</p>}
  </div>;
}
