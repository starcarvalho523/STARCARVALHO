import { Bike, CalendarDays, CarFront, Clock3, ShieldCheck, Timer, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireArea } from "@/lib/auth";
import { ceoNav } from "@/lib/ceo-nav";
import { formatDateTime, formatMoney } from "@/lib/operator-format";
import { createClient } from "@/lib/supabase/server";
import { TariffForm } from "./tariff-form";

export const dynamic = "force-dynamic";

type Tariff = {
  id: string;
  unit_id: string;
  name: string;
  vehicle_type: "CAR" | "MOTORCYCLE";
  version_number: number;
  first_hour_amount: number;
  additional_amount: number;
  additional_fraction_minutes: number;
  grace_minutes: number;
  daily_cap_amount: number;
  daily_after_minutes: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  parking_units: { name: string; timezone: string } | null;
};

const typeLabel = { CAR: "Carro", MOTORCYCLE: "Moto" };

export default async function TariffsPage() {
  const access = await requireArea("ceo");
  const unitIds = [
    ...new Set(
      access.assignments
        .filter((item) => item.role === "owner")
        .map((item) => item.unit_id as string),
    ),
  ];

  if (!unitIds.length) redirect("/ceo?erro=sem-permissao");

  const supabase = await createClient();
  const [{ data: units }, { data }] = await Promise.all([
    supabase
      .from("parking_units")
      .select("id,name")
      .in("id", unitIds)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("tariff_rules")
      .select(
        "id,unit_id,name,vehicle_type,version_number,first_hour_amount,additional_amount,additional_fraction_minutes,grace_minutes,daily_cap_amount,daily_after_minutes,valid_from,valid_until,is_active,parking_units(name,timezone)",
      )
      .in("unit_id", unitIds)
      .order("valid_from", { ascending: false }),
  ]);

  const tariffs = (data ?? []) as unknown as Tariff[];
  const active = tariffs.filter((item) => item.is_active && !item.valid_until);

  return (
    <DashboardShell nav={ceoNav} active="Tarifas" role="CEO">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Tarifas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gerencie os valores cobrados por unidade e tipo de veículo.
          </p>
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          {active.map((item) => (
            <TariffCard key={item.id} tariff={item} />
          ))}
        </section>

        <TariffForm units={units ?? []} />

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h2 className="text-xl font-extrabold text-slate-950">Histórico de tarifas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Somente leitura. Versões utilizadas por estadias nunca são apagadas.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Unidade</th>
                  <th className="px-4 py-3.5">Tipo</th>
                  <th className="px-4 py-3.5">Versão</th>
                  <th className="px-4 py-3.5">Vigência</th>
                  <th className="px-4 py-3.5">Primeira hora</th>
                  <th className="px-4 py-3.5">Fração</th>
                  <th className="px-4 py-3.5">Diária</th>
                  <th className="px-5 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tariffs.map((item) => {
                  const activeTariff = item.is_active && !item.valid_until;
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50/55">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {item.parking_units?.name}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                          <span
                            className={`grid size-8 place-items-center rounded-lg ${
                              item.vehicle_type === "MOTORCYCLE"
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-blue-50 text-blue-600"
                            }`}
                          >
                            {item.vehicle_type === "MOTORCYCLE" ? (
                              <Bike className="size-4" />
                            ) : (
                              <CarFront className="size-4" />
                            )}
                          </span>
                          {typeLabel[item.vehicle_type]}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold">v{item.version_number}</td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatDateTime(item.valid_from, item.parking_units?.timezone)}
                        {item.valid_until && (
                          <> — {formatDateTime(item.valid_until, item.parking_units?.timezone)}</>
                        )}
                      </td>
                      <td className="px-4 py-4 font-semibold">{formatMoney(item.first_hour_amount)}</td>
                      <td className="px-4 py-4">
                        {formatMoney(item.additional_amount)} / {item.additional_fraction_minutes} min
                      </td>
                      <td className="px-4 py-4">
                        {formatMoney(item.daily_cap_amount)} após {item.daily_after_minutes / 60}h
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                            activeTariff
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {activeTariff ? "Ativa" : "Encerrada"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function TariffCard({ tariff }: { tariff: Tariff }) {
  const isMotorcycle = tariff.vehicle_type === "MOTORCYCLE";

  return (
    <article
      className={`overflow-hidden rounded-[22px] border bg-white shadow-sm ${
        isMotorcycle ? "border-emerald-200" : "border-blue-200"
      }`}
    >
      <div className={`h-1 ${isMotorcycle ? "bg-emerald-500" : "bg-blue-500"}`} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
              {tariff.parking_units?.name}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-950">
              {typeLabel[tariff.vehicle_type]}
            </h2>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            Ativa · v{tariff.version_number}
          </span>
        </div>

        <div
          className={`mt-5 grid size-16 place-items-center rounded-2xl ${
            isMotorcycle ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
          }`}
        >
          {isMotorcycle ? <Bike className="size-8" /> : <CarFront className="size-8" />}
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Metric icon={Clock3} label="Primeira hora" value={formatMoney(tariff.first_hour_amount)} />
          <Metric
            icon={Timer}
            label="Fração adicional"
            value={`${formatMoney(tariff.additional_amount)} / ${tariff.additional_fraction_minutes} min`}
          />
          <Metric icon={ShieldCheck} label="Tolerância" value={`${tariff.grace_minutes} min`} />
          <Metric icon={WalletCards} label="Diária" value={formatMoney(tariff.daily_cap_amount)} />
          <Metric
            icon={Clock3}
            label="Aplicar diária"
            value={`Após ${tariff.daily_after_minutes / 60} horas`}
          />
          <Metric
            icon={CalendarDays}
            label="Início da vigência"
            value={formatDateTime(tariff.valid_from, tariff.parking_units?.timezone)}
          />
        </dl>
      </div>
    </article>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/55 p-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-blue-600 shadow-sm">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="mt-1 font-bold text-slate-950">{value}</dd>
      </div>
    </div>
  );
}
