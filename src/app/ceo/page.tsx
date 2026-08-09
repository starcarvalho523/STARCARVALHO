import { AlertTriangle, CarFront, CircleDollarSign, CircleGauge, Users, WalletCards } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MetricCard, StatusPill } from "@/components/dashboard-parts";
import { ceoNav } from "@/lib/ceo-nav";
import { formatDuration, formatMoney } from "@/lib/operator-format";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";
type Unit={id:string;name:string;capacity:number;timezone:string};
type Session={id:string;unit_id:string;status:string;entered_at:string;exited_at:string|null;final_amount:number|null;payment_status:string};
type Payment={unit_id:string;amount:number;method:string;status:string;paid_at:string|null};
type Shift={unit_id:string;difference_amount:number|null;status:string};

export default async function CeoPage(){
  const access=await requireArea("ceo"); const supabase=await createClient(); const unitIds=[...new Set(access.assignments.map(a=>a.unit_id as string))];
  const today=new Date(); today.setUTCHours(3,0,0,0); const since=today.toISOString();
  const [unitsResult,sessionsResult,paymentsResult,monthlyResult,shiftsResult]=await Promise.all([
    supabase.from("parking_units").select("id,name,capacity,timezone").in("id",unitIds).eq("is_active",true),
    supabase.from("parking_sessions").select("id,unit_id,status,entered_at,exited_at,final_amount,payment_status").in("unit_id",unitIds).gte("entered_at",since),
    supabase.from("payments").select("unit_id,amount,method,status,paid_at").in("unit_id",unitIds).eq("status","PAID").gte("paid_at",since),
    supabase.from("monthly_subscriptions").select("id",{count:"exact",head:true}).in("unit_id",unitIds).eq("status","ACTIVE"),
    supabase.from("cash_shifts").select("unit_id,difference_amount,status").in("unit_id",unitIds).eq("status","CLOSED").neq("difference_amount",0).order("closed_at",{ascending:false}).limit(10),
  ]);
  const units=(unitsResult.data??[]) as Unit[]; const sessions=(sessionsResult.data??[]) as Session[]; const payments=(paymentsResult.data??[]) as Payment[]; const shifts=(shiftsResult.data??[]) as Shift[];
  const active=sessions.filter(s=>["OPEN","PAYMENT_PENDING","PAID","MANUAL_REVIEW"].includes(s.status)); const revenue=payments.reduce((sum,p)=>sum+Number(p.amount),0); const paidCount=payments.length; const capacity=units.reduce((sum,u)=>sum+u.capacity,0); const occupancy=capacity?active.length/capacity*100:0;
  const byMethod={CARD:0,CASH:0,PIX:0}; for(const payment of payments) byMethod[payment.method as keyof typeof byMethod]+=Number(payment.amount);
  return <DashboardShell nav={ceoNav} active="Painel do CEO" role="CEO" aside={<div className="rounded-2xl border bg-white p-4 text-xs"><p className="font-bold">Visão consolidada</p><p className="mt-3 text-slate-500">Hoje<br/>{units.length} {units.length===1?"unidade":"unidades"}</p></div>}><div className="mx-auto max-w-[1500px] space-y-4"><div><h1 className="text-3xl font-bold">Painel do CEO</h1><p className="text-sm text-slate-500">Indicadores calculados exclusivamente com dados confirmados.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><MetricCard label="Receita hoje" value={formatMoney(revenue)} icon={CircleDollarSign} tone="green"/><MetricCard label="Veículos no pátio" value={String(active.length)} icon={CarFront}/><MetricCard label="Ocupação" value={`${occupancy.toFixed(1).replace(".",",")}%`} icon={CircleGauge} tone="violet"/><MetricCard label="Ticket médio" value={paidCount?formatMoney(revenue/paidCount):"—"} icon={WalletCards} tone="orange"/><MetricCard label="Mensalistas ativos" value={String(monthlyResult.count??0)} icon={Users} tone="green"/><MetricCard label="PIX" value={byMethod.PIX?formatMoney(byMethod.PIX):"Não integrado"} icon={CircleDollarSign}/></div>
    <div className="grid gap-4 xl:grid-cols-2"><EmptyChart title="Receita ao longo do tempo" hasData={payments.length>1}/><EmptyChart title="Ocupação ao longo do dia" hasData={sessions.length>1}/></div>
    <div className="grid gap-4 xl:grid-cols-3"><section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Formas de pagamento hoje</h2>{paidCount?<div className="mt-4 space-y-3 text-sm"><Method label="Cartão" value={byMethod.CARD}/><Method label="Dinheiro" value={byMethod.CASH}/><Method label="PIX" value={byMethod.PIX}/></div>:<Empty text="Nenhum pagamento confirmado hoje."/>}</section><section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Alertas operacionais</h2>{shifts.length?<div className="mt-4 space-y-2">{shifts.map((s,i)=><div key={`${s.unit_id}-${i}`} className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><AlertTriangle className="size-5 text-amber-600"/><span>Diferença de caixa: <b>{formatMoney(s.difference_amount)}</b></span></div>)}</div>:<Empty text="Nenhum alerta operacional no momento."/>}</section><section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Insights do negócio</h2><Empty text="Dados insuficientes para gerar este indicador."/></section></div>
    <section className="overflow-x-auto rounded-2xl border bg-white"><h2 className="px-5 py-4 font-bold">Resumo operacional por unidade</h2><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["Unidade","Entradas hoje","Saídas hoje","Veículos no pátio","Ocupação","Permanência média","Pendências","Receita hoje"].map(h=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{units.map(unit=>{const us=sessions.filter(s=>s.unit_id===unit.id);const open=us.filter(s=>["OPEN","PAYMENT_PENDING","PAID","MANUAL_REVIEW"].includes(s.status));const exited=us.filter(s=>s.status==="EXITED");const durations=exited.filter(s=>s.exited_at).map(s=>(new Date(s.exited_at!).getTime()-new Date(s.entered_at).getTime())/60000);const pending=us.filter(s=>s.payment_status==="PENDING").length;const unitRevenue=payments.filter(p=>p.unit_id===unit.id).reduce((sum,p)=>sum+Number(p.amount),0);return <tr key={unit.id} className="border-t"><td className="px-4 py-3 font-bold">{unit.name}</td><td>{us.length}</td><td>{exited.length}</td><td>{open.length}</td><td><StatusPill>{unit.capacity?`${(open.length/unit.capacity*100).toFixed(1).replace(".",",")}%`:"—"}</StatusPill></td><td>{durations.length?formatDuration(Math.round(durations.reduce((a,b)=>a+b,0)/durations.length)):"—"}</td><td>{pending}</td><td>{formatMoney(unitRevenue)}</td></tr>})}</tbody></table>{units.length===0?<Empty text="Nenhuma unidade autorizada encontrada."/>:null}</section></div></DashboardShell>;
}
function Empty({text}:{text:string}){return <p className="py-8 text-center text-sm text-slate-500">{text}</p>}
function EmptyChart({title,hasData}:{title:string;hasData:boolean}){return <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">{title}</h2><div className="grid h-48 place-items-center text-sm text-slate-500">{hasData?"Dados reais disponíveis; visualização detalhada em preparação.":"Ainda não há movimentação suficiente para este gráfico."}</div></section>}
function Method({label,value}:{label:string;value:number}){return <div className="flex justify-between border-b pb-2"><span>{label}</span><b>{formatMoney(value)}</b></div>}

