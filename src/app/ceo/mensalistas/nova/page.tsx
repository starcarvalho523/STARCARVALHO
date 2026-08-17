import Link from "next/link";
import { ArrowLeft, CarFront, CreditCard, ShieldCheck, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { ceoNav } from "@/lib/ceo-nav";
import { getMonthlyAccess, getScopedCustomers, money } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";
import { createSubscription } from "../actions";
import { field, Notice, primary, secondary } from "../ui";

export const dynamic = "force-dynamic";

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const note = await searchParams;
  const { manageableUnitIds } = await getMonthlyAccess();
  const supabase = await createClient();
  const [{ data: units }, { data: plans }, customers] = await Promise.all([
    supabase
      .from("parking_units")
      .select("id,name")
      .in("id", manageableUnitIds)
      .order("name"),
    supabase
      .from("monthly_plans")
      .select("id,unit_id,name,price,due_day_default,grace_days,max_vehicles")
      .in("unit_id", manageableUnitIds)
      .eq("enabled", true)
      .order("name"),
    getScopedCustomers(manageableUnitIds),
  ]);

  const unitMap = new Map((units ?? []).map((unit) => [unit.id, unit.name]));

  return (
    <DashboardShell nav={ceoNav} active="Mensalistas" role="CEO">
      <div className="mx-auto max-w-5xl space-y-4">
        <CeoPageHeader
          title="Nova assinatura"
          description="O plano é a fonte de verdade da unidade, preço e regras. O servidor congela essas condições no contrato."
        >
          <Link href="/ceo/mensalistas" className={secondary}>
            <ArrowLeft className="mr-2 size-4" />
            Voltar
          </Link>
        </CeoPageHeader>

        <Notice error={note.erro} />

        {!plans?.length ? (
          <EmptyState
            title="Nenhum plano ativo disponível"
            description="Crie e ative um plano antes de cadastrar uma assinatura. Contratos não podem existir sem uma oferta válida."
            primaryHref="/ceo/mensalistas/planos#novo-plano"
            primaryLabel="Criar plano"
          />
        ) : !customers.length ? (
          <EmptyState
            title="Nenhum cliente elegível encontrado"
            description="A elegibilidade continua restrita aos clientes já relacionados à operação desta unidade. Isso evita criar um cadastro administrativo paralelo e preserva a origem dos vínculos."
            primaryHref="/ceo/clientes"
            primaryLabel="Ir para Clientes"
            secondaryHref="/ceo/mensalistas"
            secondaryLabel="Voltar para Assinaturas"
          />
        ) : (
          <form action={createSubscription} className="space-y-4">
            <Step
              n="1"
              title="Escolha o plano"
              description="A unidade é derivada no servidor a partir do plano ativo selecionado."
              icon={<CreditCard className="size-5" />}
            >
              <div className="grid gap-3 md:grid-cols-2">
                {(plans ?? []).map((plan) => (
                  <label
                    key={plan.id}
                    className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:ring-2 has-[:checked]:ring-blue-100"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="planId"
                        value={plan.id}
                        required
                        className="mt-1 size-4 accent-blue-600"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                          {unitMap.get(plan.unit_id)}
                        </p>
                        <p className="mt-1 font-bold text-slate-950">{plan.name}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {money(plan.price)}/mês
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Vence dia {plan.due_day_default} · tolerância de {plan.grace_days} dia(s) · até{" "}
                          {plan.max_vehicles} veículo(s)
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </Step>

            <Step
              n="2"
              title="Cliente e veículo"
              description="O backend confirma que o veículo pertence ao cliente antes de criar o vínculo."
              icon={<UserRound className="size-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Label text="Cliente">
                  <select name="customerId" required className={field}>
                    <option value="">Selecione o cliente</option>
                    {customers.map((customer) => (
                      <option key={customer.user_id} value={customer.user_id}>
                        {customer.full_name}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label text="Veículo inicial">
                  <select name="vehicleId" className={field}>
                    <option value="">Vincular depois</option>
                    {customers.map((customer) => (
                      <optgroup key={customer.user_id} label={customer.full_name}>
                        {customer.vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.normalized_plate} ({vehicle.vehicle_type === "CAR" ? "Carro" : "Moto"})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Label>
              </div>
            </Step>

            <Step
              n="3"
              title="Início do contrato"
              description="A data civil define quando a assinatura passa a existir contratualmente."
              icon={<CarFront className="size-5" />}
            >
              <Label text="Data de início">
                <input
                  name="startsOn"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={field}
                />
              </Label>
            </Step>

            <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="font-bold text-emerald-950">Criação protegida pelo backend</p>
                  <p className="mt-1 text-sm leading-5 text-emerald-800">
                    Preço, vencimento e tolerância são copiados do plano. O navegador não define a unidade do contrato.
                  </p>
                </div>
              </div>
              <button className={`${primary} shrink-0`}>Criar assinatura</button>
            </section>
          </form>
        )}
      </div>
    </DashboardShell>
  );
}

function Step({
  n,
  title,
  description,
  icon,
  children,
}: {
  n: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          {icon}
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Etapa {n}</p>
          <h2 className="font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </fieldset>
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

function EmptyState({
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="max-w-2xl">
        <span className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <UserRound className="size-5" />
        </span>
        <h2 className="mt-5 text-xl font-bold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={primaryHref} className={primary}>
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link href={secondaryHref} className={secondary}>
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
