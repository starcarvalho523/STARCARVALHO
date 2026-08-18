"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDollarSign, Clock3, Gauge, Search, WalletCards } from "lucide-react";
import { OperationBadge } from "@/components/operation-badge";
import { VehicleGroupIcon, VehicleTypeIcon } from "@/components/vehicle-type-icon";
import { formatDateTime, formatDuration, formatMoney, formatPaymentStatus, formatSessionFinancialStatus, formatVehicleType, sessionParkingStatus, type ActiveSession } from "@/lib/operator-format";

const filters=[
  {value:"ALL",label:"Todos"},
  {value:"OPEN",label:"Estacionados"},
  {value:"PAYMENT_PENDING",label:"Aguardando pagamento"},
  {value:"PAID",label:"Prontos para saída"},
  {value:"MANUAL_REVIEW",label:"Em revisão"},
] as const;

function actionFor(session:ActiveSession){
  if(session.status==="OPEN") return {label:"Iniciar saída",className:"bg-blue-600 text-white hover:bg-blue-700"};
  if(session.status==="PAYMENT_PENDING") return {label:"Ir para pagamentos",className:"border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"};
  if(session.status==="PAID") return {label:"Liberar saída",className:"bg-emerald-600 text-white hover:bg-emerald-700"};
  return {label:"Ver detalhes",className:"border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"};
}

