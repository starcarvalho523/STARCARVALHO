/* Request-scoped Server Components intentionally evaluate dates and elapsed time. */
/* eslint-disable react-hooks/purity, @typescript-eslint/no-unused-vars */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CarFront,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { CustomerShell } from "@/components/customer-shell";
import { CasualPaymentActions } from "@/components/casual-payment-actions";
import { AddCustomerVehicleForm } from "@/components/customer-self-service-forms";
import {
  findOwnedSession,
  getCustomerData,
  type CustomerSession,
} from "@/lib/customer-data";
import {
  buildCustomerPaymentHistory,
  findCustomerPayment,
  formatBillingCompetence,
  paymentDisplayStatus,
  type CustomerPaymentHistoryRow,
} from "@/lib/customer-payments";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPaymentMethod,
  formatPaymentStatus,
  formatSessionFinancialStatus,
  formatVehicleType,
  sessionParkingStatus,
} from "@/lib/operator-format";

export const dynamic = "force-dynamic";
type Query = {
  period?: string;
  vehicle?: string;
  session?: string;
  receipt?: string;
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ secao: string }>;
  searchParams: Promise<Query>;
}) {
  const { secao } = await params;
  const query = await searchParams;
  if (secao === "historico") redirect("/cliente/estadias");
  if (secao === "recibos") redirect("/cliente/pagamentos");
  if (!["estadias", "veiculos", "pagamentos", "conta"].includes(secao))
    notFound();
  const data = await getCustomerData();
  const active = {
    estadias: "Estadias",
    veiculos: "Veículos",
    pagamentos: "Pagamentos",
    conta: "Minha conta",
  }[secao]!;
  return (
    <CustomerShell name={data.profile.full_name} active={active} unreadNotifications={data.unreadNotifications}>
      {secao === "estadias" ? (
        <Stays data={data} query={query} />
      ) : secao === "veiculos" ? (
        <Vehicles data={data} />
      ) : secao === "pagamentos" ? (
        <Payments data={data} query={query} />
      ) : (
        <Account data={data} />
      )}
    </CustomerShell>
  );
}

