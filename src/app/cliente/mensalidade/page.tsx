import { CustomerShell } from "@/components/customer-shell";
import { MonthlyPaymentActions } from "@/components/monthly-payment-actions";
import { MonthlyEnrollmentForm,type SelfServicePlan } from "@/components/customer-self-service-forms";
import { getCustomerData } from "@/lib/customer-data";
import { getPaymentAvailability, canUsePayment } from "@/lib/payments/payment-availability";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatPaymentMethod, formatPaymentStatus } from "@/lib/operator-format";
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase=await createClient();
  const[data,{data:planRows}]=await Promise.all([getCustomerData(),supabase.rpc("list_self_service_monthly_plans")]);
  const units=[...new Set(data.monthlyPeriods.map(period=>period.monthly_subscriptions?.unit_id).filter((id):id is string=>Boolean(id)))];
  const availabilityByUnit=Object.fromEntries(await Promise.all(units.map(async unitId=>[unitId,await getPaymentAvailability(unitId)])));
  const plans=(planRows??[]) as SelfServicePlan[];
  return (
    <CustomerShell name={data.profile.full_name} active="Mensalidade" unreadNotifications={data.unreadNotifications}>
      <div className="space-y-5">
        <div><h1 className="text-3xl font-bold">Minha mensalidade</h1><p className="text-sm text-slate-500">Competências e pagamentos vinculados exclusivamente à sua conta.</p></div>
        {!data.monthlyPeriods.length?<MonthlyEnrollmentForm plans={plans} vehicles={data.vehicles}/>:null}
        {data.monthlyPeriods.map((period) => {
          const paid = period.payments.find((p) => p.status === "PAID");
          const pending = period.payments.find((p) => p.status === "PENDING");
          const subscriptionStatus=period.monthly_subscriptions?.status ?? "";
          const coveredPlates=(period.monthly_subscriptions?.monthly_subscription_vehicles??[]).map((row)=>row.vehicles?.plate).filter((plate):plate is string=>Boolean(plate));
          const pendingLabel=pending?.method==="PIX"?"PIX":pending?.method==="CREDIT_CARD"||pending?.method==="CARD"?"cartão de crédito":"pagamento";
          return (
            <article key={period.id} className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">{period.monthly_subscriptions?.plan_name ?? "Plano mensal"}</h2><p className="text-sm text-slate-500">{period.monthly_subscriptions?.parking_units?.name ?? "Star Carvalhos"} · {String(period.reference_month).padStart(2, "0")}/{period.reference_year}</p><p className="mt-2 text-sm">Vencimento: {new Date(`${period.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</p>{subscriptionStatus==="ACTIVE"?<div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><b>Mensalidade ativa.</b>{coveredPlates.length?` Cobertura mensal ativa para ${coveredPlates.join(", ")}.`:" A cobertura mensal está ativa."}</div>:subscriptionStatus==="PENDING_ACTIVATION"?<div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Aguardando confirmação do primeiro pagamento para ativar a cobertura mensal.</div>:null}</div><div className="text-right"><b className="text-2xl">{formatMoney(period.amount)}</b><p className="text-sm font-semibold">{period.status === "PAID" ? "Pago" : pending ? `Processando via ${pendingLabel}` : new Date(period.due_date) < new Date() ? "Vencido" : "Aguardando"}</p></div></div>
              {period.status === "PENDING" ? <MonthlyPaymentActions billingPeriodId={period.id} pendingMethod={pending?.method ?? null} pixEnabled={canUsePayment(availabilityByUnit[period.monthly_subscriptions?.unit_id ?? ""] ?? [],"PIX","QR","ASAAS")} creditEnabled={canUsePayment(availabilityByUnit[period.monthly_subscriptions?.unit_id ?? ""] ?? [],"CREDIT_CARD","HOSTED_CHECKOUT","ASAAS")} /> : null}
              {paid ? <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{formatPaymentMethod(paid.method)} · {formatPaymentStatus(paid.status)} · {formatDateTime(paid.paid_at ?? paid.created_at)}</div> : pending ? <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Pagamento iniciado via <b>{pendingLabel}</b>. Continue a mesma cobrança acima. Se o provider confirmar expiração ou cancelamento, esta cobrança deixa de ficar pendente e PIX/Crédito voltam a ser liberados automaticamente.</div> : null}
            </article>
          );
        })}
        {!data.monthlyPeriods.length&&!plans.length ? <p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Nenhuma competência vinculada à sua conta.</p> : null}
      </div>
    </CustomerShell>
  );
}