export function OperatorSessionSearch({sessions,timezone,capacity}:{sessions:ActiveSession[];timezone:string;capacity:number}) {
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("ALL");
  const [selectedId,setSelectedId]=useState(sessions[0]?.id??"");
  const rows=useMemo(()=>sessions.filter((item)=>item.plate.includes(query.toUpperCase().replace(/[^A-Z0-9]/g,""))&&(status==="ALL"||item.status===status)),[sessions,query,status]);
  const selected=rows.find(item=>item.id===selectedId)??rows[0]??null;
  const occupancy=capacity>0?Math.min(100,Math.round((sessions.length/capacity)*100)):0;
  const awaiting=sessions.filter(item=>item.status==="PAYMENT_PENDING");
  const awaitingAmount=awaiting.reduce((sum,item)=>sum+(item.amount??0),0);
  const ready=sessions.filter(item=>item.status==="PAID").length;

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard icon={VehicleGroupIcon} tone="blue" label="No pátio" value={String(sessions.length)} detail={`de ${capacity} vagas ocupadas`}/>
      <SummaryCard icon={Gauge} tone="green" label="Ocupação" value={`${occupancy}%`} detail={`${sessions.length} de ${capacity} vagas`}/>
      <SummaryCard icon={WalletCards} tone="amber" label="Aguardando pagamento" value={String(awaiting.length)} detail={formatMoney(awaitingAmount)}/>
      <SummaryCard icon={CheckCircle2} tone="green" label="Prontos para saída" value={String(ready)} detail="Disponíveis para liberar"/>
    </div>

    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0 self-start overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 px-5 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 sm:h-11 sm:rounded-xl sm:px-3.5">
              <Search className="size-5 shrink-0 text-slate-400 sm:size-4"/>
              <input aria-label="Buscar veículo por placa" type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar por placa" className="min-w-0 flex-1 bg-transparent text-base uppercase outline-none placeholder:normal-case sm:text-sm"/>
            </label>
            <div className="mobile-nav-scroll flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/70 p-1">
              {filters.map(filter=><button key={filter.value} type="button" onClick={()=>setStatus(filter.value)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${status===filter.value?"bg-white text-blue-700 shadow-sm ring-1 ring-blue-200":"text-slate-600 hover:bg-white"}`}>{filter.label}</button>)}
            </div>
          </div>
        </div>

        {rows.length===0?<div className="flex min-h-44 items-center justify-center gap-3 p-6 text-center text-sm text-slate-500 sm:min-h-56 sm:p-8"><VehicleGroupIcon className="size-7 shrink-0 text-slate-300"/>Nenhum veículo encontrado para este filtro.</div>:<div className="overflow-x-auto"><table className="w-full min-w-[760px] table-fixed text-left text-xs"><colgroup><col className="w-[14%]"/><col className="w-[12%]"/><col className="w-[18%]"/><col className="w-[13%]"/><col className="w-[13%]"/><col className="w-[15%]"/><col className="w-[15%]"/></colgroup><thead className="bg-slate-50 text-slate-500"><tr>{["Placa","Tipo","Entrada","Permanência","Valor atual","Situação","Ação"].map(h=><th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{rows.map(session=>{const action=actionFor(session);const selectedRow=selected?.id===session.id;return <tr key={session.id} onClick={()=>setSelectedId(session.id)} className={`cursor-pointer border-t transition ${selectedRow?"bg-blue-50/80 shadow-[inset_3px_0_0_#2563eb]":"hover:bg-slate-50"}`}><td className="px-3 py-3 font-bold text-blue-600"><span className="inline-flex items-center gap-2"><VehicleTypeIcon vehicleType={session.vehicle_type} className="size-4 shrink-0 text-slate-500"/>{session.plate}</span></td><td className="px-3 py-3">{formatVehicleType(session.vehicle_type)}</td><td className="px-3 py-3">{formatDateTime(session.entered_at,timezone)}</td><td className="px-3 py-3 font-medium">{formatDuration(session.duration_minutes)}</td><td className="px-3 py-3 font-semibold">{formatMoney(session.amount)}</td><td className="px-3 py-3"><OperationBadge {...sessionParkingStatus(session.status,session.entry_mode,session.financial_obligation)}/></td><td className="px-3 py-3"><Link onClick={(event)=>event.stopPropagation()} href={`/frentista/saidas?session=${session.id}`} className={`inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-center text-[11px] font-bold transition ${action.className}`}>{action.label}</Link></td></tr>})}</tbody></table></div>}
        <div className="border-t px-4 py-3 text-xs text-slate-500"><span>{rows.length} de {sessions.length} veículos exibidos</span></div>
      </section>

      {selected?<aside className="rounded-2xl border bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:self-start"><VehicleDetail session={selected} timezone={timezone}/></aside>:null}
    </div>
  </div>;
}

function SummaryCard({icon:Icon,tone,label,value,detail}:{icon:ComponentType<{className?:string}>;tone:"blue"|"green"|"amber";label:string;value:string;detail:string}){
  const palette=tone==="green"?"bg-emerald-50 text-emerald-600":tone==="amber"?"bg-amber-50 text-amber-600":"bg-blue-50 text-blue-600";
  return <div className="flex min-w-0 items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm"><span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${palette}`}><Icon className="size-6"/></span><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{label}</p><p className={`mt-0.5 text-2xl font-extrabold ${tone==="green"?"text-emerald-600":tone==="amber"?"text-amber-600":"text-blue-600"}`}>{value}</p><p className="truncate text-xs text-slate-500">{detail}</p></div></div>
}

function VehicleDetail({session,timezone}:{session:ActiveSession;timezone:string}){
  const action=actionFor(session); const monthly=formatSessionFinancialStatus(session.entry_mode,session.financial_obligation); const financial=monthly??formatPaymentStatus(session.payment_status);
  return <div><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-2xl font-extrabold tracking-tight text-slate-950">{session.plate}</h2><p className="mt-1 flex items-center gap-2 text-xs text-slate-500"><VehicleTypeIcon vehicleType={session.vehicle_type} className="size-3.5 shrink-0"/><span className="truncate">{formatVehicleType(session.vehicle_type)} • {session.tariff_name}</span></p></div><OperationBadge {...sessionParkingStatus(session.status,session.entry_mode,session.financial_obligation)}/></div>
    <DetailCard title="Sessão" icon={Clock3}><div className="grid grid-cols-2 gap-3"><Detail label="Entrada" value={formatDateTime(session.entered_at,timezone)}/><Detail label="Permanência" value={formatDuration(session.duration_minutes)} accent/><Detail label="Tarifa" value={session.tariff_name} wide/></div></DetailCard>
    <DetailCard title="Financeiro" icon={CircleDollarSign}><div className="space-y-3"><DetailRow label="Valor atual" value={formatMoney(session.amount)} strong/><DetailRow label="Situação do pagamento" value={financial}/><DetailRow label="Forma de pagamento" value="—"/></div></DetailCard>
    <section className="mt-3"><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><ArrowRight className="size-4 text-blue-600"/>Ações</p><div className="mt-3 space-y-2"><Link href={`/frentista/saidas?session=${session.id}`} className={`flex h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-bold transition ${action.className}`}>{action.label}<ArrowRight className="ml-2 size-4"/></Link>{session.status==="PAYMENT_PENDING"?<Link href={`/frentista/saidas?session=${session.id}`} className="flex h-11 w-full items-center justify-center rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 transition hover:bg-blue-50">Abrir cobrança</Link>:null}</div></section>
    <p className="mt-5 border-t pt-4 text-[11px] leading-5 text-slate-400">Os dados exibidos vêm da sessão ativa atual da unidade.</p>
  </div>
}

function DetailCard({title,icon:Icon,children}:{title:string;icon:typeof Clock3;children:React.ReactNode}){return <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-4"><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon className="size-4 text-blue-600"/>{title}</p><div className="mt-3 border-t border-slate-200 pt-3">{children}</div></section>}
function Detail({label,value,accent=false,wide=false}:{label:string;value:string;accent?:boolean;wide?:boolean}){return <div className={wide?"col-span-2":""}><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-1 break-words text-xs font-semibold ${accent?"text-emerald-600":"text-slate-950"}`}>{value}</p></div>}
function DetailRow({label,value,strong=false}:{label:string;value:string;strong?:boolean}){return <div className="flex items-start justify-between gap-4"><span className="text-xs text-slate-500">{label}</span><b className={`break-words text-right text-xs ${strong?"text-blue-600":"text-slate-800"}`}>{value}</b></div>}
