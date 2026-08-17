import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote,CarFront,CreditCard,Gauge,LogIn,LogOut,Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { EntryForm } from "@/components/entry-form";
import { MetricCard } from "@/components/dashboard-parts";
import { OperatorSessionTable } from "@/components/operator-session-table";
import { getOperatorDashboard,formatMoney } from "@/lib/operator-data";
import { operatorNav } from "@/lib/operator-nav";
export const dynamic="force-dynamic";

export default async function OperatorPage(){
  const data=await getOperatorDashboard();
  const shift=data.open_shift;
  if(!shift)redirect("/frentista/caixa?welcome=1");

  return <DashboardShell nav={operatorNav} active="Painel" role="Frentista" aside={<div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-sm font-bold">Caixa do turno</p><><p className="mt-3 text-xs text-slate-500">Dinheiro esperado</p><p className="text-xl font-bold text-emerald-600">{formatMoney(Number(shift.opening_amount)+Number(shift.cash_total))}</p><p className="mt-2 text-xs text-slate-500">{shift.payment_count} pagamentos</p></><Link href="/frentista/caixa" className="mt-4 block rounded-lg border py-2 text-center text-xs font-semibold text-blue-600">Ver caixa</Link></div>}>
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Painel do Frentista</h1>
        <p className="mt-1 text-sm text-slate-500">Operação em tempo real — {data.unit.name}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Veículos no pátio" value={String(data.vehicles_in_yard)} icon={CarFront}/>
        <MetricCard label="Vagas disponíveis" value={String(data.available_spaces)} icon={Gauge} tone="green"/>
        <MetricCard label="Entradas hoje" value={String(data.entries_today)} icon={LogIn} tone="violet"/>
        <MetricCard label="Saídas hoje" value={String(data.exits_today)} icon={LogOut} tone="orange"/>
      </div>

      <section>
        <h2 className="mb-2.5 text-sm font-bold text-slate-900">Ações rápidas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Quick href="/frentista/entradas" icon={LogIn} label="Entrada"/>
          <Quick href="/frentista/saidas" icon={LogOut} label="Saída"/>
          <Quick href="/frentista/veiculos" icon={CarFront} label="Veículos"/>
          <Quick href="/frentista/caixa" icon={Banknote} label="Caixa"/>
          <Quick href="/frentista/mensalistas" icon={Users} label="Mensalistas"/>
          <Quick href="/frentista/pagamentos" icon={CreditCard} label="Pagamentos"/>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/30 p-3.5 shadow-sm sm:p-4">
        <div className="mb-2">
          <h2 className="font-bold text-slate-950">Nova entrada rápida</h2>
        </div>
        <EntryForm compact carEnabled={data.has_active_car_tariff} motorcycleEnabled={data.has_active_motorcycle_tariff}/>
      </section>

      {data.available_spaces===0&&<p className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">Estacionamento lotado. Não registre novas entradas.</p>}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold">Veículos no pátio</h2>
          <Link href="/frentista/veiculos" className="text-sm font-semibold text-blue-600">Ver todos</Link>
        </div>
        <OperatorSessionTable sessions={data.active_sessions} timezone={data.unit.timezone} limit={8}/>
      </section>
    </div>
  </DashboardShell>;
}

function Quick({href,icon:Icon,label}:{href:string;icon:typeof CarFront;label:string}){
  return <Link href={href} className="flex h-16 items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold text-blue-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md"><Icon className="size-5"/>{label}</Link>;
}