function Header({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}
function Stays({
  data,
  query,
}: {
  data: Awaited<ReturnType<typeof getCustomerData>>;
  query: Query;
}) {
  const months = { "30": 1, "90": 3, "180": 6, "365": 12 };
  const days = Number(query.period ?? "365");
  const since = Date.now() - days * 86400000;
  const rows = data.sessions.filter(
    (session) =>
      new Date(session.entered_at).getTime() >= since &&
      (!query.vehicle ||
        query.vehicle === "all" ||
        session.vehicle_id === query.vehicle),
  );
  const selected = findOwnedSession(data.sessions, query.session);
  return (
    <div className="space-y-5">
      <Header
        title="Estadias"
        description="Seu histórico de entradas e saídas na Star Carvalhos."
      />
      <form className="flex flex-wrap gap-2 rounded-2xl border bg-white p-3">
        <select
          name="period"
          defaultValue={query.period ?? "365"}
          className="min-h-11 rounded-xl border px-3 text-sm"
        >
          <option value="30">Últimos 30 dias</option>
          <option value="90">3 meses</option>
          <option value="180">6 meses</option>
          <option value="365">1 ano</option>
        </select>
        {data.vehicles.length > 1 ? (
          <select
            name="vehicle"
            defaultValue={query.vehicle ?? "all"}
            className="min-h-11 rounded-xl border px-3 text-sm"
          >
            <option value="all">Todos os veículos</option>
            {data.vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plate}
              </option>
            ))}
          </select>
        ) : null}
        <button className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">
          Filtrar
        </button>
      </form>
      {selected ? <StayDetail session={selected} paymentOptions={data.active?.id===selected.id?data.activePaymentOptions:{pix:false,credit:false}} /> : null}
      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((session) => (
            <StayCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <Empty
          icon={CarFront}
          title="Você ainda não possui histórico de estadias."
        />
      )}
    </div>
  );
}
function StayCard({ session }: { session: CustomerSession }) {
  const tz = session.parking_units?.timezone ?? "America/Bahia";
  const minutes = session.exited_at
    ? Math.max(
        0,
        Math.round(
          (new Date(session.exited_at).getTime() -
            new Date(session.entered_at).getTime()) /
            60000,
        ),
      )
    : Math.max(
        0,
        Math.round(
          (Date.now() - new Date(session.entered_at).getTime()) / 60000,
        ),
      );
  const payment = session.payments.find((row) => row.status === "PAID");
  const monthly = formatSessionFinancialStatus(
    session.entry_mode,
    session.financial_obligation,
  );
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{session.plate_snapshot}</h2>
          <p className="text-xs text-slate-500">
            {formatVehicleType(session.vehicle_type)}
          </p>
        </div>
        <span className="h-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">
          {
            sessionParkingStatus(
              session.status,
              session.entry_mode,
              session.financial_obligation,
            ).label
          }
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold">
        {session.parking_units?.name ?? "Unidade Star Carvalhos"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {formatDateTime(session.entered_at, tz)}
        {session.exited_at ? ` → ${formatDateTime(session.exited_at, tz)}` : ""}
      </p>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-500">
            {formatDuration(minutes)} ·{" "}
            {monthly
              ? "Mensalidade"
              : payment
                ? formatPaymentMethod(payment.method)
                : "Sem pagamento"}
          </p>
          <p className="mt-1 font-bold">
            {formatMoney(session.final_amount ?? session.calculated_amount)}
          </p>
        </div>
        <Link
          href={`/cliente/estadias?session=${session.id}`}
          className="text-sm font-bold text-blue-600"
        >
          Ver detalhes
        </Link>
      </div>
    </article>
  );
}
function StayDetail({ session,paymentOptions }: { session: CustomerSession;paymentOptions:{pix:boolean;credit:boolean} }) {
  const tz = session.parking_units?.timezone ?? "America/Bahia";
  const payment = session.payments.find((row) => row.status === "PAID");
  const monthly = formatSessionFinancialStatus(
    session.entry_mode,
    session.financial_obligation,
  );
  const end = session.exited_at
    ? new Date(session.exited_at).getTime()
    : Date.now();
  const minutes = Math.max(
    0,
    Math.round((end - new Date(session.entered_at).getTime()) / 60000),
  );
  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-600">
            Detalhe da estadia
          </p>
          <h2 className="mt-1 text-2xl font-bold">{session.plate_snapshot}</h2>
        </div>
        <Link
          href="/cliente/estadias"
          className="text-sm font-semibold text-blue-600"
        >
          Fechar
        </Link>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Veículo" value={formatVehicleType(session.vehicle_type)} />
        <Item
          label="Unidade"
          value={session.parking_units?.name ?? "Star Carvalhos"}
        />
        <Item label="Entrada" value={formatDateTime(session.entered_at, tz)} />
        <Item
          label="Saída"
          value={
            session.exited_at
              ? formatDateTime(session.exited_at, tz)
              : "Em andamento"
          }
        />
        <Item label="Permanência" value={formatDuration(minutes)} />
        <Item
          label="Status"
          value={
            sessionParkingStatus(
              session.status,
              session.entry_mode,
              session.financial_obligation,
            ).label
          }
        />
        <Item
          label="Valor"
          value={formatMoney(session.final_amount ?? session.calculated_amount)}
        />
        <Item
          label="Forma/modalidade"
          value={
            monthly
              ? "Mensalidade"
              : payment
                ? formatPaymentMethod(payment.method)
                : "Ainda não confirmado"
          }
        />
        <Item
          label="Situação financeira"
          value={
            monthly ??
            (payment
              ? formatPaymentStatus(payment.status)
              : "Ainda não confirmado")
          }
        />
      </dl>
      {session.status==="PAYMENT_PENDING"&&session.financial_obligation==="REQUIRED"&&session.payment_status!=="PAID"?<CasualPaymentActions sessionId={session.id} {...paymentOptions}/>:null}
    </section>
  );
}
function Vehicles({
  data,
}: {
  data: Awaited<ReturnType<typeof getCustomerData>>;
}) {
  return (
    <div className="space-y-5">
      <Header
        title="Meus veículos"
        description="Veículos associados com segurança ao seu cadastro."
      />
      <AddCustomerVehicleForm />
      {data.vehicles.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.vehicles.map((vehicle) => {
            const stays = data.sessions.filter(
              (session) => session.vehicle_id === vehicle.id,
            );
            return (
              <article
                key={vehicle.id}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                <span className="grid size-11 place-items-center rounded-2xl bg-blue-50">
                  <WalletCards className="size-5 text-blue-600" />
                </span>
                <h2 className="mt-4 text-2xl font-bold tracking-wide">
                  {vehicle.plate}
                </h2>
                <p className="text-sm text-slate-500">
                  {formatVehicleType(vehicle.vehicle_type)}
                </p>
                <span className="mt-4 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  Ativo
                </span>
                <div className="mt-5 border-t pt-4 text-sm">
                  <p className="text-slate-500">Última estadia</p>
                  <p className="font-semibold">
                    {stays[0]
                      ? formatDateTime(stays[0].entered_at)
                      : "Nenhuma estadia"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {stays.length} {stays.length === 1 ? "estadia" : "estadias"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={WalletCards}
          title="Nenhum veículo vinculado à sua conta."
          text="Os veículos associados com segurança ao seu cadastro aparecerão aqui."
        />
      )}
    </div>
  );
}
function Payments({
  data,
  query,
}: {
  data: Awaited<ReturnType<typeof getCustomerData>>;
  query: Query;
}) {
  const rows = buildCustomerPaymentHistory(data.sessions, data.monthlyPeriods);
  const selected = findCustomerPayment(rows, query.receipt);
  return (
    <div className="space-y-5">
      <Header
        title="Pagamentos"
        description="Pagamentos e recibos digitais de estadias e mensalidades."
      />
      {selected ? (
        <Receipt row={selected} customerName={data.profile.full_name} />
      ) : null}
      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <PaymentCard key={row.payment.id} row={row} />
          ))}
        </div>
      ) : (
        <Empty icon={CreditCard} title="Nenhum pagamento encontrado." />
      )}
    </div>
  );
}

