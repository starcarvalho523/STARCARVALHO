/* Request-scoped Server Components intentionally evaluate elapsed time. */
/* eslint-disable react-hooks/purity */
import Link from "next/link";
import {
  CalendarDays,
  CarFront,
  ChevronRight,
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
    <CustomerShell name={data.profile.full_name} active="Início" unreadNotifications={data.unreadNotifications} wide>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-blue-600">Olá, {firstName}</p>
          <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">Sua estadia, sem complicação</h1>
          <p className="mt-0.5 text-sm text-slate-500">Acompanhe sua estadia, pagamento e liberação de saída em um só lugar.</p>
        </div>

        {data.active ? <ActiveStay data={data} /> : <EmptyStay />}

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
    <>
      <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="border-b bg-blue-50/40 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Estadia atual</p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="text-3xl font-bold tracking-wide">{session.plate_snapshot}</h2>
                <span className="text-sm text-slate-500">{formatVehicleType(session.vehicle_type)}</span>
              </div>
              <p className="mt-1.5 font-semibold">{unitName}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              {parkingLabel}
            </span>
          </div>
        </div>

        <div className="grid gap-y-4 border-b px-5 py-4 sm:grid-cols-2 sm:px-7 lg:grid-cols-6 lg:gap-y-0">
          <Info label="Entrada" value={formatDateTime(session.entered_at, timezone)} compact />
          <Info label="Permanência" value={formatDuration(duration)} compact />
          <Info label="Valor atual" value={amount == null ? "Em cálculo" : amountLabel} emphasis compact />
          <Info
            label="Tarifa"
            value={String(session.tariff_snapshot?.name ?? charge?.tariff_name ?? "Tarifa da entrada")}
            compact
          />
          <Info
            label="Situação financeira"
            value={monthly ?? (paid ? "Pagamento confirmado" : session.status === "PAYMENT_PENDING" ? "Pagamento pendente" : "Aguardando início da cobrança")}
            compact
          />
          <Info
            label="Próximo passo"
            value={paid ? "Aguardando liberação da saída" : canPay ? "Concluir pagamento" : session.status === "OPEN" ? "Aguardar início da saída" : "Acompanhar atendimento"}
            compact
          />
        </div>

        {paid || canPay ? (
          <div className="px-5 py-3 sm:px-7">
            <div className={`rounded-2xl border px-4 py-3 ${paid ? "border-emerald-200 bg-emerald-50/60" : "border-blue-200 bg-blue-50/60"}`}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
                <div className="min-w-0 lg:justify-self-start">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className={`text-xs font-bold uppercase tracking-wide ${paid ? "text-emerald-700" : "text-blue-700"}`}>
                      {paid ? "Pagamento confirmado" : "Pagamento pendente"}
                    </p>
                    <p className="text-xl font-black text-slate-950">{amountLabel}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {paid ? "Pagamento recebido. A saída será liberada pelo atendimento." : "Você já pode concluir o pagamento desta estadia."}
                  </p>
                </div>

                <div className={`justify-self-center ${canPay ? "motion-safe:animate-pulse" : ""}`}>
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

                <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-self-end">
                  <Link
                    href={`/cliente/estadias?session=${session.id}`}
                    className="inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    Ver detalhes
                  </Link>
                  <Link
                    href="/cliente/pagamentos"
                    className={`inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(37,99,235,.22)] ring-1 ring-blue-300 transition hover:bg-blue-700 ${paid ? "motion-safe:animate-pulse" : ""}`}
                  >
                    <CreditCard className="size-4" />
                    Ver pagamentos e recibos
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 sm:px-7">
            <Link
              href={`/cliente/estadias?session=${session.id}`}
              className="inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Ver detalhes
            </Link>
            <Link
              href="/cliente/pagamentos"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <CreditCard className="size-4" />
              Ver pagamentos e recibos
            </Link>
          </div>
        )}
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <section className="h-full rounded-2xl border bg-white p-3 shadow-sm">
          <ParkingForecastPanel sessionId={session.id} initialAmount={Number(amount ?? 0)} compact />
        </section>

        <section className="h-full rounded-2xl border bg-white p-3 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-blue-600">Acesso rápido</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {shortcuts.map(({ title, text, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex min-h-24 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap text-sm font-bold">{title}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-4 text-slate-500">{text}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
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

function Info({
  label,
  value,
  emphasis = false,
  compact = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "min-w-0 lg:border-r lg:border-slate-200 lg:px-5 first:lg:pl-0 last:lg:border-r-0 last:lg:pr-0" : ""}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 break-words font-bold ${emphasis ? "text-xl text-emerald-600" : compact ? "text-sm" : ""}`}>{value}</p>
    </div>
  );
}
