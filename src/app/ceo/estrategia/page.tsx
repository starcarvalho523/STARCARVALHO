import { BarChart3, BriefcaseBusiness, Building2, CarFront, CircleDollarSign, Gauge, Layers3, TrendingUp } from "lucide-react";
import { getMonthlyAccess, money } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";
import { commercialSummary } from "@/lib/ceo-commercial-analytics";
import { createBusinessContract, saveZone } from "./actions";

const pct = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;
const field = "mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default async function StrategyPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const params = await searchParams;
  const { unitIds, manageableUnitIds } = await getMonthlyAccess();
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const [unitsQ,zonesQ,sessionsQ,paymentsQ,subscriptionsQ,demandQ,businessQ] = await Promise.all([
    supabase.from("parking_units").select("id,name,capacity").in("id",unitIds),
    supabase.from("parking_zones").select("id,unit_id,name,code,capacity,zone_type,priority,is_active").in("unit_id",unitIds).order("priority"),
    supabase.from("parking_sessions").select("unit_id,status,entered_at,exited_at,entry_mode").in("unit_id",unitIds).gte("entered_at",since),
    supabase.from("payments").select("unit_id,status,amount,paid_at").in("unit_id",unitIds).eq("status","PAID").gte("paid_at",since),
    supabase.from("monthly_subscriptions").select("unit_id,status,contracted_price").in("unit_id",unitIds),
    supabase.from("parking_demand_events").select("unit_id,reason,occurred_at").in("unit_id",unitIds).gte("occurred_at",since),
    supabase.from("business_parking_contracts").select("id,unit_id,status,price,name,business_id,max_registered_vehicles,max_simultaneous_vehicles,guaranteed_spaces").in("unit_id",unitIds),
  ]);

  const units = unitsQ.data ?? [];
  const zones = zonesQ.data ?? [];
  const business = businessQ.data ?? [];
  const summary = commercialSummary({
    units, zones, sessions: sessionsQ.data ?? [], payments: paymentsQ.data ?? [],
    subscriptions: subscriptionsQ.data ?? [], demand: demandQ.data ?? [],
    businessContracts: business, days: 30,
  });
  const canManage = manageableUnitIds.length > 0;

  return <main className="space-y-6 pb-10">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"><TrendingUp className="size-3.5" />Operação Comercial 2.0</div><h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Estratégia, capacidade e expansão</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Transforma operação, mensalistas, capacidade e demanda perdida em indicadores para decisões comerciais e de expansão.</p></div><div className={`rounded-2xl px-4 py-3 text-sm font-bold ${summary.expansionStatus === "STUDY_EXPANSION" ? "bg-amber-50 text-amber-800" : summary.expansionStatus === "WATCH" ? "bg-blue-50 text-blue-800" : "bg-emerald-50 text-emerald-800"}`}>{summary.expansionStatus === "STUDY_EXPANSION" ? "Estudar expansão" : summary.expansionStatus === "WATCH" ? "Monitorar capacidade" : "Capacidade saudável"}</div></div>
    </header>

    {params.erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{params.erro}</div>}
    {params.sucesso && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{params.sucesso}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Building2} label="Capacidade física" value={`${summary.totalCapacity} vagas`} detail={`${summary.allocatedZoneCapacity} distribuídas em zonas`} />
      <Metric icon={Gauge} label="Ocupação agora" value={pct(summary.occupancy)} detail={`${summary.openSessions} veículos em operação`} />
      <Metric icon={CircleDollarSign} label="RevPAS · 30 dias" value={money(summary.revpas)} detail="receita paga / vaga / dia" />
      <Metric icon={TrendingUp} label="MRR recorrente" value={money(summary.recurringMrr)} detail={`${summary.activeMonthlyContracts} mensalistas + ${summary.activeBusinessContracts} B2B`} />
      <Metric icon={CarFront} label="Demanda perdida · 30d" value={String(summary.lostDemand)} detail={`${summary.fullDemand} por lotação`} />
      <Metric icon={BarChart3} label="Mix mensalista" value={pct(summary.monthlyShare)} detail={`${pct(summary.casualShare)} avulso`} />
      <Metric icon={CircleDollarSign} label="Receita paga · 30d" value={money(summary.paidRevenue)} detail="somente pagamentos confirmados" />
      <Metric icon={Layers3} label="Capacidade não alocada" value={`${summary.unallocatedCapacity} vagas`} detail="espaço ainda sem zona ativa" />
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-4"><h2 className="text-lg font-black text-slate-950">Zonas de capacidade</h2><p className="mt-1 text-sm text-slate-500">Rotatividade, flexível, mensalista ou reservada. A soma de zonas ativas não pode ultrapassar a capacidade da unidade.</p></div><div className="space-y-3">{zones.length ? zones.map((zone) => <div key={zone.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4"><div><div className="font-bold text-slate-900">{zone.code} · {zone.name}</div><div className="mt-1 text-xs text-slate-500">{zone.zone_type} · prioridade {zone.priority} · {zone.is_active ? "ativa" : "inativa"}</div></div><div className="text-right"><div className="text-xl font-black text-slate-950">{zone.capacity}</div><div className="text-xs text-slate-500">vagas</div></div></div>) : <Empty text="Nenhuma zona criada. A capacidade ainda está apenas no nível da unidade." />}</div></div>

      {canManage ? <form action={saveZone} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-black text-slate-950">Criar zona</h2><p className="mt-1 text-sm text-slate-500">Comece dividindo a área física sem alterar o fluxo atual de entradas.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Label text="Unidade"><select name="unitId" className={field} required>{units.filter((u)=>manageableUnitIds.includes(u.id)).map((u)=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Label><Label text="Código"><input name="code" className={field} required placeholder="A" /></Label><Label text="Nome"><input name="name" className={field} required placeholder="Rotatividade frente" /></Label><Label text="Capacidade"><input name="capacity" type="number" min="1" className={field} required /></Label><Label text="Tipo"><select name="zoneType" className={field} defaultValue="FLEX"><option value="ROTATION">Rotatividade</option><option value="FLEX">Flexível</option><option value="MONTHLY">Mensalistas</option><option value="RESERVED">Reservada</option></select></Label><Label text="Prioridade"><input name="priority" type="number" min="1" max="100" defaultValue="50" className={field} required /></Label></div><input type="hidden" name="active" value="true" /><button className="mt-4 h-11 w-full rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700">Salvar zona</button></form> : null}
    </section>

    <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2"><BriefcaseBusiness className="size-5 text-blue-600"/><h2 className="text-lg font-black text-slate-950">Contratos empresariais</h2></div><p className="mt-1 text-sm text-slate-500">B2B com limite de placas, simultaneidade e vagas garantidas separados.</p><div className="mt-4 space-y-3">{business.length ? business.map((contract)=><div key={contract.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-900">{contract.name}</div><div className="mt-1 text-xs text-slate-500">{contract.status} · {contract.max_registered_vehicles} placas · {contract.max_simultaneous_vehicles} simultâneos · {contract.guaranteed_spaces} garantidas</div></div><div className="font-black text-slate-950">{money(contract.price)}</div></div></div>) : <Empty text="Nenhum contrato B2B ativo nesta unidade." />}</div></div>
      {canManage ? <form action={createBusinessContract} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-black text-slate-950">Novo contrato B2B</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Label text="Unidade"><select name="unitId" className={field} required>{units.filter((u)=>manageableUnitIds.includes(u.id)).map((u)=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Label><Label text="Razão social"><input name="legalName" className={field} required /></Label><Label text="Nome fantasia"><input name="tradeName" className={field} /></Label><Label text="CNPJ"><input name="taxDocument" inputMode="numeric" className={field} placeholder="somente números" /></Label><Label text="Nome do contrato"><input name="contractName" className={field} required placeholder="Plano Empresa" /></Label><Label text="Preço mensal"><input name="price" type="number" min="0.01" step="0.01" className={field} required /></Label><Label text="Início"><input name="startsOn" type="date" className={field} required /></Label><Label text="Placas cadastráveis"><input name="maxRegistered" type="number" min="1" defaultValue="5" className={field} required /></Label><Label text="Simultâneos"><input name="maxSimultaneous" type="number" min="1" defaultValue="1" className={field} required /></Label><Label text="Vagas garantidas"><input name="guaranteedSpaces" type="number" min="0" defaultValue="0" className={field} required /></Label></div><button className="mt-4 h-11 w-full rounded-xl bg-slate-950 font-bold text-white hover:bg-slate-800">Criar contrato empresarial</button></form> : null}
    </section>
  </main>;
}

function Metric({icon:Icon,label,value,detail}:{icon:typeof Building2;label:string;value:string;detail:string}) { return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Icon className="size-4 text-blue-600"/>{label}</div><div className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></article>; }
function Label({text,children}:{text:string;children:React.ReactNode}) { return <label className="text-sm font-semibold text-slate-700">{text}{children}</label>; }
function Empty({text}:{text:string}) { return <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">{text}</div>; }
