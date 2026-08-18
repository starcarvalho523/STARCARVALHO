import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CarFront, CircleCheckBig, Clock3, CreditCard, UserRound, WalletCards } from "lucide-react";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ceoNav } from "@/lib/ceo-nav";
import { requireCeoScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { type CeoCustomerDetail, formatDate, formatDateTime, formatMoney, methodLabel, monthlyLabel, paymentLabel, sessionLabel, vehicleLabel } from "@/lib/ceo-customers";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCeoScope("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_ceo_customer_detail", { p_customer_id: id });
  if (error || !data) notFound();
  const detail = data as CeoCustomerDetail;
  const { profile, vehicles, sessions, payments, subscriptions, billing_periods: billingPeriods } = detail;
  const currentSubscription = subscriptions.find((item) => item.status === "ACTIVE") ?? subscriptions.find((item) => item.status === "PENDING_ACTIVATION") ?? subscriptions[0] ?? null;
  const lastBilling = currentSubscription ? billingPeriods.find((item) => item.subscription_id === currentSubscription.id) ?? null : null;
  const activeSessions = sessions.filter((session) => ["OPEN", "PAYMENT_PENDING", "PAID"].includes(session.status)).length;
  const eligibilityLabel = currentSubscription
    ? currentSubscription.status === "PENDING_ACTIVATION"
      ? "Assinatura em ativação"
      : currentSubscription.status === "ACTIVE"
        ? "Já possui assinatura"
        : currentSubscription.status === "SUSPENDED"
          ? "Assinatura suspensa"
          : "Já possui assinatura"
    : detail.eligible_for_monthly
      ? "Pronto para mensalista"
      : "Ainda não elegível";

  return (
    <DashboardShell nav={ceoNav} active="Clientes" role="CEO">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-lg font-extrabold text-blue-600">{initials(profile.full_name)}</span>
            <div><p className="text-sm font-semibold text-blue-600">Detalhes do cliente</p><h1 className="mt-0.5 text-3xl font-extrabold tracking-tight text-slate-950">{profile.full_name}</h1>{profile.email ? <p className="mt-1 text-sm text-slate-500">{profile.email}</p> : null}</div>
          </div>
          <Link href="/ceo/clientes" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><ArrowLeft className="size-4" /> Voltar para Clientes</Link>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Summary icon={CarFront} label="Veículos relacionados" value={String(vehicles.length)} />
          <Summary icon={Clock3} label="Passagens registradas" value={String(sessions.length)} />
          <Summary icon={WalletCards} label="Mensalidade" value={monthlyLabel(currentSubscription?.status ?? null)} />
          <Summary icon={CircleCheckBig} label="Elegibilidade" value={eligibilityLabel} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-extrabold text-slate-950">Resumo administrativo</h2><p className="mt-1 text-sm text-slate-500">Identidade e relacionamento operacional, sem acessar o painel pessoal do cliente.</p></div>
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
            <Info icon={UserRound} label="Status do cadastro" value={profile.is_active ? "Ativo" : "Inativo"} />
            <Info icon={Clock3} label="Cliente desde" value={formatDate(profile.created_at)} />
            <Info icon={CarFront} label="No pátio agora" value={activeSessions ? `${activeSessions} sessão${activeSessions === 1 ? "" : "ões"}` : "Nenhuma sessão"} />
            <Info icon={WalletCards} label="Perfil operacional" value={currentSubscription ? "Mensalista" : "Avulso"} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-extrabold text-slate-950">Veículos</h2><p className="mt-1 text-sm text-slate-500">Somente veículos com relação comprovada às unidades autorizadas.</p></div>
            {detail.eligible_for_monthly && !currentSubscription ? <Link href="/ceo/mensalistas/nova" className="inline-flex items-center gap-1 text-sm font-bold text-blue-600">Criar assinatura <ArrowUpRight className="size-4" /></Link> : null}
          </div>
          {vehicles.length ? <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{vehicles.map((vehicle) => <article key={vehicle.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{vehicleLabel(vehicle.vehicle_type)}</p><p className="mt-1 text-xl font-extrabold text-slate-950">{vehicle.plate}</p></div>{vehicle.has_active_session ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">No pátio</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Fora do pátio</span>}</div><p className="mt-4 text-xs text-slate-500">Última passagem</p><p className="mt-1 text-sm font-semibold text-slate-800">{vehicle.last_visit_at ? formatDateTime(vehicle.last_visit_at) : "Sem registro recente"}</p></article>)}</div> : <Empty text="Nenhum veículo relacionado a esta unidade." />}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-extrabold text-slate-950">Mensalidade</h2><p className="mt-1 text-sm text-slate-500">Contrato e cobrança mensal derivados do módulo Mensalistas.</p></div>
          {currentSubscription ? <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl bg-slate-50 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{currentSubscription.unit_name}</p><h3 className="mt-1 text-xl font-extrabold text-slate-950">{currentSubscription.plan_name}</h3></div><span className={subscriptionBadge(currentSubscription.status)}>{monthlyLabel(currentSubscription.status)}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Valor contratado" value={formatMoney(currentSubscription.contracted_price)} /><Mini label="Vencimento" value={currentSubscription.due_day ? `Dia ${currentSubscription.due_day}` : "—"} /><Mini label="Tolerância" value={`${currentSubscription.grace_days ?? 0} dias`} /></div></div>
            <div className="rounded-2xl border border-slate-200 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cobrança mais recente</p>{lastBilling ? <><p className="mt-2 text-lg font-extrabold text-slate-950">{String(lastBilling.reference_month).padStart(2,"0")}/{lastBilling.reference_year}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Mini label="Status" value={paymentLabel(lastBilling.status)} /><Mini label="Valor" value={formatMoney(lastBilling.amount)} /><Mini label="Vencimento" value={formatDate(lastBilling.due_date)} /><Mini label="Fim da tolerância" value={formatDate(lastBilling.grace_until)} /></div></> : <p className="mt-3 text-sm text-slate-500">Nenhuma cobrança mensal registrada.</p>}</div>
          </div> : <div className="p-5"><div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"><p className="font-bold text-slate-900">Cliente sem assinatura mensal</p><p className="mt-1 text-sm text-slate-500">{detail.eligible_for_monthly ? "Possui veículo e passagem registrada; já atende aos requisitos operacionais para uma nova assinatura." : "A elegibilidade depende de cadastro ativo, veículo vinculado e passagem registrada na unidade."}</p>{detail.eligible_for_monthly ? <Link href="/ceo/mensalistas/nova" className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">Ir para nova assinatura</Link> : null}</div></div>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-extrabold text-slate-950">Histórico de estadias</h2><p className="mt-1 text-sm text-slate-500">Até 100 passagens recentes nas unidades que você administra.</p></div>
          {sessions.length ? <div className="overflow-x-auto"><table className="min-w-[950px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Entrada</th><th className="px-5 py-3">Saída</th><th className="px-5 py-3">Unidade</th><th className="px-5 py-3">Placa</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3">Pagamento</th><th className="px-5 py-3">Valor final</th><th className="px-5 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-100">{sessions.map((session) => <tr key={session.id}><td className="px-5 py-4">{formatDateTime(session.entered_at)}</td><td className="px-5 py-4 text-slate-600">{session.exited_at ? formatDateTime(session.exited_at) : "Ainda no pátio"}</td><td className="px-5 py-4 text-slate-600">{session.unit_name}</td><td className="px-5 py-4 font-bold text-slate-900">{session.plate}</td><td className="px-5 py-4">{sessionLabel(session.status)}</td><td className="px-5 py-4">{paymentLabel(session.payment_status)}</td><td className="px-5 py-4 font-bold text-slate-900">{formatMoney(session.final_amount)}</td><td className="px-5 py-4 text-right"><Link href={`/ceo/sessoes/${session.id}`} className="font-bold text-blue-600">Ver sessão</Link></td></tr>)}</tbody></table></div> : <Empty text="Nenhuma passagem registrada." />}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-extrabold text-slate-950">Pagamentos</h2><p className="mt-1 text-sm text-slate-500">Pagamentos de estacionamento e mensalidade relacionados às unidades autorizadas.</p></div>
          {payments.length ? <div className="overflow-x-auto"><table className="min-w-[850px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Origem</th><th className="px-5 py-3">Método</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Provedor</th></tr></thead><tbody className="divide-y divide-slate-100">{payments.map((payment) => <tr key={payment.id}><td className="px-5 py-4">{formatDateTime(payment.paid_at ?? payment.created_at)}</td><td className="px-5 py-4">{payment.payment_subject_type === "MONTHLY_BILLING" ? "Mensalidade" : "Estacionamento"}</td><td className="px-5 py-4">{methodLabel(payment.method)}</td><td className="px-5 py-4">{paymentLabel(payment.status)}</td><td className="px-5 py-4 font-bold text-slate-900">{formatMoney(payment.amount)}</td><td className="px-5 py-4 text-slate-600">{payment.provider ?? "Interno"}</td></tr>)}</tbody></table></div> : <Empty text="Nenhum pagamento registrado." />}
        </section>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800"><strong>Privacidade preservada:</strong> esta visão contém somente dados relacionados às unidades administradas e não permite assumir a sessão pessoal do cliente.</div>
      </div>
    </DashboardShell>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof CarFront; label: string; value: string }) { return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="size-4.5" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-extrabold text-slate-950">{value}</p></div></div></article>; }
function Info({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) { return <div className="flex gap-3 bg-white p-5"><Icon className="mt-0.5 size-4 shrink-0 text-slate-400"/><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-950">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="px-6 py-10 text-center text-sm text-slate-500">{text}</div>; }
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]?.toUpperCase()).join("")||"C";}
function subscriptionBadge(status:string){const tone=status==="ACTIVE"?"bg-emerald-50 text-emerald-700":status==="PENDING_ACTIVATION"?"bg-blue-50 text-blue-700":status==="SUSPENDED"?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-600";return `rounded-full px-2.5 py-1 text-xs font-bold ${tone}`;}
