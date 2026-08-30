import { CustomerShell } from "@/components/customer-shell";
import { MonthlyPaymentActions } from "@/components/monthly-payment-actions";
import { MonthlyRenewalControls } from "@/components/monthly-renewal-controls";
import { MonthlyEnrollmentForm,type SelfServicePlan } from "@/components/customer-self-service-forms";
import { getCustomerData } from "@/lib/customer-data";
import { getPaymentAvailability, canUsePayment } from "@/lib/payments/payment-availability";
import { isAsaasPixAutomaticEnabled } from "@/lib/payments/asaas-pix-automatic-client";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatPaymentMethod, formatPaymentStatus } from "@/lib/operator-format";
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase=await createClient();
  const[data,{data:planRows}]=await Promise.all([getCustomerData(),supabase.rpc("list_self_service_monthly_plans")]);
  const units=[...new Set(data.monthlyPeriods.map(period=>period.monthly_subscriptions?.unit_id).filter((id):id is string=>Boolean(id)))];
  const availabilityByUnit=Object.fromEntries(await Promise.all(units.map(async unitId=>[unitId,await getPaymentAvailability(unitId)])));
  const plans=(planRows??[]) as SelfServicePlan[];
  const sandboxPreview=process.env.VERCEL_ENV==="preview"&&String(process.env.ASAAS_ENVIRONMENT??"").trim().toLowerCase()==="sandbox";
  const pixAutomaticFeatureEnabled=isAsaasPixAutomaticEnabled()||sandboxPreview;

  const latestPaidCoverageBySubscription=new Map<string,string>();
  for(const period of data.monthlyPeriods){
    const subscriptionId=period.monthly_subscriptions?.id;
    if(!subscriptionId||period.status!=="PAID")continue;
    const current=latestPaidCoverageBySubscription.get(subscriptionId);
    if(!current||period.period_end>current)latestPaidCoverageBySubscription.set(subscriptionId,period.period_end);
  }

  return (
    <CustomerShell name={data.profile.full_name} active="Mensalidade" unreadNotifications={data.unreadNotifications}>
      <div className="space-y-5">
        <div><h1 className="text-3xl font-bold">Minha mensalidade</h1><p className="text-sm text-slate-500">Competências e pagamentos vinculados exclusivamente à sua conta.</p></div>
        {!data.monthlyPeriods.length?<MonthlyEnrollmentForm plans={plans} vehicles={data.vehicles}/>:null}
        {data.monthlyPeriods.map((period) => {
          const paid = period.payments.find((p) => p.status === "PAID");
          const pending = period.payments.find((p) => p.status === "PENDING");
          const subscription=period.monthly_subscriptions;
          const subscriptionStatus=subscription?.status ?? "";
          const coveredPlates=(subscription?.monthly_subscription_vehicles??[]).map((row)=>row.vehicles?.plate).filter((plate):plate is string=>Boolean(plate));
          const pendingLabel=pending?.method==="PIX"?"PIX":pending?.method==="CREDIT_CARD"||pending?.method==="CARD"?"cartão de crédito":"pagamento";
          const capabilities=availabilityByUnit[subscription?.unit_id ?? ""] ?? [];
          const asaasPixEnabled=canUsePayment(capabilities,"PIX","QR","ASAAS");
          const paidByCard=paid?.method==="CREDIT_CARD"||paid?.method==="CARD";
          const latestPaidCoverage=subscription?latestPaidCoverageBySubscription.get(subscription.id)??null:null;
          const isLatestPaidPeriod=Boolean(period.status==="PAID"&&latestPaidCoverage&&period.period_end===latestPaidCoverage);
          const showCardRenewal=Boolean(isLatestPaidPeriod&&paidByCard&&subscription&&(subscription.auto_renew||subscription.renewal_provider==="ASAAS"||subscription.cancel_at_period_end));
          const statusLabel=period.status==="PAID"
            ? "Pago"
            : pending
              ? `Processando via ${pendingLabel}`
              : subscriptionStatus==="ACTIVE"&&latestPaidCoverage
                ? "Próxima mensalidade"
                : new Date(`${period.due_date}T23:59:59`) < new Date()
                  ? "Vencido"
                  : "Aguardando";

          return (
            <article key={period.id} className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-bold">{subscription?.plan_name ?? "Plano mensal"}</h2>
                  <p className="text-sm text-slate-500">{subscription?.parking_units?.name ?? "Star Carvalhos"} · {String(period.reference_month).padStart(2, "0")}/{period.reference_year}</p>
                  <p className="mt-2 text-sm">Vencimento: {date(period.due_date)}</p>
                  {subscriptionStatus==="ACTIVE"&&period.status==="PAID"?<div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><b>Mensalidade ativa.</b>{coveredPlates.length?` Cobertura deste período ativa para ${coveredPlates.join(", ")} até ${date(period.period_end)}.`:` Cobertura deste período válida até ${date(period.period_end)}.`}</div>:null}
                  {subscriptionStatus==="ACTIVE"&&period.status!=="PAID"&&latestPaidCoverage?<div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800"><b>Assinatura ativa.</b> Sua cobertura já paga vai até <b>{date(latestPaidCoverage)}</b>. Esta é a próxima mensalidade e ainda aguarda pagamento.</div>:null}
                  {subscriptionStatus==="PENDING_ACTIVATION"?<div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Aguardando confirmação do primeiro pagamento para ativar a cobertura mensal.</div>:null}
                </div>
                <div className="text-right"><b className="text-2xl">{formatMoney(period.amount)}</b><p className="text-sm font-semibold">{statusLabel}</p></div>
              </div>
              {period.status === "PENDING" ? <MonthlyPaymentActions billingPeriodId={period.id} pendingMethod={pending?.method ?? null} pixEnabled={asaasPixEnabled} pixAutomaticEnabled={asaasPixEnabled&&pixAutomaticFeatureEnabled} creditEnabled={canUsePayment(capabilities,"CREDIT_CARD","HOSTED_CHECKOUT","ASAAS")} /> : null}
              {paid ? <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{formatPaymentMethod(paid.method)} · {formatPaymentStatus(paid.status)} · {formatDateTime(paid.paid_at ?? paid.created_at)}</div> : pending ? <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Pagamento iniciado via <b>{pendingLabel}</b>. Você pode continuar neste método ou escolher outro acima. Ao trocar, a tentativa anterior é encerrada automaticamente e deixa de ficar aberta em segundo plano.</div> : null}
              {showCardRenewal&&subscription?<MonthlyRenewalControls subscriptionId={subscription.id} autoRenew={subscription.auto_renew} nextBillingDate={subscription.next_billing_date} coverageUntil={latestPaidCoverage} cancelAtPeriodEnd={subscription.cancel_at_period_end}/>:null}
            </article>
          );
        })}
        {!data.monthlyPeriods.length&&!plans.length ? <p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Nenhuma competência vinculada à sua conta.</p> : null}
      </div>
    </CustomerShell>
  );
}

function date(value:string){return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")}
