import Link from "next/link";
import { Bell, Clock3 } from "lucide-react";
import { CustomerShell } from "@/components/customer-shell";
import { TariffAlertPreferenceForm } from "@/components/tariff-alert-preference-form";
import { getCustomerData } from "@/lib/customer-data";
import { formatDateTime } from "@/lib/operator-format";
import { markAllNotificationsRead, markNotificationRead } from "./actions";
export const dynamic = "force-dynamic";
export default async function Page() {
  const data = await getCustomerData();
  return (
    <CustomerShell
      name={data.profile.full_name}
      active="Notificações"
      unreadNotifications={data.unreadNotifications}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Notificações</h1>
            <p className="text-sm text-slate-500">Alertas internos vinculados exclusivamente à sua conta.</p>
          </div>
          {data.unreadNotifications ? <form action={markAllNotificationsRead}><button className="min-h-11 rounded-xl border bg-white px-4 text-sm font-bold text-blue-600">Marcar todas como lidas</button></form> : null}
        </div>

        <section className="rounded-2xl border bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 size-5 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">Avisar antes do aumento da tarifa</h2>
              <p className="mt-1 text-sm text-slate-500">Escolha com quanto tempo de antecedência você quer receber o alerta interno da próxima mudança de valor.</p>
              <TariffAlertPreferenceForm initialMinutes={data.profile.tariff_alert_minutes}/>
              <p className="mt-2 text-xs text-slate-500">A opção selecionada fica destacada imediatamente e, depois de salvar, passa a valer nos próximos alertas internos.</p>
            </div>
          </div>
        </section>

        <section className="max-h-[calc(100dvh-14rem)] space-y-3 overflow-y-auto overscroll-contain pb-4">
          {data.notifications.map((item) => <article key={item.id} className={`rounded-2xl border p-4 ${item.read_at ? "bg-white" : "border-blue-200 bg-blue-50"}`}><div className="flex gap-3"><Bell className="mt-1 size-5 shrink-0 text-blue-600"/><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{item.title}</h2><time className="text-xs text-slate-500">{formatDateTime(item.created_at)}</time></div><p className="mt-1 break-words text-sm text-slate-700">{item.message}</p><div className="mt-3 flex flex-wrap gap-3">{item.internal_link?<Link href={item.internal_link} className="text-sm font-bold text-blue-600">Abrir</Link>:null}{!item.read_at?<form action={markNotificationRead}><input type="hidden" name="notificationId" value={item.id}/><button className="text-sm font-semibold text-slate-600">Marcar como lida</button></form>:null}</div></div></div></article>)}
          {!data.notifications.length ? <div className="grid min-h-56 place-items-center rounded-3xl border border-dashed bg-white p-8 text-center"><div><Bell className="mx-auto size-9 text-slate-400"/><h2 className="mt-4 font-bold">Nenhuma notificação por enquanto.</h2></div></div> : null}
        </section>
      </div>
    </CustomerShell>
  );
}
