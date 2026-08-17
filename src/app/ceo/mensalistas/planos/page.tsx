import Link from "next/link";
import { CircleDollarSign, Plus } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { getMonthlyAccess, money } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";
import { createPlan, togglePlan } from "../actions";
import { field, MonthlyTabs, Notice, primary, secondary } from "../ui";

export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  const note = await searchParams;
  const { unitIds, manageableUnitIds, canManage } = await getMonthlyAccess();
  const supabase = await createClient();
  const [{ data: units }, { data: plans }] = await Promise.all([
    supabase.from("parking_units").select("id,name").in("id", unitIds).order("name"),
    supabase.from("monthly_plans").select("*").in("unit_id", unitIds).order("created_at", {
      ascending: false,
    }),
  ]);
  const unitMap = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const activePlans = (plans ?? []).filter((plan) => plan.enabled).length;

  return (
    <DashboardShell nav={ceoNav} active="Mensalistas" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <CeoPageHeader
          title="Mensalistas"
          description="Gestão de contratos, planos e cobranças recorrentes."
        >
          {canManage ? (
            <Link href="#novo-plano" className={primary}>
              <Plus className="mr-2 size-4" />
              Novo plano
            </Link>
          ) : null}
        </CeoPageHeader>

        <MonthlyTabs active="plans" />
        <Notice error={note.erro} success={note.sucesso} />

        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Planos de mensalistas</h2>
              <p className="mt-1 text-sm text-slate-500">
                {plans?.length ?? 0} plano(s) cadastrado(s), {activePlans} ativo(s). Preços de contratos
                existentes permanecem congelados no backend.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {(plans ?? []).map((plan) => (
            <article
              key={plan.id}
              className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                    {unitMap.get(plan.unit_id)}
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">{plan.name}</h3>
                  <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">
                    {plan.description || "Sem descrição"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                    plan.enabled
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
                      : "bg-slate-100 text-slate-600 ring-slate-500/10"
                  }`}
                >
                  {plan.enabled ? "Ativo" : "Desativado"}
                </span>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <CircleDollarSign className="size-5" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-500">Mensalidade</p>
                    <p className="text-2xl font-extrabold tracking-tight text-slate-950">
                      {money(plan.price)}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Item label="Vencimento" value={`Dia ${plan.due_day_default}`} />
                <Item label="Tolerância" value={`${plan.grace_days} dias`} />
                <Item label="Veículos" value={`Até ${plan.max_vehicles}`} />
                <Item label="Situação" value={plan.enabled ? "Disponível para novos contratos" : "Fora de oferta"} />
              </dl>

              {manageableUnitIds.includes(plan.unit_id) ? (
                <form action={togglePlan} className="mt-auto pt-5">
                  <input type="hidden" name="unitId" value={plan.unit_id} />
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="enabled" value={String(!plan.enabled)} />
                  <button className={secondary}>
                    {plan.enabled ? "Desativar plano" : "Reativar plano"}
                  </button>
                </form>
              ) : null}
            </article>
          ))}
          {!plans?.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center lg:col-span-2 xl:col-span-3">
              <p className="font-semibold text-slate-700">Nenhum plano cadastrado</p>
              <p className="mt-1 text-sm text-slate-500">
                Crie o primeiro plano para habilitar novas assinaturas.
              </p>
            </div>
          ) : null}
        </div>

        {canManage ? (
          <section id="novo-plano" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">Criar novo plano</h2>
              <p className="mt-1 text-sm text-slate-500">
                Defina as condições comerciais que serão congeladas quando uma assinatura for criada.
              </p>
            </div>
            <form action={createPlan} className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              <Label text="Unidade">
                <select name="unitId" required className={field}>
                  {(units ?? [])
                    .filter((unit) => manageableUnitIds.includes(unit.id))
                    .map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                </select>
              </Label>
              <Label text="Nome">
                <input name="name" minLength={2} required className={field} />
              </Label>
              <Label text="Preço mensal">
                <input name="price" type="number" min="0.01" step="0.01" required className={field} />
              </Label>
              <Label text="Dia do vencimento">
                <input name="dueDay" type="number" min="1" max="31" defaultValue="10" required className={field} />
              </Label>
              <Label text="Dias de tolerância">
                <input name="graceDays" type="number" min="0" max="90" defaultValue="0" required className={field} />
              </Label>
              <Label text="Máximo de veículos">
                <input name="maxVehicles" type="number" min="1" max="100" defaultValue="1" required className={field} />
              </Label>
              <Label text="Descrição">
                <input name="description" className={field} />
              </Label>
              <div className="md:col-span-2 xl:col-span-2 xl:flex xl:items-end xl:justify-end">
                <button className={`${primary} w-full xl:w-auto`}>Criar plano</button>
              </div>
            </form>
          </section>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Seu perfil possui acesso somente para consulta.
          </p>
        )}
      </div>
    </DashboardShell>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-slate-700">
      <span>{text}</span>
      {children}
    </label>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