function PaymentCard({ row }: { row: CustomerPaymentHistoryRow }) {
  const { payment } = row;
  const monthly = row.kind === "MONTHLY_BILLING_PERIOD";
  const unit = monthly
    ? (row.period.parking_units ??
      row.period.monthly_subscriptions?.parking_units)
    : row.session.parking_units;
  const title = monthly ? "Mensalidade" : row.session.plate_snapshot;
  const subtitle = monthly
    ? `${row.period.monthly_subscriptions?.plan_name ?? "Plano mensal"} · ${formatBillingCompetence(row.period.reference_year, row.period.reference_month)}`
    : (unit?.name ?? "Star Carvalhos");
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">
            {formatDateTime(
              payment.paid_at ?? payment.created_at,
              unit?.timezone,
            )}
          </p>
          <h2 className="mt-1 text-lg font-bold">{title}</h2>
        </div>
        <b className="text-lg">{formatMoney(payment.amount)}</b>
      </div>
      <p className="mt-3 text-sm">{subtitle}</p>
      <p className="mt-1 text-xs text-slate-500">
        {formatPaymentMethod(payment.method)} ·{" "}
        {paymentDisplayStatus(payment.status)}
        {payment.provider ? ` · ${formatProvider(payment.provider)}` : ""}
      </p>
      <Link
        href={`/cliente/pagamentos?receipt=${payment.id}`}
        className="mt-4 inline-flex text-sm font-bold text-blue-600"
      >
        Ver recibo
      </Link>
    </article>
  );
}
function Receipt({
  row,
  customerName,
}: {
  row: CustomerPaymentHistoryRow;
  customerName: string;
}) {
  const { payment } = row;
  const monthly = row.kind === "MONTHLY_BILLING_PERIOD";
  const unit = monthly
    ? (row.period.parking_units ??
      row.period.monthly_subscriptions?.parking_units)
    : row.session.parking_units;
  const tz = unit?.timezone ?? "America/Bahia";
  const paidAt = payment.paid_at ?? payment.created_at;
  const duration =
    !monthly && row.session.exited_at
      ? formatDuration(
          Math.max(
            0,
            Math.round(
              (new Date(row.session.exited_at).getTime() -
                new Date(row.session.entered_at).getTime()) /
                60000,
            ),
          ),
        )
      : "Em andamento";
  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-600">
            Star Carvalhos
          </p>
          <h2 className="mt-1 text-xl font-bold">Recibo digital</h2>
        </div>
        <Link
          href="/cliente/pagamentos"
          className="text-sm font-semibold text-blue-600"
        >
          Fechar
        </Link>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Cliente" value={customerName} />
        <Item label="Unidade" value={unit?.name ?? "Star Carvalhos"} />
        {monthly ? (
          <>
            <Item label="Referência" value="Mensalidade" />
            <Item
              label="Plano"
              value={
                row.period.monthly_subscriptions?.plan_name ?? "Plano mensal"
              }
            />
            <Item
              label="Competência"
              value={formatBillingCompetence(
                row.period.reference_year,
                row.period.reference_month,
              )}
            />
          </>
        ) : (
          <>
            <Item label="Placa" value={row.session.plate_snapshot} />
            <Item
              label="Veículo"
              value={formatVehicleType(row.session.vehicle_type)}
            />
            <Item
              label="Entrada"
              value={formatDateTime(row.session.entered_at, tz)}
            />
            <Item
              label="Saída"
              value={
                row.session.exited_at
                  ? formatDateTime(row.session.exited_at, tz)
                  : "Em andamento"
              }
            />
            <Item label="Permanência" value={duration} />
          </>
        )}
        <Item
          label="Forma de pagamento"
          value={formatPaymentMethod(payment.method)}
        />
        {payment.provider ? (
          <Item label="Provedor" value={formatProvider(payment.provider)} />
        ) : null}
        <Item label="Pagamento" value={formatDateTime(paidAt, tz)} />
        <Item label="Status" value={paymentDisplayStatus(payment.status)} />
        <Item label="Valor" value={formatMoney(payment.amount)} />
      </dl>
    </section>
  );
}

