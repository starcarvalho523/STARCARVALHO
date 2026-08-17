import Link from "next/link";
import type { ComponentType } from "react";
import { Banknote, CircleDollarSign, CircleGauge, CreditCard, LogIn, LogOut, WalletCards } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { CeoFilters } from "@/components/ceo-filters";
import { AlertList, AnalyticsChart, InsightGrid } from "@/components/ceo-visuals";
import { VehicleGroupIcon, VehicleTypeIcon } from "@/components/vehicle-type-icon";
import { ceoNav } from "@/lib/ceo-nav";
import { getCeoOperationalAnalytics, normalizeCeoFilters } from "@/lib/ceo-operational-analytics";
import { formatDuration, formatMoney } from "@/lib/operator-format";

export const dynamic="force-dynamic";

export default async function Page({searchParams}:{searchParams:Promise<{period?:string;unit?:string}>}){
  const filters=normalizeCeoFilters(await searchParams);
  const data=await getCeoOperationalAnalytics(filters);
  const activeCars=data.active.filter(session=>session.vehicle_type==="CAR").length;
  const activeMotorcycles=data.active.filter(session=>session.vehicle_type==="MOTORCYCLE").length;
  const occupancy=`${data.metrics.occupancy.toFixed(1).replace(".",",")}%`;

  return <DashboardShell nav={ceoNav} active="Painel do CEO" role="CEO">
    <div className="mx-auto max-w-[1500px] space-y-4 sm:space-y-5">
      <CeoPageHeader title="Painel do CEO" description="Visão consolidada da operação e do desempenho financeiro." updatedAt={data.updatedAt}>
        <CeoFilters units={data.units}/>
      </CeoPageHeader>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <ExecutiveMetric label="Receita" value={formatMoney(data.metrics.revenue)} icon={CircleDollarSign} tone="green" note="No período"/>
        <VehicleMetric total={data.metrics.active} cars={activeCars} motorcycles={activeMotorcycles}/>
        <ExecutiveMetric label="Ocupação" value={occupancy} icon={CircleGauge} tone="violet" note="Atual"/>
        <ExecutiveMetric label="Entradas" value={String(data.metrics.entries)} icon={LogIn} tone="blue" note="No período"/>
        <ExecutiveMetric label="Saídas" value={String(data.metrics.exits)} icon={LogOut} tone="orange" note="No período"/>
        <ExecutiveMetric label="Ticket médio" value={data.metrics.ticket?formatMoney(data.metrics.ticket):"—"} icon={WalletCards} tone="blue" note="No período"/>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AnalyticsChart title="Receita ao longo do período" rows={data.buckets} field="revenue" empty="Nenhum pagamento confirmado neste período."/>
        <AnalyticsChart title="Movimento de ocupação" rows={data.buckets} field="occupancy" empty="Nenhuma movimentação suficiente para reconstruir a ocupação."/>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.05fr_1.1fr]">
        <PaymentMethods methods={data.methods}/>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-5 py-4"><div><h2 className="font-bold text-slate-950">Alertas prioritários</h2><p className="mt-0.5 text-xs text-slate-400">{data.alerts.length?`${data.alerts.length} alerta${data.alerts.length===1?"":"s"} ativo${data.alerts.length===1?"":"s"}`:"Operação sem alertas prioritários"}</p></div><Link href="/ceo/alertas" className="text-xs font-bold text-blue-600 hover:text-blue-700">Ver todos</Link></div>
          <AlertList alerts={data.alerts} limit={3}/>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4"><h2 className="font-bold text-slate-950">Insights do negócio</h2><p className="mt-0.5 text-xs text-slate-400">Leitura rápida do período selecionado</p></div>
          <InsightGrid entries={data.metrics.entries} averageMinutes={data.metrics.averageMinutes} occupancy={data.metrics.occupancy} ticket={data.metrics.ticket}/>
        </section>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-950">Resumo por unidade</h2><p className="mt-0.5 text-xs text-slate-400">Comparativo operacional das unidades autorizadas</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{data.unitSummaries.length} {data.unitSummaries.length===1?"unidade":"unidades"}</span></div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50/80 text-xs font-semibold text-slate-500"><tr>{["Unidade","Entradas","Saídas","No pátio","Ocupação","Permanência","Pendências","Receita"].map(item=><th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody>{data.unitSummaries.map(unit=><tr key={unit.id} className="border-t border-slate-100 transition hover:bg-slate-50/70"><td className="px-4 py-3"><Link href={`/ceo/unidades/${unit.id}`} className="font-bold text-blue-600 hover:text-blue-700">{unit.name}</Link></td><td className="px-4 py-3">{unit.entries}</td><td className="px-4 py-3">{unit.exits}</td><td className="px-4 py-3 font-semibold">{unit.active}</td><td className="px-4 py-3">{unit.occupancy.toFixed(1).replace(".",",")}%</td><td className="px-4 py-3">{unit.averageMinutes?formatDuration(Math.round(unit.averageMinutes)):"—"}</td><td className="px-4 py-3">{unit.pending}</td><td className="px-4 py-3 font-semibold">{formatMoney(unit.revenue)}</td></tr>)}</tbody></table></div>
        <div className="divide-y divide-slate-100 md:hidden">{data.unitSummaries.map(unit=><Link href={`/ceo/unidades/${unit.id}`} key={unit.id} className="block p-4 transition active:bg-slate-50"><div className="flex items-center justify-between gap-3"><b className="text-blue-600">{unit.name}</b><span className="text-sm font-bold">{formatMoney(unit.revenue)}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><MiniStat label="No pátio" value={String(unit.active)}/><MiniStat label="Ocupação" value={`${unit.occupancy.toFixed(1).replace(".",",")}%`}/><MiniStat label="Pendências" value={String(unit.pending)}/></div></Link>)}</div>
      </section>
    </div>
  </DashboardShell>;
}

type Tone="green"|"blue"|"violet"|"orange";
function ExecutiveMetric({label,value,icon:Icon,tone,note}:{label:string;value:string;icon:ComponentType<{className?:string}>;tone:Tone;note:string}){
  const palette={green:"bg-emerald-50 text-emerald-600",blue:"bg-blue-50 text-blue-600",violet:"bg-violet-50 text-violet-600",orange:"bg-orange-50 text-orange-600"}[tone];
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${palette}`}><Icon className="size-5"/></span><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-0.5 truncate text-xl font-extrabold tracking-tight text-slate-950">{value}</p><p className="mt-0.5 text-[10px] font-medium text-slate-400">{note}</p></div></div></div>;
}

function VehicleMetric({total,cars,motorcycles}:{total:number;cars:number;motorcycles:number}){
  return <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/40 p-4 shadow-sm sm:col-span-2 xl:col-span-1"><div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><VehicleGroupIcon className="size-7"/></span><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-500">Veículos no pátio</p><div className="mt-1 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2"><VehicleCount label="Carros" value={cars} type="CAR"/><span className="h-8 w-px bg-slate-200"/><VehicleCount label="Motos" value={motorcycles} type="MOTORCYCLE"/><span className="h-8 w-px bg-slate-200"/><div className="text-center"><p className="text-lg font-extrabold text-blue-700">{total}</p><p className="text-[9px] font-semibold text-slate-400">Total</p></div></div></div></div></div>;
}
function VehicleCount({label,value,type}:{label:string;value:number;type:"CAR"|"MOTORCYCLE"}){return <div className="text-center"><div className="flex items-center justify-center gap-1 text-blue-600"><VehicleTypeIcon vehicleType={type} className="size-3.5"/><span className="text-base font-extrabold text-slate-950">{value}</span></div><p className="text-[9px] font-semibold text-slate-400">{label}</p></div>}

function PaymentMethods({methods}:{methods:{CASH:{amount:number;count:number;percentage:number};CARD:{amount:number;count:number;percentage:number};PIX:{amount:number;count:number;percentage:number}}}){
  const rows=[{label:"Dinheiro",icon:Banknote,data:methods.CASH,tone:"bg-emerald-50 text-emerald-600"},{label:"Cartão",icon:CreditCard,data:methods.CARD,tone:"bg-blue-50 text-blue-600"},{label:"PIX",icon:CircleDollarSign,data:methods.PIX,tone:"bg-cyan-50 text-cyan-600",pending:true}];
  const total=rows.reduce((sum,row)=>sum+row.data.amount,0);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><h2 className="font-bold text-slate-950">Formas de pagamento</h2><p className="mt-0.5 text-xs text-slate-400">Distribuição da receita confirmada</p></div><div className="mt-4 space-y-3">{rows.map(({label,icon:Icon,data:method,tone,pending})=><div key={label} className="flex items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-4"/></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-sm"><div><span className="font-semibold text-slate-800">{label}</span><span className="ml-1 text-xs text-slate-400">· {method.count}</span></div><b className="shrink-0">{formatMoney(method.amount)}</b></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{width:`${Math.min(100,method.percentage)}%`}}/></div>{pending?<p className="mt-1 text-[10px] text-slate-400">Integração real ainda pendente</p>:null}</div></div>)}</div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm"><span className="font-semibold text-slate-500">Total</span><b>{formatMoney(total)}</b></div></section>;
}
function MiniStat({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 px-2 py-2"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-0.5 text-sm font-bold text-slate-900">{value}</p></div>}
