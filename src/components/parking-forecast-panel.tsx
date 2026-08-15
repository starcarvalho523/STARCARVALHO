"use client";
import { useCallback, useEffect, useState } from "react";
type Forecast = {
  state: string;
  covered: boolean;
  durationMinutes: number;
  tariffName: string;
  currentAmount: number;
  secondsUntilNext: number | null;
  estimatedNextAmount: number | null;
  graceRemainingSeconds: number;
  dailyCapAmount: number | null;
  dailyCapReached: boolean;
  shouldPoll: boolean;
};
export function ParkingForecastPanel({
  sessionId,
  initialAmount,
}: {
  sessionId: string;
  initialAmount: number;
}) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/customer/parking-forecast?sessionId=${encodeURIComponent(sessionId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const body = (await response.json()) as { forecast: Forecast };
    setForecast(body.forecast);
    setSeconds(body.forecast.secondsUntilNext);
  }, [sessionId]);
  useEffect(() => {
    const timer=window.setTimeout(()=>void refresh(),0);
    return()=>window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!forecast?.shouldPoll) return;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (document.visibilityState === "visible") void refresh();
          schedule();
        },
        (forecast.secondsUntilNext ?? 9999) <= 600 ? 30000 : 120000,
      );
    };
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    schedule();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [forecast?.shouldPoll, forecast?.secondsUntilNext, refresh]);
  useEffect(() => {
    if (forecast?.secondsUntilNext == null || forecast.secondsUntilNext <= 0) return;
    const timer = window.setInterval(
      () =>
        setSeconds((value) => (value === null ? null : Math.max(0, value - 1))),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [forecast?.secondsUntilNext]);
  const amount = forecast?.currentAmount ?? initialAmount;
  if (forecast?.covered)
    return (
      <p className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">
        Estadia coberta pela mensalidade.
      </p>
    );
  return (
    <section className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-3">
      <Metric label="Valor atual" value={money(amount)} />
      <Metric
        label="Próxima alteração"
        value={
          seconds === null
            ? "Sem aumento previsto"
            : seconds <= 0
              ? "Atualizando no servidor..."
              : duration(seconds)
        }
      />
      <Metric
        label="Estimativa após alteração"
        value={
          forecast?.estimatedNextAmount != null
            ? money(forecast.estimatedNextAmount)
            : "—"
        }
      />
      {forecast && forecast.graceRemainingSeconds > 0 ? (
        <p className="text-sm text-blue-800 sm:col-span-3">
          Você está dentro da tolerância: aproximadamente{" "}
          {duration(forecast.graceRemainingSeconds)} restantes.
        </p>
      ) : null}
      {forecast?.dailyCapReached ? (
        <p className="text-sm font-semibold text-emerald-800 sm:col-span-3">
          Você atingiu o valor máximo previsto para esta diária.
        </p>
      ) : forecast?.dailyCapAmount ? (
        <p className="text-sm text-slate-600 sm:col-span-3">
          Teto da diária: {money(forecast.dailyCapAmount)}.
        </p>
      ) : null}
      <p className="text-xs text-slate-500 sm:col-span-3">
        Valores futuros são estimativas. O servidor confirma o valor oficial.
      </p>
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
function duration(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}
