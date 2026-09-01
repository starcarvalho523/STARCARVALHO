import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, CreditCard, History, Info, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
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
    <CustomerShell name={data.profile.full_name} active="Mensalidade" unreadNotifications={data.unreadNotifications} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Minha mensalidade</h1><ShieldCheck className="size-5 text-blue-600"/></div>
            <p className="mt-1 text-sm text-slate-500">Acompanhe sua cobertura, o próximo ciclo e as ações da sua assinatura.</p>
          </div>
          <Link href="/cliente/pagamentos" className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 sm:flex"><History className="size-4"/>Histórico de pagamentos</Link>
        </div>

        {highlightedPeriod&&highlightedSubscription&&highlightedCurrentCharge&&highlightedFollowingRenewal?
          <section className="space-y-3" aria-label="Resumo da mensalidade">
            <div className="grid gap-3 lg:grid-cols-[0.92fr_1.18fr_0.9fr]">
              <PremiumCard>
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-bold text-slate-900"><CheckCircle2 className="size-5 text-emerald-600"/>Situação atual</div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Ativa</span></div>
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.7)]">
                  <p className="text-lg font-extrabold text-emerald-700">Cobertura ativa</p>
                  <p className="mt-1 text-sm text-slate-600">Sua mensalidade atual está paga.</p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cobertura atual até</p><p className="mt-1 text-xl font-extrabold text-emerald-600">{highlightedCoverage?date(highlightedCoverage):"A confirmar"}</p></div>
                  <span className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CalendarDays className="size-5"/></span>
                </div>
              </PremiumCard>

              <PremiumCard accent>
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-bold text-slate-900"><CalendarDays className="size-5 text-blue-600"/>Próximo ciclo</div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">30 dias</span></div>
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Período de cobertura</p>
                  <p className="mt-1 text-xl font-extrabold tracking-tight text-blue-700 sm:text-2xl">{date(highlightedPeriod.period_start)} <span className="text-slate-300">→</span> {date(highlightedPeriod.period_end)}</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                  <MiniMetric label="Cobrança" value={date(highlightedCurrentCharge)}/>
                  <MiniMetric label="Renovação" value={date(highlightedFollowingRenewal)}/>
                  <MiniMetric label="Valor" value={formatMoney(highlightedPeriod.amount)}/>
                </div>
              </PremiumCard>

              <PremiumCard>
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-bold text-slate-900"><Clock3 className="size-5 text-violet-600"/>Cobrança automática</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${highlightedAutoRenew?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600"}`}>{highlightedAutoRenew?"Ativa":"Desativada"}</span></div>
                <p className="mt-3 text-sm leading-5 text-slate-600">{highlightedAutoRenew?"Seu cartão está configurado para renovar este ciclo automaticamente.":"A renovação automática está desligada para este ciclo."}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                  <MiniMetric label="Cobrança deste ciclo" value={date(highlightedCurrentCharge)}/>
                  <MiniMetric label="Método" value={highlightedAutoRenew?"Cartão":"Manual"}/>
                </div>
                <div className="mt-3 space-y-2">
                  {highlightedAutoRenew?<MonthlyAutomaticChargeGuard subscriptionId={highlightedSubscription.id} nextBillingDate={highlightedCurrentCharge} compact/>:<Link href="#billing-history" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 font-bold text-white shadow-[0_10px_24px_rgba(37,99,235,.22)]">Ver formas de pagamento<ArrowRight className="size-4"/></Link>}
                  <a href="#renewal-management" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"><Settings2 className="size-4"/>Gerenciar renovação</a>
                </div>
              </PremiumCard>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-950">Entenda seu ciclo de 30 dias</h2><p className="mt-0.5 text-xs text-slate-500">Cobertura contínua com datas que acompanham a contagem real de dias.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">30 dias corridos</span></div>
              <div className="relative mt-5 grid gap-3 md:grid-cols-4 md:gap-5 before:absolute before:left-[12%] before:right-[12%] before:top-3 before:hidden before:h-0.5 before:bg-gradient-to-r before:from-emerald-300 before:via-blue-400 before:to-violet-400 md:before:block">
                <TimelinePoint tone="green" date={highlightedCoverage?date(highlightedCoverage):"—"} title="Cobertura atual" description="Último dia já pago."/>
                <TimelinePoint tone="blue" date={date(highlightedCurrentCharge)} title="Cobrança deste ciclo" description="O novo ciclo começa aqui."/>
                <TimelinePoint tone="blue" date={`${date(highlightedPeriod.period_start)} a ${date(highlightedPeriod.period_end)}`} title="Cobertura do ciclo" description="30 dias completos de cobertura."/>
                <TimelinePoint tone="purple" date={date(highlightedFollowingRenewal)} title="Renovação seguinte" description="A próxima cobrança automática."/>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50/70 px-4 py-3 shadow-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm"><Info className="size-4"/></span>
              <div><p className="font-bold text-blue-950">Como funciona</p><p className="mt-0.5 text-sm leading-6 text-slate-700">Cada ciclo tem <b>30 dias corridos</b>. Este ciclo será cobrado em <b>{date(highlightedCurrentCharge)}</b>, cobre de <b>{date(highlightedPeriod.period_start)}</b> até <b>{date(highlightedPeriod.period_end)}</b> e renova novamente em <b>{date(highlightedFollowingRenewal)}</b>.</p></div>
            </div>
          </section>
        :null}

        {!data.monthlyPeriods.length?<MonthlyEnrollmentForm plans={plans} vehicles={data.vehicles}/>:null}
        <div id="billing-history" className="space-y-3 scroll-mt-28">
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
          const isHighlighted=highlightedPeriod?.id===period.id;

          return <article key={period.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition sm:p-5 ${isHighlighted?"border-blue-200 shadow-[0_12px_36px_rgba(37,99,235,.08)]":"border-slate-200"}`}>
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-extrabold text-slate-950">{subscription?.plan_name??"Plano mensal"}</h2>{isHighlighted?<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Próximo ciclo</span>:null}</div>
                <p className="mt-1 text-sm text-slate-500">{subscription?.parking_units?.name??"Star Carvalhos"} · {date(period.period_start)} a {date(period.period_end)}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm"><span><b className="text-slate-500">Cobrança:</b> {date(period.due_date)}</span><span><b className="text-slate-500">Status:</b> {statusLabel}</span></div>
                {subscriptionStatus==="ACTIVE"&&period.status==="PAID"?<div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><b>Ciclo pago.</b>{coveredPlates.length?` Cobertura para ${coveredPlates.join(", ")} até ${date(period.period_end)}.`:` Cobertura válida até ${date(period.period_end)}.`}</div>:null}
                {period.status!=="PAID"&&subscriptionStatus==="SUSPENDED"?<div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>Assinatura suspensa por pendência.</b> Regularize este ciclo para reativar a cobertura.</div>:null}
                {period.status!=="PAID"&&subscriptionStatus==="ACTIVE"&&latestPaidCoverage?(cardAutoRenewActive?<div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800"><b>Cobrança automática programada.</b> A cobrança deste ciclo está marcada para <b>{date(period.due_date)}</b>.</div>:phase==="GRACE"?<div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>Período de carência.</b> Regularize até <b>{date(period.grace_until)}</b>.</div>:phase==="OVERDUE"?<div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><b>Ciclo vencido.</b> Regularize o pagamento para remover restrições.</div>:<div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800"><b>Próximo ciclo.</b> Ainda aguarda pagamento.</div>):null}
                {subscriptionStatus==="PENDING_ACTIVATION"?<div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Aguardando confirmação do primeiro pagamento.</div>:null}
              </div>
              <div className="min-w-[180px] rounded-2xl bg-slate-50 px-4 py-3 text-right"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Valor do ciclo</p><b className="mt-1 block text-2xl font-extrabold text-slate-950">{formatMoney(period.amount)}</b><p className="mt-1 text-xs font-semibold text-slate-500">30 dias corridos</p></div>
            </div>
            {period.status==="PENDING"?pending?<MonthlyPaymentActions billingPeriodId={period.id} pendingMethod={pending.method} pixEnabled={asaasPixEnabled} creditEnabled={canUsePayment(capabilities,"CREDIT_CARD","HOSTED_CHECKOUT","ASAAS")}/>:cardAutoRenewActive&&subscription?(isHighlighted?null:<MonthlyAutomaticChargeGuard subscriptionId={subscription.id} nextBillingDate={period.due_date}/>):<MonthlyPaymentActions billingPeriodId={period.id} pendingMethod={null} pixEnabled={asaasPixEnabled} creditEnabled={canUsePayment(capabilities,"CREDIT_CARD","HOSTED_CHECKOUT","ASAAS")}/>:null}
            {paid?<div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{formatPaymentMethod(paid.method)} · {formatPaymentStatus(paid.status)} · {formatDateTime(paid.paid_at??paid.created_at)}</div>:pending?<div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Pagamento iniciado via <b>{pendingLabel}</b>. Ao trocar o método, a tentativa anterior é encerrada automaticamente.</div>:null}
            {showCardRenewal&&subscription?<div id="renewal-management" className="scroll-mt-28"><MonthlyRenewalControls subscriptionId={subscription.id} autoRenew={subscription.auto_renew} nextBillingDate={subscription.next_billing_date} coverageUntil={latestPaidCoverage} cancelAtPeriodEnd={subscription.cancel_at_period_end}/></div>:null}
          </article>;
        })}
        </div>
        {!data.monthlyPeriods.length&&!plans.length?<p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Nenhum ciclo vinculado à sua conta.</p>:null}
      </div>
    </CustomerShell>
  );
}