function formatProvider(provider: string) {
  return provider === "ASAAS" ? "Asaas" : provider;
}
function Account({
  data,
}: {
  data: Awaited<ReturnType<typeof getCustomerData>>;
}) {
  return (
    <div className="space-y-5">
      <Header
        title="Minha conta"
        description="Seus dados pessoais e acessos de segurança."
      />
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Item label="Nome" value={data.profile.full_name} />
          <Item label="E-mail" value={data.email} />
          <Item
            label="Cliente desde"
            value={formatDateTime(data.profile.created_at)}
          />
        </dl>
        <div className="mt-6 flex flex-wrap gap-3 border-t pt-5">
          <Link
            href="/esqueci-senha"
            className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white"
          >
            Alterar senha
          </Link>
        </div>
      </section>
      <p className="flex gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <ShieldCheck className="size-5 shrink-0" />
        Seus dados são protegidos e somente informações vinculadas à sua conta
        são exibidas.
      </p>
    </div>
  );
}
function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof CarFront;
  title: string;
  text?: string;
}) {
  return (
    <section className="grid min-h-56 place-items-center rounded-3xl border border-dashed bg-white p-8 text-center">
      <div>
        <Icon className="mx-auto size-9 text-slate-400" />
        <h2 className="mt-4 font-bold">{title}</h2>
        {text ? <p className="mt-2 text-sm text-slate-500">{text}</p> : null}
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
          <LockKeyhole className="size-3" />
          Área exclusiva da sua conta.
        </p>
      </div>
    </section>
  );
}
