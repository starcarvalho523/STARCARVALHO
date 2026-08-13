import { CustomerShell } from "@/components/customer-shell";
import { MonthlyPaymentActions } from "@/components/monthly-payment-actions";
import { getCustomerData } from "@/lib/customer-data";
import { monthlyReminder } from "@/lib/monthly-automation";
import { formatDateTime, formatMoney, formatPaymentMethod, formatPaymentStatus } from "@/lib/operator-format";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getCustomerData();
  const today = new Date();
  return (
    <CustomerShell name={data.profile.full_name} active="Mensalidade">
      <div className="space-y-5">
        <div><h1 className="text-3xl font-bold">Minha mensalidade</h1><p className="text-sm text-slate-500">Compet\u00eancias e pagamentos vinculados exclusivamente \u00e0 sua conta.</p></div>
        {data.monthlyPeriods.map((period) => {
          const paid = period.payments.find((payment) => payment.status === "PAID");
          const pending = period.payments.find((payment) => payment.status === "PENDING");
          const reminder = period.status === "PENDING" ? monthlyReminder(period.due_date, period.grace_until, today) : null;
          return <article key={period.id} className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">{period.monthly_subscriptions?.plan_name ?? "Plano mensal"}</h2><p className="text-sm text-slate-500">{period.monthly_subscriptions?.parking_units?.name ?? "Star Carvalhos"} · {String(period.reference_month).padStart(2, "0")}/{period.reference_year}</p><p className="mt-2 text-sm">Vencimento: {new Date(`${period.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</p>{reminder ? <p className="mt-1 text-sm font-semibold text-amber-700">{reminder}</p> : null}</div><div className="text-right"><b className="text-2xl">{formatMoney(period.amount)}</b><p className="text-sm font-semibold">{period.status === "PAID" ? "Pago" : pending ? "Processando" : reminder ?? "Aguardando"}</p></div></div>
            {period.status === "PENDING" && !pending ? <MonthlyPaymentActions billingPeriodId={period.id} /> : null}
            {paid ? <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{formatPaymentMethod(paid.method)} · {formatPaymentStatus(paid.status)} · {formatDateTime(paid.paid_at ?? paid.created_at)}</div> : pending ? <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Cobran\u00e7a em processamento. N\u00e3o inicie outro m\u00e9todo.</div> : null}
          </article>;
        })}
        {!data.monthlyPeriods.length ? <p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Nenhuma compet\u00eancia vinculada \u00e0 sua conta. Quando houver uma compet\u00eancia vigente, ela aparecer\u00e1 aqui.</p> : null}
      </div>
    </CustomerShell>
  );
}
