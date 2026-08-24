/* Request-scoped Server Components intentionally evaluate elapsed time. */
/* eslint-disable react-hooks/purity */
import Link from "next/link";
import {
  CalendarDays,
  CarFront,
  CreditCard,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { CustomerPaymentTrigger } from "@/components/customer-payment-trigger";
import { CustomerShell } from "@/components/customer-shell";
import { ParkingForecastPanel } from "@/components/parking-forecast-panel";
import { getCustomerData } from "@/lib/customer-data";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  formatSessionFinancialStatus,
  formatVehicleType,
  sessionParkingStatus,
} from "@/lib/operator-format";

export const dynamic = "force-dynamic";

const shortcuts = [
  {
    title: "Mensalidade",
    text: "Acompanhe seu plano",
    href: "/cliente/mensalidade",
    icon: CalendarDays,
  },
  {
    title: "Veículos",
    text: "Veja os veículos vinculados",
    href: "/cliente/veiculos",
    icon: WalletCards,
  },
  {
    title: "Pagamentos",
    text: "Acesse pagamentos e recibos",
    href: "/cliente/pagamentos",
    icon: CreditCard,
  },
  {
    title: "Minha conta",
    text: "Dados e segurança",
    href: "/cliente/conta",
    icon: UserRound,
  },
];

export default async function Page() {
  const data = await getCustomerData();
  const firstName = data.profile.full_name.trim().split(/\s+/)[0] || "Cliente";

  return (
    <CustomerShell name={data.profile.full_name} active="Início" unreadNotifications={data.unreadNotifications}>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-blue-600">Olá, {firstName}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Sua estadia, sem complicação</h1>
          <p className="mt-1 text-sm text-slate-500">Acompanhe sua estadia, pagamento e liberação de saída em um só lugar.</p>
        </div>

        {data.active ? <ActiveStay data={data} /> : <EmptyStay />}

        <section>
          <h2 className="mb-3 text-lg font-bold">Acesso rápido</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {shortcuts.map(({ title, text, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200"
              >
                <Icon className="size-5 text-blue-600" />
                <p className="mt-4 font-bold">{title}</p>
                <p className="mt-1 text-xs text-slate-500">{text}</p>
              </Link>
            ))}
          </div>
        </section>

        <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="size-4" />
          Seus dados são protegidos e somente informações vinculadas à sua conta são exibidas.
        </p>
      </div>
    </CustomerShell>
  );
}

function ActiveStay({ data }: { data: Awaited<ReturnType<typeof getCustomerData>> }) {
  const session = data.active!;
  const charge = data.activeCharge;
  const payment = session.payments.find((row) => row.status === "PAID") ?? null;
  const paid = !!payment;
  const monthly = formatSessionFinancialStatus(session.entry_mode, session.financial_obligation);
  const timezone = session.parking_units?.timezone ?? "America/Bahia";
  const amount = monthly ? 0 : (payment?.amount ?? charge?.total ?? session.final_amount ?? session.calculated_amount);
  const duration =
    charge?.duration_minutes ??
    Math.max(0, Math.round((Date.now() - new Date(session.entered_at).getTime()) / 60000));
  const options = data.activePaymentOptions;
  const paymentAvailable = options.pix || options.credit || options.efiCard;
  const canPay =
    session.status === "PAYMENT_PENDING" &&
    session.financial_obligation === "REQUIRED" &&
    !paid &&
    paymentAvailable;
  const amountLabel = formatMoney(amount ?? 0);
  const unitName = session.parking_units?.name ?? "Unidade Star Carvalhos";
  const parkingLabel = paid
    ? "Pago — aguardando saída"
    : sessionParkingStatus(session.status, session.entry_mode, session.financial_obligation).label;

  return (
    <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
      <div className="border-b bg-blue-50/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Estadia atual</p>
            <h2 className="mt-2 text-3xl font-bold tracking-wide">{session.plate_snapshot}</h2>
            <p className="text-sm text-slate-500">{formatVehicleType(session.vehicle_type)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {parkingLabel}
          </span>
        </div>
        <p className="mt-4 font-semibold">{unitName}</p>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
        <Info label="Entrada" value={formatDateTime(session.entered_at, timezone)} />
        <Info label="Permanência" value={formatDuration(duration)} />
        <Info label="Valor atual" value={amount == null ? "Em cálculo" : amountLabel} emphasis />
        <Info
          label="Tarifa"
          value={String(session.tariff_snapshot?.name ?? charge?.tariff_name ?? "Tarifa da entrada")}
        />
        <Info
          label="Situação financeira"
          value={monthly ?? (paid ? "Pagamento confirmado" : session.status === "PAYMENT_PENDING" ? "Pagamento pendente" : "Aguardando início da cobrança")}
        />
        <Info
          label="Próximo passo"
          value={paid ? "Aguardando liberação da saída" : canPay ? "Concluir pagamento" : session.status === "OPEN" ? "Aguardar início da saída" : "Acompanhar atendimento"}
        />
      </div>

      {paid || canPay ? (
        <div className="border-t px-5 py-4 sm:px-6">
          <div className={`rounded-2xl border p-4 ${paid ? "border-emerald-200 bg-emerald-50/60" : "border-blue-200 bg-blue-50/60"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-xs font-bold uppercase tracking-wide ${paid ? "text-emerald-700" : "text-blue-700"}`}>
                  {paid ? "Pagamento confirmado" : "Pagamento pendente"}
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">{amountLabel}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {paid ? "Pagamento recebido. A saída será liberada pelo atendimento." : "Você já pode concluir o pagamento desta estadia."}
                </p>
              </div>
              <CustomerPaymentTrigger
                sessionId={session.id}
                plate={session.plate_snapshot}
                unitName={unitName}
                amountLabel={amountLabel}
                options={options}
                paid={paid}
                compact
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-t px-5 py-4 sm:px-6">
        <ParkingForecastPanel sessionId={session.id} initialAmount={Number(amount ?? 0)} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t px-5 py-4 sm:px-6">
        <Link
          href={`/cliente/estadias?session=${session.id}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
        >
          Ver detalhes
        </Link>
        <Link
          href="/cliente/pagamentos"
          className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-slate-600 hover:text-blue-700"
        >
          Ver pagamentos e recibos
        </Link>
      </div>
    </section>
  );
}

function EmptyStay() {
  return (
    <section className="grid min-h-64 place-items-center rounded-3xl border border-dashed bg-white p-8 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-blue-50">
          <CarFront className="size-7 text-blue-600" />
        </span>
        <h2 className="mt-4 text-lg font-bold">Nenhuma estadia ativa no momento.</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Quando um veículo vinculado à sua conta entrar no estacionamento, as informações aparecerão aqui automaticamente.
        </p>
      </div>
    </section>
  );
}

function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${emphasis ? "text-xl text-emerald-600" : ""}`}>{value}</p>
    </div>
  );
}
