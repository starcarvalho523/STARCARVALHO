import Link from "next/link";
import { ArrowUpRight, CarFront, CircleCheckBig, Search, UsersRound, WalletCards } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ceoNav } from "@/lib/ceo-nav";
import { requireCeoScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { type CeoCustomerRow, formatDateTime, monthlyLabel } from "@/lib/ceo-customers";
import { ShareRegistrationButton } from "./share-registration-button";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; unit?: string; type?: string; status?: string }>;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireCeoScope("admin");
  const supabase = await createClient();
  const params = await searchParams;
  const { data, error } = await supabase.rpc("get_ceo_customer_directory");
  const customers = (Array.isArray(data) ? data : []) as CeoCustomerRow[];
  const query = (params.q ?? "").trim().toLocaleLowerCase("pt-BR");
  const unitFilter = params.unit ?? "all";
  const typeFilter = params.type ?? "all";
  const statusFilter = params.status ?? "all";
  const units = Array.from(new Map(customers.flatMap((customer) => customer.units).map((unit) => [unit.id, unit])).values()).sort((a, b) => a.name.localeCompare(b.name));
  const filtered = customers.filter((customer) => {
    const matchesQuery = !query || [customer.full_name, customer.email ?? "", ...customer.units.map((unit) => unit.name)].join(" ").toLocaleLowerCase("pt-BR").includes(query);
    const matchesUnit = unitFilter === "all" || customer.units.some((unit) => unit.id === unitFilter);
    const matchesType = typeFilter === "all" || (typeFilter === "monthly" ? Boolean(customer.monthly_status) : !customer.monthly_status);
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? customer.is_active : statusFilter === "inactive" ? !customer.is_active : customer.has_active_session);
    return matchesQuery && matchesUnit && matchesType && matchesStatus;
  });
  const active = customers.filter((customer) => customer.is_active).length;
  const withVehicles = customers.filter((customer) => customer.vehicle_count > 0).length;
  const monthly = customers.filter((customer) => customer.monthly_status && customer.monthly_status !== "CANCELED").length;
  const inYard = customers.filter((customer) => customer.has_active_session).length;

  return (
    <DashboardShell nav={ceoNav} active="Clientes" role="CEO">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Clientes</h1><p className="mt-1 text-sm text-slate-500">Base administrativa derivada de vínculos reais com veículos, passagens e mensalidades das suas unidades.</p></div>
          <ShareRegistrationButton />
        </div>
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">Não foi possível carregar a base de clientes neste ambiente.</div> : null}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi icon={UsersRound} label="Clientes ativos" value={active} tone="blue" /><Kpi icon={CarFront} label="Com veículos" value={withVehicles} tone="slate" /><Kpi icon={WalletCards} label="Mensalistas" value={monthly} tone="violet" /><Kpi icon={CircleCheckBig} label="Com sessão ativa" value={inYard} tone="emerald" /></section>
        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_220px_190px_190px_auto]" action="/ceo/clientes">
          <label className="relative block"><Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input name="q" defaultValue={params.q ?? ""} placeholder="Buscar cliente, e-mail ou unidade" className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none focus:border-blue-400" /></label>
          <select name="unit" defaultValue={unitFilter} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-400"><option value="all">Todas as unidades</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
          <select name="type" defaultValue={typeFilter} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-400"><option value="all">Todos os tipos</option><option value="monthly">Mensalistas</option><option value="casual">Avulsos</option></select>
          <select name="status" defaultValue={statusFilter} className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-400"><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="yard">No pátio agora</option></select>
          <button className="h-12 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-sm hover:bg-blue-700">Filtrar</button>
        </form>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-extrabold text-slate-950">Base de clientes</h2><p className="mt-1 text-sm text-slate-500">{filtered.length === 1 ? "1 cliente encontrado" : `${filtered.length} clientes encontrados`}</p></div>
          <div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Unidade</th><th className="px-5 py-3">Veículos</th><th className="px-5 py-3">Última passagem</th><th className="px-5 py-3">Mensalidade</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((customer) => <tr key={customer.customer_id} className="align-middle"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 font-bold text-blue-600">{initials(customer.full_name)}</span><div><p className="font-bold text-slate-950">{customer.full_name}</p>{customer.email ? <p className="mt-0.5 text-xs text-slate-500">{customer.email}</p> : null}</div></div></td><td className="px-5 py-4 text-slate-600">{customer.units[0]?.name ?? "—"}{customer.units.length > 1 ? ` +${customer.units.length - 1}` : ""}</td><td className="px-5 py-4"><span className="font-bold text-slate-900">{customer.vehicle_count}</span><span className="text-slate-500"> {customer.vehicle_count === 1 ? "veículo" : "veículos"}</span></td><td className="px-5 py-4 text-slate-600">{customer.last_visit_at ? formatDateTime(customer.last_visit_at) : "Sem passagem"}</td><td className="px-5 py-4"><span className={monthlyBadge(customer.monthly_status)}>{monthlyLabel(customer.monthly_status)}</span>{customer.monthly_plan ? <p className="mt-1 max-w-[180px] truncate text-xs text-slate-500">{customer.monthly_plan}</p> : null}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-1.5">{customer.has_active_session ? <Badge label="No pátio" tone="blue" /> : null}{customer.eligible_for_monthly && !customer.monthly_status ? <Badge label="Elegível para mensalista" tone="emerald" /> : null}{!customer.is_active ? <Badge label="Cadastro inativo" tone="slate" /> : null}{customer.is_active && !customer.has_active_session && !(customer.eligible_for_monthly && !customer.monthly_status) ? <Badge label="Ativo" tone="emerald" /> : null}</div></td><td className="px-5 py-4 text-right"><Link href={`/ceo/clientes/${customer.customer_id}`} className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700">Abrir cliente <ArrowUpRight className="size-4" /></Link></td></tr>)}</tbody></table></div>
          {!filtered.length ? <div className="px-6 py-14 text-center"><p className="font-bold text-slate-900">Nenhum cliente encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou aguarde uma relação operacional real com a unidade.</p></div> : null}
        </section>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800"><strong>Origem segura:</strong> o cliente cria a própria conta pelo cadastro público. Ele só aparece aqui depois de possuir passagem ou mensalidade relacionada a uma unidade que você administra.</div>
      </div>
    </DashboardShell>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof UsersRound; label: string; value: number; tone: "blue" | "slate" | "violet" | "emerald" }) { const tones={blue:"bg-blue-50 text-blue-600",slate:"bg-slate-100 text-slate-600",violet:"bg-violet-50 text-violet-600",emerald:"bg-emerald-50 text-emerald-600"}; return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p></div></div></article>; }
function Badge({ label, tone }: { label: string; tone: "blue" | "emerald" | "slate" }) { const tones={blue:"bg-blue-50 text-blue-700",emerald:"bg-emerald-50 text-emerald-700",slate:"bg-slate-100 text-slate-600"}; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{label}</span>; }
function monthlyBadge(status:string|null){const tone=status==="ACTIVE"?"bg-emerald-50 text-emerald-700":status==="PENDING_ACTIVATION"?"bg-blue-50 text-blue-700":status==="SUSPENDED"?"bg-amber-50 text-amber-700":status==="CANCELED"?"bg-slate-100 text-slate-600":"bg-slate-50 text-slate-600";return `inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`;}
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]?.toUpperCase()).join("")||"C";}
