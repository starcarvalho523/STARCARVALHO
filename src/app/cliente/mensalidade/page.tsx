import { CalendarDays, CheckCircle2, Clock3, CreditCard, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { CustomerShell } from "@/components/customer-shell";
import { MonthlyPaymentActions } from "@/components/monthly-payment-actions";
import { MonthlyRenewalControls } from "@/components/monthly-renewal-controls";
import { MonthlyAutomaticChargeGuard } from "@/components/monthly-automatic-charge-guard";
import { MonthlyEnrollmentForm,type SelfServicePlan } from "@/components/customer-self-service-forms";
import { getCustomerData } from "@/lib/customer-data";
import { getPaymentAvailability, canUsePayment } from "@/lib/payments/payment-availability";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatPaymentMethod, formatPaymentStatus } from "@/lib/operator-format";
export const dynamic = "force-dynamic";

type BillingPhase="CURRENT"|"GRACE"|"OVERDUE";

export default async function Page() {
  const supabase=await createClient();
  const[data,{data:planRows}]=await Promise.all([getCustomerData(),supabase.rpc("list_self_service_monthly_plans")]);
  const units=[...new Set(data.monthlyPeriods.map(period=>period.monthly_subscriptions?.unit_id).filter((id):id is string=>Boolean(id)))];
  const availabilityByUnit=Object.fromEntries(await Promise.all(units.map(async unitId=>[unitId,await getPaymentAvailability(unitId)])));
  const plans=(planRows??[]) as SelfServicePlan[];

  const latestPaidCoverageBySubscription=new Map<string,string>();
  for(const period of data.monthlyPeriods){
    const subscriptionId=period.monthly_subscriptions?.id;
    if(!subscriptionId||period.status!=="PAID")continue;
    const current=latestPaidCoverageBySubscription.get(subscriptionId);
    if(!current||period.period_end>current)latestPaidCoverageBySubscription.set(subscriptionId,period.period_end);
  }

  const highlightedPeriod=data.monthlyPeriods.find(period=>period.status==="PENDING"&&period.monthly_subscriptions?.status==="ACTIVE")??null;
  const highlightedSubscription=highlightedPeriod?.monthly_subscriptions??null;
  const highlightedCoverage=highlightedSubscription?latestPaidCoverageBySubscription.get(highlightedSubscription.id)??null:null;
  const highlightedAutoRenew=Boolean(highlightedSubscription?.auto_renew&&!highlightedSubscription.cancel_at_period_end&&highlightedSubscription.renewal_provider==="ASAAS"&&(highlightedSubscription.preferred_payment_method==="CREDIT_CARD"||highlightedSubscription.preferred_payment_method==="CARD"));
  const highlightedCurrentCharge=highlightedPeriod?.due_date??null;
  const highlightedFollowingRenewal=highlightedPeriod?addDays(highlightedPeriod.due_date,30):null;

  return (
    <CustomerShell name={data.profile.full_name} active="Mensalidade" unreadNotifications={data.unreadNotifications}>
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold">Minha mensalidade</h1>
          <p className="text-sm text-slate-500">Cada pagamento corresponde a um ciclo de 30 dias corridos. A data de renovação acompanha esses ciclos.</p>
        </div>

        {highlightedPeriod&&highlightedSubscription&&highlightedCurrentCharge&&highlightedFollowingRenewal?
          <section className="space-y-4" aria-label="Resumo da mensalidade">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.08fr_0.72fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 font-bold text-slate-900"><CheckCircle2 className="size-5 text-emerald-600"/>Situação atual</div>
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-bold text-emerald-700">Cobertura ativa</p>
                  <p className="mt-1 text-sm text-slate-700">Sua mensalidade atual está paga.</p>
                </div>
                <div className="mt-4 flex items-start gap-3 text-sm">
                  <CalendarDays className="mt-0.5 size-5 text-slate-500"/>
                  <div><p className="text-slate-500">Cobertura atual</p><p className="mt-1 text-lg font-extrabold text-emerald-600">{highlightedCoverage?`Até ${date(highlightedCoverage)}`:"Aguardando primeiro pagamento"}</p></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 font-bold text-slate-900"><CalendarDays className="size-5 text-blue-600"/>Próximo ciclo</div>
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-bold text-blue-700">Novo ciclo</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xl font-extrabold text-slate-950">{date(highlightedPeriod.period_start)} a {date(highlightedPeriod.period_end)}</p><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">30 dias</span></div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="flex gap-3"><CalendarDays className="mt-0.5 size-5 text-slate-500"/><div><p className="text-sm text-slate-500">Renovação seguinte</p><p className="mt-1 text-xl font-extrabold text-blue-600">{date(highlightedFollowingRenewal)}</p></div></div>
                  <div className="flex gap-3 sm:border-l sm:border-slate-200 sm:pl-4"><CreditCard className="mt-0.5 size-5 text-slate-500"/><div><p className="text-sm text-slate-500">Valor</p><p className="mt-1 text-xl font-extrabold text-slate-950">{formatMoney(highlightedPeriod.amount)}</p></div></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-bold text-slate-900"><Clock3 className="size-5 text-blue-600"/>Cobrança automática</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${highlightedAutoRenew?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{highlightedAutoRenew?"Ativa":"Desativada"}</span></div>
                <p className="mt-5 text-sm text-slate-600">{highlightedAutoRenew?"Sua renovação automática no cartão está ativa.":"A renovação automática não está ativa para este ciclo."}</p>
                <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-sm text-slate-500">Cobrança deste ciclo</p><p className="mt-1 flex items-center gap-2 text-lg font-extrabold text-blue-600"><CalendarDays className="size-5"/>{date(highlightedCurrentCharge)}</p></div>
                {highlightedAutoRenew?<div className="mt-5 border-t border-slate-100 pt-4"><p className="text-sm text-slate-500">Método</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><CreditCard className="size-4"/>Cartão de crédito</p></div>:null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-950">Entenda seu ciclo de 30 dias corridos</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <TimelinePoint tone="green" date={highlightedCoverage?date(highlightedCoverage):"—"} title="Cobertura atual" description="Último dia já coberto pelo ciclo pago."/>
                <TimelinePoint tone="blue" date={date(highlightedPeriod.period_start)} title="Início do novo ciclo" description="Começa a valer a nova cobertura de 30 dias."/>
                <TimelinePoint tone="blue" date={date(highlightedPeriod.period_end)} title="Fim da cobertura" description="Último dia coberto por este ciclo."/>
                <TimelinePoint tone="purple" date={date(highlightedFollowingRenewal)} title="Renovação seguinte" description="A cobrança do ciclo seguinte será nesta data."/>
              </div>
              <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="flex gap-3"><Info className="mt-0.5 size-5 shrink-0 text-blue-600"/><div><p className="font-bold text-blue-800">Por que a data muda?</p><p className="mt-1 text-sm leading-6 text-slate-700">Porque cada ciclo tem exatamente <b>30 dias corridos</b>, e não um mês-calendário. Este ciclo é cobrado em <b>{date(highlightedCurrentCharge)}</b>, cobre até <b>{date(highlightedPeriod.period_end)}</b> e a renovação seguinte acontece em <b>{date(highlightedFollowingRenewal)}</b>.</p></div></div>
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
              <SummaryStep icon={<CalendarDays className="size-5 text-blue-600"/>} title="1. Ciclo de 30 dias" text="Cada pagamento garante 30 dias corridos de cobertura."/>
              <SummaryStep icon={<RefreshCw className="size-5 text-blue-600"/>} title="2. Renovação automática" text="A próxima cobrança segue a contagem de 30 dias, mesmo quando o dia muda no calendário."/>
              <SummaryStep icon={<ShieldCheck className="size-5 text-blue-600"/>} title="3. Sem interrupções" text="Mantendo o pagamento em dia, a cobertura continua sem intervalos entre os ciclos."/>
            </div>
          </section>
        :null}

        {!data.monthlyPeriods.length?<MonthlyEnrollmentForm plans={plans} vehicles={data.vehicles}/>:null}
        {data.monthlyPeriods.map((period) => {
          const paid=period.payments.find((p)=>p.status==="PAID");
          const pending=period.payments.find((p)=>p.status==="PENDING");
          const subscription=period.monthly_subscriptions;
          const subscriptionStatus=subscription?.status??"";
          const coveredPlates=(subscription?.monthly_subscription_vehicles??[]).map((row)=>row.vehicles?.plate).filter((plate):plate is string=>Boolean(plate));
          const pendingLabel=pending?.method==="PIX"?"PIX":pending?.method==="CREDIT_CARD"||pending?.method==="CARD"?"cartão de crédito":"pagamento";
          const capabilities=availabilityByUnit[subscription?.unit_id??""]??[];
          const asaasPixEnabled=canUsePayment(capabilities,"PIX","QR","ASAAS");
          const latestPaidCoverage=subscription?latestPaidCoverageBySubscription.get(subscription.id)??null:null;
          const isLatestPaidPeriod=Boolean(period.status==="PAID"&&latestPaidCoverage&&period.period_end===latestPaidCoverage);
          const cardAutoRenewActive=Boolean(subscription?.auto_renew&&!subscription.cancel_at_period_end&&subscription.renewal_provider==="ASAAS"&&(subscription.preferred_payment_method==="CREDIT_CARD"||subscription.preferred_payment_method==="CARD"));
          const showCardRenewal=Boolean(isLatestPaidPeriod&&subscription&&(subscription.auto_renew||subscription.renewal_provider==="ASAAS"||subscription.cancel_at_period_end));
          const unitTimezone=period.parking_units?.timezone??subscription?.parking_units?.timezone??"America/Bahia";
          const phase=billingPhase(period.due_date,period.grace_until,unitTimezone);
          const statusLabel=period.status==="PAID"?"Pago":pending?`Processando via ${pendingLabel}`:cardAutoRenewActive?"Cobrança automática programada":subscriptionStatus==="SUSPENDED"?"Assinatura suspensa":phase==="GRACE"?"Em carência":phase==="OVERDUE"?"Vencida":subscriptionStatus==="ACTIVE"&&latestPaidCoverage?"Próximo ciclo":"Aguardando";

          return <article key={period.id} className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-bold">{subscription?.plan_name??"Plano mensal"}</h2>
                <p className="text-sm text-slate-500">{subscription?.parking_units?.name??"Star Carvalhos"} · ciclo de {date(period.period_start)} a {date(period.period_end)}</p>
                <p className="mt-2 text-sm">Data de cobrança do ciclo: {date(period.due_date)}</p>
                {subscriptionStatus==="ACTIVE"&&period.status==="PAID"?<div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><b>Ciclo ativo por 30 dias.</b>{coveredPlates.length?` Cobertura para ${coveredPlates.join(", ")} até ${date(period.period_end)}.`:` Cobertura válida até ${date(period.period_end)}.`}</div>:null}
                {period.status!=="PAID"&&subscriptionStatus==="SUSPENDED"?<div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>Assinatura suspensa por pendência.</b> Regularize este ciclo para que a reativação seja processada. Você ainda pode pagar pelos métodos disponíveis abaixo.</div>:null}
                {period.status!=="PAID"&&subscriptionStatus==="ACTIVE"&&latestPaidCoverage?(cardAutoRenewActive?<div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800"><b>Assinatura ativa.</b> Sua cobertura já paga vai até <b>{date(latestPaidCoverage)}</b>. A cobrança deste ciclo está programada para <b>{date(period.due_date)}</b>.</div>:phase==="GRACE"?<div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>Período de carência.</b> A cobrança venceu em {date(period.due_date)}. Regularize até <b>{date(period.grace_until)}</b> para evitar a suspensão da assinatura.</div>:phase==="OVERDUE"?<div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>Ciclo vencido.</b> A carência terminou em {date(period.grace_until)}. Regularize o pagamento para evitar ou remover restrições da assinatura.</div>:<div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800"><b>Assinatura ativa.</b> Sua cobertura já paga vai até <b>{date(latestPaidCoverage)}</b>. Este é o próximo ciclo de 30 dias e ainda aguarda pagamento.</div>):null}
                {subscriptionStatus==="PENDING_ACTIVATION"?<div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Aguardando confirmação do primeiro pagamento para iniciar a cobertura de 30 dias.</div>:null}
              </div>
              <div className="text-right"><b className="text-2xl">{formatMoney(period.amount)}</b><p className="text-sm font-semibold">{statusLabel}</p></div>
            </div>
            {period.status==="PENDING"?pending?<MonthlyPaymentActions billingPeriodId={period.id} pendingMethod={pending.method} pixEnabled={asaasPixEnabled} creditEnabled={canUsePayment(capabilities,"CREDIT_CARD","HOSTED_CHECKOUT","ASAAS")}/>:cardAutoRenewActive&&subscription?<MonthlyAutomaticChargeGuard subscriptionId={subscription.id} nextBillingDate={period.due_date}/>:<MonthlyPaymentActions billingPeriodId={period.id} pendingMethod={null} pixEnabled={asaasPixEnabled} creditEnabled={canUsePayment(capabilities,"CREDIT_CARD","HOSTED_CHECKOUT","ASAAS")}/>:null}
            {paid?<div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{formatPaymentMethod(paid.method)} · {formatPaymentStatus(paid.status)} · {formatDateTime(paid.paid_at??paid.created_at)}</div>:pending?<div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Pagamento iniciado via <b>{pendingLabel}</b>. Você pode continuar neste método ou escolher outro acima. Ao trocar, a tentativa anterior é encerrada automaticamente e deixa de ficar aberta em segundo plano.</div>:null}
            {showCardRenewal&&subscription?<MonthlyRenewalControls subscriptionId={subscription.id} autoRenew={subscription.auto_renew} nextBillingDate={subscription.next_billing_date} coverageUntil={latestPaidCoverage} cancelAtPeriodEnd={subscription.cancel_at_period_end}/>:null}
          </article>;
        })}
        {!data.monthlyPeriods.length&&!plans.length?<p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Nenhum ciclo vinculado à sua conta.</p>:null}
      </div>
    </CustomerShell>
  );
}

function TimelinePoint({tone,date:dateText,title,description}:{tone:"green"|"blue"|"purple";date:string;title:string;description:string}){const dot=tone==="green"?"bg-emerald-500":tone==="purple"?"bg-violet-500":"bg-blue-600";const text=tone==="green"?"text-emerald-700":tone==="purple"?"text-violet-700":"text-blue-700";return <div className="rounded-2xl bg-slate-50 p-4 text-center"><span className={`mx-auto block size-3 rounded-full ${dot}`}/><p className={`mt-3 font-extrabold ${text}`}>{dateText}</p><p className="mt-1 font-bold text-slate-950">{title}</p><p className="mt-2 text-sm leading-5 text-slate-500">{description}</p></div>}
function SummaryStep({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50">{icon}</span><div><p className="font-bold text-slate-900">{title}</p><p className="mt-1 text-sm leading-5 text-slate-500">{text}</p></div></div>}
function date(value:string){return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")}
function addDays(value:string,days:number){const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function dateKey(timeZone:string){try{const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const part=(type:string)=>parts.find(item=>item.type===type)?.value??"";return `${part("year")}-${part("month")}-${part("day")}`}catch{return new Date().toISOString().slice(0,10)}}
function billingPhase(dueDate:string,graceUntil:string,timeZone:string):BillingPhase{const today=dateKey(timeZone);if(today<=dueDate)return"CURRENT";if(today<=graceUntil)return"GRACE";return"OVERDUE"}
