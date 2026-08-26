"use client";
import { useActionState,useRef,useState } from "react";
import { AlertTriangle,CheckCircle2,Clock3,Info,LoaderCircle,LogIn,ReceiptText,ShieldCheck } from "lucide-react";
import { VehicleTypeIcon } from "@/components/vehicle-type-icon";
import { registerEntry,requestMonthlyEntryAuthorization,type OperatorActionState } from "@/app/frentista/actions";
import Link from "next/link";
const initial:OperatorActionState={};

type VehicleType="CAR"|"MOTORCYCLE";

export function EntryForm({carEnabled,motorcycleEnabled,compact=false}:{carEnabled:boolean;motorcycleEnabled:boolean;compact?:boolean}){
  const[plate,setPlate]=useState("");
  const[vehicleType,setVehicleType]=useState<VehicleType>(carEnabled?"CAR":"MOTORCYCLE");
  const[showAuthorizationForm,setShowAuthorizationForm]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const[state,action,pending]=useActionState(async(previous:OperatorActionState,formData:FormData)=>{const result=await registerEntry(previous,formData);if(result.success){setPlate("");setShowAuthorizationForm(false);setTimeout(()=>input.current?.focus(),0);}return result;},initial);
  const[requestState,requestAction,requestPending]=useActionState(requestMonthlyEntryAuthorization,initial);
  const normalized=plate.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);
  const valid=/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized);
  const selectedTypeEnabled=vehicleType==="CAR"?carEnabled:motorcycleEnabled;
  const noTariffAvailable=!carEnabled&&!motorcycleEnabled;
  const selectedTypeLabel=vehicleType==="CAR"?"Carro":"Moto";

  return <div className={compact?"space-y-2":"space-y-4"}>
    <form action={action} className={`grid items-end ${compact?"gap-2.5 lg:grid-cols-[minmax(0,1fr)_280px_280px]":"gap-4 lg:grid-cols-[minmax(0,1fr)_260px_280px]"}`}>
      <input type="hidden" name="entryDecision" value="REQUIRE_DECISION"/>

      <div className={compact?"space-y-0":"space-y-2"}>
        {!compact?<label htmlFor="entryPlate" className="text-sm font-semibold text-slate-700">Placa do veículo</label>:null}
        <label className={`flex items-center rounded-xl border-2 border-blue-500 bg-white px-4 shadow-sm transition focus-within:ring-4 focus-within:ring-blue-100 ${compact?"h-12":"h-16"}`}>
          <VehicleTypeIcon vehicleType={vehicleType} className="size-5 shrink-0 text-blue-600"/>
          <span className="sr-only">Placa do veículo</span>
          <input id="entryPlate" ref={input} autoFocus name="plate" value={normalized} onChange={event=>setPlate(event.target.value)} aria-invalid={normalized.length>0&&!valid} className={`h-full min-w-0 flex-1 bg-transparent px-3 font-bold uppercase outline-none placeholder:font-medium placeholder:normal-case placeholder:text-slate-400 ${compact?"text-base placeholder:text-sm":"text-xl placeholder:text-base"}`} placeholder="Digite a placa do veículo" autoComplete="off"/>
        </label>
        {!compact?<p className="text-xs text-slate-500">Digite apenas letras e números, sem espaços ou traços.</p>:null}
      </div>

      <div className={compact?"space-y-0":"space-y-2"}>
        {!compact?<label className="text-sm font-semibold text-slate-700" htmlFor="vehicleType">Tipo de veículo</label>:null}
        <div className="relative">
          <VehicleTypeIcon vehicleType={vehicleType} className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500"/>
          <select id="vehicleType" name="vehicleType" value={vehicleType} onChange={event=>setVehicleType(event.target.value as VehicleType)} className={`w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 ${compact?"h-12":"h-16"}`}>
            <option value="CAR" disabled={!carEnabled}>Carro{!carEnabled?" — sem tarifa":""}</option>
            <option value="MOTORCYCLE" disabled={!motorcycleEnabled}>Moto{!motorcycleEnabled?" — sem tarifa":""}</option>
          </select>
        </div>
        {!compact?<p className="text-xs text-slate-500">Somente tipos com tarifa ativa podem entrar.</p>:null}
      </div>

      <div className={compact?"space-y-0":"space-y-2"}>
        <button disabled={pending||!valid||!selectedTypeEnabled} className={`flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-5 font-bold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 disabled:text-white/95 disabled:opacity-100 ${compact?"h-12":"h-16"}`}>
          {pending?<LoaderCircle className="size-5 animate-spin"/>:<LogIn className="size-5"/>}
          {pending?"Verificando...":"Registrar entrada"}
        </button>
        {!compact?<p className="flex items-center justify-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="size-3.5 text-slate-500"/>Entrada registrada em tempo real</p>:null}
      </div>
    </form>

    {compact?<p className="flex items-center gap-1.5 text-[11px] leading-4 text-slate-500"><ShieldCheck className="size-3.5 text-slate-500"/>Horário, tarifa e operador serão registrados automaticamente.</p>:null}

    {!compact&& !noTariffAvailable?<div className="grid auto-rows-fr gap-3 md:grid-cols-2">
      <div className="flex h-full min-h-[76px] items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-5"/></span>
        <div><p className="text-sm font-bold text-emerald-900">Tarifa ativa para {selectedTypeLabel}</p><p className="mt-0.5 text-xs text-emerald-800">Entrada liberada. A tarifa será aplicada conforme as regras vigentes.</p></div>
      </div>
      <div className="flex h-full min-h-[76px] items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700"><Clock3 className="size-5"/></span>
        <div><p className="text-sm font-bold text-slate-900">Registro automático</p><p className="mt-0.5 text-xs text-slate-600">Horário oficial, tarifa e operador serão registrados ao confirmar.</p></div>
      </div>
    </div>:null}

    {noTariffAvailable?<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><Info className="mt-0.5 size-5 shrink-0"/><span>Nenhuma tarifa ativa disponível para entrada. Configure ao menos uma tarifa de carro ou moto antes de registrar veículos.</span></div>:null}

    {(state.error||state.success)&&<div role="status" className={`flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${state.error?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}><CheckCircle2 className="size-5"/><span>{state.error??state.success}{state.relatedMessage&&!state.error?` ${state.relatedMessage}`:""}</span>{state.relatedHref?<Link className="ml-auto underline" href={state.relatedHref}>{state.error?state.relatedMessage:"Ver histórico"}</Link>:null}</div>}

    {state.monthlyDecisionRequired&&state.plate?<section className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5 sm:p-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200"><AlertTriangle className="size-6"/></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-black text-slate-950">Cobertura da mensalidade</h3>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-100/70 px-3 py-1 text-xs font-bold text-amber-800"><span className="size-2 rounded-full bg-amber-500"/>Não disponível</span>
          </div>
          <p className="mt-2 font-semibold text-slate-800">Este veículo não pode usar a mensalidade nesta entrada.</p>
          <p className="mt-1 text-sm text-slate-600">Escolha uma opção para continuar o atendimento.</p>
        </div>
      </div>
      <div className="border-t border-amber-100 px-5 py-5 sm:px-6">
        <div className="grid gap-3 md:grid-cols-2">
          <form action={action}>
            <input type="hidden" name="plate" value={state.plate}/><input type="hidden" name="vehicleType" value={state.vehicleType}/><input type="hidden" name="entryDecision" value="CASUAL"/>
            <button disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"><ReceiptText className="size-5"/>{pending?"Registrando...":"Cobrar como avulso"}</button>
          </form>
          <button type="button" onClick={()=>setShowAuthorizationForm(value=>!value)} aria-expanded={showAuthorizationForm} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-4 font-bold text-blue-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-50"><ShieldCheck className="size-5"/>{showAuthorizationForm?"Ocultar liberação":"Solicitar liberação"}</button>
        </div>
        {showAuthorizationForm?<form action={requestAction} className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <input type="hidden" name="plate" value={state.plate}/>
          <label htmlFor="exceptionReason" className="text-sm font-bold text-slate-800">Motivo da liberação</label>
          <p className="mt-1 text-xs text-slate-600">Explique brevemente por que esta entrada deve ser liberada.</p>
          <textarea id="exceptionReason" name="reason" required minLength={5} maxLength={500} rows={3} placeholder="Ex.: cliente regular aguardando confirmação da mensalidade" className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"/>
          <div className="mt-3 flex justify-end"><button disabled={requestPending} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"><ShieldCheck className="size-4"/>{requestPending?"Solicitando...":"Enviar solicitação"}</button></div>
        </form>:null}
      </div>
    </section>:null}
    {(requestState.error||requestState.success)&&<p role="status" className={`rounded-xl px-4 py-3 text-sm font-semibold ${requestState.error?"bg-red-50 text-red-700":"bg-emerald-50 text-emerald-700"}`}>{requestState.error??requestState.success}</p>}
  </div>;
}