function PremiumCard({children,accent=false}:{children:React.ReactNode;accent?:boolean}){return <div className={`rounded-2xl border bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(15,23,42,.09)] sm:p-5 ${accent?"border-blue-200 ring-1 ring-blue-100":"border-slate-200"}`}>{children}</div>}
function MiniMetric({label,value}:{label:string;value:string}){return <div className="min-w-0"><p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-extrabold text-slate-900">{value}</p></div>}
function TimelinePoint({tone,date:dateText,title,description}:{tone:"green"|"blue"|"purple";date:string;title:string;description:string}){const dot=tone==="green"?"bg-emerald-500":tone==="purple"?"bg-violet-500":"bg-blue-600";const text=tone==="green"?"text-emerald-700":tone==="purple"?"text-violet-700":"text-blue-700";return <div className="relative z-10 rounded-xl bg-slate-50/90 px-3 py-3 text-center"><span className={`mx-auto block size-6 rounded-full border-4 border-white shadow-sm ${dot}`}/><p className={`mt-2 text-sm font-extrabold ${text}`}>{dateText}</p><p className="mt-0.5 text-sm font-bold text-slate-950">{title}</p><p className="mt-1 text-xs leading-4 text-slate-500">{description}</p></div>}
function date(value:string){return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")}
function addDays(value:string,days:number){const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function dateKey(timeZone:string){try{const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const part=(type:string)=>parts.find(item=>item.type===type)?.value??"";return `${part("year")}-${part("month")}-${part("day")}`}catch{return new Date().toISOString().slice(0,10)}}
function billingPhase(dueDate:string,graceUntil:string,timeZone:string):BillingPhase{const today=dateKey(timeZone);if(today<=dueDate)return"CURRENT";if(today<=graceUntil)return"GRACE";return"OVERDUE"}
