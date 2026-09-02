import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  FileSearch,
  ShieldCheck,
  TrendingDown,
  UserRound,
  WalletCards,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dateBR, getMonthlyAccess, money, monthlyStatus } from "@/lib/monthly-admin";
import { monthlySubscriptionVehicleDisplay } from "@/lib/monthly-subscription-vehicle-display";
import { MonthlyTabs, StatusPill, primary } from "./ui";

export const dynamic = "force-dynamic";

export default async function MonthlySubscribersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const query = await searchParams;
  const { unitIds, canManage } = await getMonthlyAccess();
  const supabase = await createClient();
  const [{ data: units }, { data: rows }, { data: periods }] = await Promise.all([
    supabase.from("parking_units").select("id,name").in("id", unitIds).order("name"),
    supabase.from("monthly_subscriptions")
      .select("id,unit_id,customer_id,plan_name,status,starts_on,contracted_price,due_day,canceled_at,suspension_reason,monthly_plans(name)")
      .in("unit_id", unitIds).not("plan_id", "is", null).order("created_at", { ascending: false }),
    supabase.from("monthly_billing_periods")
      .select("subscription_id,status,due_date,grace_until,amount,period_start")
      .in("unit_id", unitIds).order("period_start", { ascending: false }),
  ]);

  const ids = [...new Set((rows ?? []).map((row) => row.customer_id).filter(Boolean))] as string[];
  const subscriptionIds = (rows ?? []).map((row) => row.id);
  const admin = createAdminClient();
  const [{ data: customers }, { data: vehicleLinks }] = await Promise.all([
    ids.length ? admin.from("customer_profiles").select("user_id,full_name").in("user_id", ids) : { data: [] },
    subscriptionIds.length ? admin.from("monthly_subscription_vehicles")
      .select("id,subscription_id,vehicle_id,valid_until").in("subscription_id", subscriptionIds).order("created_at", { ascending: true }) : { data: [] },
  ]);

  const vehicleIds = [...new Set((vehicleLinks ?? []).map((link) => link.vehicle_id))];
  const { data: vehicles } = vehicleIds.length ? await admin.from("vehicles").select("id,normalized_plate").in("id", vehicleIds) : { data: [] };
  const customerMap = new Map((customers ?? []).map((customer) => [customer.user_id, customer.full_name]));
  const unitMap = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const vehicleMap = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));
  const linksBySubscription = new Map<string, typeof vehicleLinks>();
  for (const link of vehicleLinks ?? []) {
    const existing = linksBySubscription.get(link.subscription_id) ?? [];
    existing.push(link); linksBySubscription.set(link.subscription_id, existing);
  }
  const vehicleDisplay = (subscriptionId: string) => monthlySubscriptionVehicleDisplay(linksBySubscription.get(subscriptionId) ?? [], vehicleMap);

  const q = (query.q ?? "").trim().toLowerCase();
  const filtered = (rows ?? []).filter((row) => {
    const name = customerMap.get(row.customer_id ?? "") ?? "Cliente";
    return (!query.status || row.status === query.status) && (!q || `${name} ${vehicleDisplay(row.id)} ${row.plan_name}`.toLowerCase().includes(q));
  });

  const allRows = rows ?? [];
  const allPeriods = periods ?? [];
  const contractCount = allRows.length;
  const activeRows = allRows.filter((row) => row.status === "ACTIVE");
  const activeMrr = activeRows.reduce((sum, row) => sum + Number(row.contracted_price ?? 0), 0);
  const pendingActivation = allRows.filter((row) => row.status === "PENDING_ACTIVATION").length;
  const suspended = allRows.filter((row) => row.status === "SUSPENDED").length;
  const today = bahiaDate();
  const inThreeDays = shiftIsoDay(today, 3);
  const thirtyDaysAgo = shiftIsoDay(today, -30);
  const latestPeriodBySubscription = new Map<string, (typeof allPeriods)[number]>();
  for (const period of allPeriods) if (!latestPeriodBySubscription.has(period.subscription_id)) latestPeriodBySubscription.set(period.subscription_id, period);
  const latestPeriods = [...latestPeriodBySubscription.values()];
  const dueSoon = latestPeriods.filter((p) => p.status === "PENDING" && p.due_date > today && p.due_date <= inThreeDays).length;
  const inGrace = latestPeriods.filter((p) => p.status === "PENDING" && p.due_date < today && p.grace_until >= today).length;
  const manualReview = latestPeriods.filter((p) => p.status === "MANUAL_REVIEW").length;
  const delinquentAmount = latestPeriods.filter((p) => p.status === "PENDING" && p.due_date < today).reduce((sum,p) => sum + Number(p.amount ?? 0),0);
  const healthy = activeRows.filter((row) => {
    const p = latestPeriodBySubscription.get(row.id);
    return !p || p.status === "PAID" || (p.status === "PENDING" && p.due_date >= today);
  }).length;
  const canceled30 = allRows.filter((row) => row.status === "CANCELED" && row.canceled_at && row.canceled_at.slice(0,10) >= thirtyDaysAgo).length;
  const churnDenominator = activeRows.length + canceled30;
  const churn30 = churnDenominator ? (canceled30 / churnDenominator) * 100 : 0;

  return (
    <DashboardShell nav={ceoNav} active="Mensalistas" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader title="Mensalistas" description={`${contractCount} ${contractCount === 1 ? "contrato cadastrado" : "contratos cadastrados"}. Gestão de planos, cobertura e cobranças mensais por unidade.`}>
          {canManage ? <Link href="/ceo/mensalistas/nova" className={primary}>Nova assinatura</Link> : null}
        </CeoPageHeader>
        <MonthlyTabs active="list" />

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="MRR ativo" value={money(activeMrr)} detail="Receita recorrente das assinaturas ativas" icon={<CircleDollarSign className="size-5" />} tone="emerald" />
          <MetricCard label="Saudáveis" value={String(healthy)} detail="Ativas sem atraso fora da regra" icon={<ShieldCheck className="size-5" />} tone="emerald" />
          <MetricCard label="Vencendo" value={String(dueSoon)} detail="Vencem nos próximos 3 dias" icon={<Clock3 className="size-5" />} tone="blue" />
          <MetricCard label="Em carência" value={String(inGrace)} detail="Vencidas, mas ainda cobertas" icon={<WalletCards className="size-5" />} tone="amber" />
          <MetricCard label="Suspensas" value={String(suspended)} detail="Cobertura bloqueada" icon={<AlertTriangle className="size-5" />} tone="amber" />
          <MetricCard label="Inadimplência" value={money(delinquentAmount)} detail="Valor pendente já vencido" icon={<CircleDollarSign className="size-5" />} tone="rose" />
          <MetricCard label="Churn 30 dias" value={`${churn30.toFixed(1)}%`} detail={`${canceled30} cancelamento(s) no período`} icon={<TrendingDown className="size-5" />} tone="slate" />
          <MetricCard label="Erro de cobrança" value={String(manualReview)} detail="Competências em revisão manual" icon={<FileSearch className="size-5" />} tone={manualReview ? "rose" : "slate"} />
        </section>

        {pendingActivation ? <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">{pendingActivation} assinatura(s) aguardando primeiro pagamento/autorização.</p> : null}

        <form className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row">
          <label className="min-w-0 flex-1"><span className="sr-only">Buscar assinatura</span><input name="q" defaultValue={query.q} placeholder="Buscar cliente, placa ou plano" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
          <select name="status" defaultValue={query.status} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500">
            <option value="">Todos os status</option><option value="PENDING_ACTIVATION">Aguardando ativação</option><option value="ACTIVE">Ativas</option><option value="SUSPENDED">Suspensas</option><option value="CANCELED">Canceladas</option><option value="ENDED">Encerradas</option>
          </select>
          <button className={primary}>Filtrar</button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-950">Assinaturas</h2><p className="mt-0.5 text-xs text-slate-500">{filtered.length} {filtered.length === 1 ? "resultado" : "resultados"} no filtro atual</p></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Cliente</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Veículos</th><th className="px-4 py-3">Mensalidade</th><th className="px-4 py-3">Início</th><th className="px-4 py-3">Situação</th><th className="px-5 py-3 text-right">Ação</th></tr></thead>
            <tbody>
              {filtered.map((row: any) => { const current = latestPeriodBySubscription.get(row.id); return <tr key={row.id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                <td className="px-5 py-4 font-semibold text-slate-950">{customerMap.get(row.customer_id) ?? "Cliente"}</td><td className="px-4 py-4 text-slate-600">{unitMap.get(row.unit_id) ?? "—"}</td><td className="px-4 py-4 text-slate-700">{row.plan_name}</td><td className="px-4 py-4 text-slate-600">{vehicleDisplay(row.id)}</td><td className="px-4 py-4 font-semibold text-slate-950">{money(row.contracted_price)}</td><td className="px-4 py-4 text-slate-600">{dateBR(row.starts_on)}</td>
                <td className="px-4 py-4"><StatusPill status={row.status} label={monthlyStatus[row.status] ?? row.status} />{current ? <p className="mt-1.5 text-xs text-slate-500">Cobrança: {monthlyStatus[current.status] ?? current.status}</p> : <p className="mt-1.5 text-xs text-slate-400">Sem cobrança gerada</p>}</td>
                <td className="px-5 py-4 text-right"><Link href={`/ceo/mensalistas/${row.id}`} className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">Abrir assinatura<ArrowUpRight className="size-4" /></Link></td>
              </tr>; })}
              {!filtered.length ? <tr><td colSpan={8} className="px-5 py-12 text-center"><p className="font-semibold text-slate-700">Nenhuma assinatura encontrada</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou crie uma nova assinatura quando houver cliente elegível.</p></td></tr> : null}
            </tbody>
          </table></div>
        </section>
      </div>
    </DashboardShell>
  );
}

function bahiaDate() { return new Intl.DateTimeFormat("en-CA", { timeZone:"America/Bahia", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date()); }
function shiftIsoDay(value:string,days:number) { const d=new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }

function MetricCard({ label,value,detail,icon,tone }: { label:string; value:string; detail:string; icon:React.ReactNode; tone:"emerald"|"blue"|"amber"|"slate"|"rose" }) {
  const palette={ emerald:"bg-emerald-50 text-emerald-600", blue:"bg-blue-50 text-blue-600", amber:"bg-amber-50 text-amber-600", slate:"bg-slate-100 text-slate-600", rose:"bg-rose-50 text-rose-600" }[tone];
  return <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">{value}</p></div><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${palette}`}>{icon}</span></div><p className="mt-1.5 text-xs leading-5 text-slate-500">{detail}</p></article>;
}
