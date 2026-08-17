import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import {
  ArrowLeft,
  Banknote,
  BellRing,
  Building2,
  CarFront,
  CircleDollarSign,
  CircleGauge,
  CreditCard,
  LogIn,
  LogOut,
  ParkingSquare,
  Settings2,
  Tag,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { AlertList } from "@/components/ceo-visuals";
import { ceoNav } from "@/lib/ceo-nav";
import { getCeoAnalytics } from "@/lib/ceo-analytics";
import { formatDuration, formatMoney, formatPaymentMethod } from "@/lib/operator-format";

export const dynamic = "force-dynamic";

type Tone = "blue" | "green" | "violet" | "orange" | "slate";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getCeoAnalytics({ period: "30", unitId: id });
  const u = d.unitSummaries[0];
  if (!u) notFound();

  const roles = d.roles.filter((r) => r.unit_id === id);
  const tariffs = d.tariffs.filter((t) => t.unit_id === id);
  const open = d.shifts.filter((s) => s.unit_id === id && s.status === "OPEN");
  const operators = roles.filter((r) => r.role === "operator").length;
  const occupancy = `${u.occupancy.toFixed(1).replace(".", ",")}%`;

  return (
    <DashboardShell nav={ceoNav} active="Unidades" role="CEO">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <Link
            href="/ceo/unidades"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft className="size-3.5" />
            Voltar para unidades
          </Link>
          <CeoPageHeader title={u.name} description="Detalhe administrativo e gerencial da unidade." />
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          <DashboardCard
            title="Operação"
            description="Capacidade, fluxo e ocupação da unidade"
            icon={Building2}
            tone="blue"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <HighlightStat label="Ocupação atual" value={occupancy} icon={CircleGauge} tone="violet" />
              <HighlightStat label="Veículos no pátio" value={String(u.active)} icon={CarFront} tone="blue" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
              <CompactStat label="Capacidade" value={String(u.capacity)} icon={ParkingSquare} />
              <CompactStat label="Disponíveis" value={String(u.available)} icon={ParkingSquare} />
              <CompactStat label="Entradas (30 dias)" value={String(u.entries)} icon={LogIn} />
              <CompactStat label="Saídas (30 dias)" value={String(u.exits)} icon={LogOut} />
              <CompactStat
                label="Permanência média"
                value={u.averageMinutes ? formatDuration(Math.round(u.averageMinutes)) : "Dados insuficientes"}
                icon={CircleGauge}
                wide
              />
            </div>
          </DashboardCard>

          <DashboardCard
            title="Financeiro"
            description="Receita confirmada e composição dos pagamentos"
            icon={CircleDollarSign}
            tone="green"
          >
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Receita confirmada</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight text-emerald-800">{formatMoney(u.revenue)}</p>
                </div>
                <span className="grid size-11 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                  <Banknote className="size-5" />
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
              <CompactStat label="Dinheiro" value={formatMoney(d.methods.CASH.amount)} icon={Banknote} />
              <CompactStat label="Cartão" value={formatMoney(d.methods.CARD.amount)} icon={CreditCard} />
              <CompactStat label="PIX" value="Integração pendente" icon={CircleDollarSign} />
              <CompactStat label="Pagamentos" value={String(d.metrics.payments)} icon={WalletCards} />
              <CompactStat label="Diferenças" value={formatMoney(d.metrics.cashDifference)} icon={CircleDollarSign} />
            </div>
          </DashboardCard>

          <DashboardCard
            title="Equipe"
            description="Pessoas e caixas vinculados à operação"
            icon={UsersRound}
            tone="violet"
            compact
          >
            <div className="grid gap-2.5 sm:grid-cols-3">
              <MiniCard label="Funcionários associados" value={String(roles.length)} icon={UsersRound} tone="blue" />
              <MiniCard label="Operadores" value={String(operators)} icon={UsersRound} tone="violet" />
              <MiniCard label="Caixas abertos" value={String(open.length)} icon={WalletCards} tone="green" />
            </div>
          </DashboardCard>

          <DashboardCard
            title="Tarifas ativas"
            description="Versões utilizadas em novas entradas"
            icon={Tag}
            tone="orange"
            compact
            action={
              <Link href={`/ceo/tarifas?unit=${id}`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
                <Settings2 className="size-3.5" />
                Gerenciar
              </Link>
            }
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              {tariffs.map((t) => {
                const VehicleIcon = t.vehicle_type === "CAR" ? CarFront : MotorcycleIcon;
                const iconTone = t.vehicle_type === "CAR" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600";
                return (
                  <div key={t.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-center gap-3">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${iconTone}`}>
                        <VehicleIcon className="size-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-950">{t.vehicle_type === "CAR" ? "Carro" : "Moto"} · v{t.version_number}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{formatMoney(Number(t.first_hour_amount))} primeira hora</p>
                      </div>
                    </div>
                    <p className="mt-2.5 border-t border-slate-200 pt-2.5 text-[11px] text-slate-500">
                      {formatPaymentMethod("CARD")} e dinheiro aceitos
                    </p>
                  </div>
                );
              })}
              {!tariffs.length ? <p className="text-sm text-slate-500">Nenhuma tarifa ativa encontrada.</p> : null}
            </div>
          </DashboardCard>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-red-50 text-red-600">
                <BellRing className="size-4" />
              </span>
              <div>
                <h2 className="font-bold text-slate-950">Alertas da unidade</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {d.alerts.length ? `${d.alerts.length} alerta${d.alerts.length === 1 ? "" : "s"} requerendo atenção` : "Nenhum alerta prioritário ativo"}
                </p>
              </div>
            </div>
            <Link href="/ceo/alertas" className="text-xs font-bold text-blue-600 hover:text-blue-700">Ver todos</Link>
          </div>
          <AlertList alerts={d.alerts} />
        </section>
      </div>
    </DashboardShell>
  );
}

function DashboardCard({
  title,
  description,
  icon: Icon,
  tone,
  action,
  compact = false,
  children,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  action?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const palette = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    orange: "bg-orange-50 text-orange-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${palette}`}>
            <Icon className="size-4.5" />
          </span>
          <div>
            <h2 className="font-bold text-slate-950">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className={compact ? "mt-3" : "mt-4"}>{children}</div>
    </section>
  );
}

function HighlightStat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: ComponentType<{ className?: string }>; tone: Tone }) {
  const palette = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    orange: "bg-orange-50 text-orange-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${palette}`}><Icon className="size-4" /></span>
      <div>
        <p className="text-[11px] text-slate-500">{label}</p>
        <p className="mt-0.5 text-lg font-extrabold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function CompactStat({ label, value, icon: Icon, wide = false }: { label: string; value: string; icon: ComponentType<{ className?: string }>; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-1" : ""}>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><Icon className="size-3.5" />{label}</div>
      <p className="mt-1 break-words text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function MiniCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: ComponentType<{ className?: string }>; tone: Tone }) {
  const palette = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    orange: "bg-orange-50 text-orange-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
      <span className={`grid size-8 place-items-center rounded-xl ${palette}`}><Icon className="size-3.5" /></span>
      <p className="mt-2 text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

function MotorcycleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M9 17h4l2.4-5H12l-2 2.4L8 11H5" />
      <path d="M15.5 12 14 8h3" />
      <path d="M17 8h2" />
      <path d="M13 17h2" />
    </svg>
  );
}
