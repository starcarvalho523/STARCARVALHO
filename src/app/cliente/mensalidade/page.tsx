import { CustomerShell } from "@/components/customer-shell";
import { MonthlyPaymentActions } from "@/components/monthly-payment-actions";
import { MonthlyEnrollmentForm,type SelfServicePlan } from "@/components/customer-self-service-forms";
import { getCustomerData } from "@/lib/customer-data";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney, formatPaymentMethod, formatPaymentStatus } from "@/lib/operator-format";
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase=await createClient();
  const[data,{data:planRows}]=await Promise.all([getCustomerData(),supabase.rpc("list_self_service_monthly_plans")]);
  const plans=(planRows??[]) as SelfServicePlan[];
  return (
    <CustomerShell name={data.profile.full_name} active="Mensalidade" unreadNotifications={data.unreadNotifications}>
      <div className="space-y-5">
        <div><h1 className="text-3xl font-bold">Minha mensalidade</h1><p className="text-sm text-slate-500">Competências e pagamentos vinculados exclusivamente à sua conta.</p></div>
        {!data.monthlyPeriods.length?<MonthlyEnrollmentForm plans={plans} vehicles={data.vehicles}/>:null}
        {data.monthlyPeriods.map((period) => {
          const paid = period.payments.find((p) => p.status === "PAID");
          const pending = period.payments.find((p) => p.status === "PENDING");
          return (
            <article key={period.id} className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">{period.monthly_subscriptions?.plan_name ?? "Plano mensal"}</h2><p className="text-sm text-slate-500">{period.monthly_subscriptions?.parking_units?.name ?? "Star Carvalhos"} · {String(period.reference_month).padStart(2, "0")}/{period.reference_year}</p><p className="mt-2 text-sm">Vencimento: {new Date(`${period.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</p></div><div className="text-right"><b className="text-2xl">{formatMoney(period.amount)}</b><p className="text-sm font-semibold">{period.status === "PAID" ? "Pago" : pending ? "Processando" : new Date(period.due_date) < new Date() ? "Vencido" : "Aguardando"}</p></div></div>
              {period.status === "PENDING" ? <MonthlyPaymentActions billingPeriodId={period.id} pendingMethod={pending?.method ?? null} /> : null}
              {paid ? <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{formatPaymentMethod(paid.method)} · {formatPaymentStatus(paid.status)} · {formatDateTime(paid.paid_at ?? paid.created_at)}</div> : pending ? <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Cobrança em processamento. Use a opção acima para continuar exatamente o mesmo pagamento; outro método fica bloqueado enquanto esta cobrança estiver pendente.</div> : null}
            </article>
          );
        })}
        {!data.monthlyPeriods.length&&!plans.length ? <p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Nenhuma competência vinculada à sua conta.</p> : null}
      </div>
    </CustomerShell>
  );
}
