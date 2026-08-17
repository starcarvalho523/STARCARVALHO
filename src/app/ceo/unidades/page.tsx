import Link from "next/link";
import {
  Bell,
  Building2,
  CarFront,
  ChevronRight,
  CircleDollarSign,
  LogIn,
  LogOut,
  Maximize2,
  TrendingUp,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { CeoFilters } from "@/components/ceo-filters";
import { ceoNav } from "@/lib/ceo-nav";
import { getCeoAnalytics, normalizeCeoFilters } from "@/lib/ceo-analytics";
import { formatMoney } from "@/lib/operator-format";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; unit?: string }>;
}) {
  const data = await getCeoAnalytics(normalizeCeoFilters(await searchParams));

  return (
    <DashboardShell nav={ceoNav} active="Unidades" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <CeoPageHeader
          title="Unidades"
          description="Acompanhe capacidade, ocupação e desempenho de cada estacionamento."
        >
          <CeoFilters units={data.units} />
        </CeoPageHeader>

        <div className="grid gap-4 xl:grid-cols-2">
          {data.unitSummaries.map((unit) => (
            <article
              key={unit.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md"
            >
              <div className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                      <Building2 className="size-6" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-extrabold text-slate-950 sm:text-xl">
                        {unit.name}
                      </h2>
                      <span
                        className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          unit.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            unit.is_active ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                        />
                        {unit.is_active ? "Operacional" : "Inativa"}
                      </span>
                    </div>
                  </div>

                  <div className="flex w-fit items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-emerald-700">
                    <TrendingUp className="size-4" />
                    <div>
                      <p className="text-lg font-extrabold leading-none">
                        {unit.occupancy.toFixed(1).replace(".", ",")}%
                      </p>
                      <p className="mt-1 text-[9px] font-semibold text-emerald-700/70">
                        Ocupação atual
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 border-y border-slate-100 py-3 sm:grid-cols-4">
                  <Metric icon={Maximize2} label="Capacidade" value={String(unit.capacity)} tone="blue" />
                  <Metric icon={CarFront} label="Disponíveis" value={String(unit.available)} tone="green" />
                  <Metric icon={CarFront} label="No pátio" value={String(unit.active)} tone="violet" />
                  <Metric icon={CircleDollarSign} label="Receita" value={formatMoney(unit.revenue)} tone="green" />
                </div>

                <div className="mt-3 flex flex-col gap-3 rounded-xl bg-slate-50/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid flex-1 grid-cols-3 gap-2">
                    <MiniMetric icon={LogIn} label="Entradas" value={String(unit.entries)} tone="blue" />
                    <MiniMetric icon={LogOut} label="Saídas" value={String(unit.exits)} tone="green" />
                    <MiniMetric icon={Bell} label="Alertas" value={String(unit.alerts)} tone="orange" />
                  </div>

                  <Link
                    href={`/ceo/unidades/${unit.id}`}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 sm:min-w-32"
                  >
                    Ver mais
                    <ChevronRight className="size-4" />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        {!data.unitSummaries.length ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Nenhuma unidade autorizada encontrada.
          </p>
        ) : null}
      </div>
    </DashboardShell>
  );
}

type Tone = "blue" | "green" | "violet" | "orange";

function toneClasses(tone: Tone) {
  return {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    orange: "bg-orange-50 text-orange-600",
  }[tone];
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-slate-100 px-2 py-2 sm:border-r sm:last:border-r-0 sm:px-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${toneClasses(tone)}`}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-slate-500">{label}</p>
        <p className="truncate text-sm font-extrabold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1.5">
      <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${toneClasses(tone)}`}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[9px] text-slate-400">{label}</p>
        <p className="text-sm font-bold text-slate-950">{value}</p>
      </div>
    </div>
  );
}
