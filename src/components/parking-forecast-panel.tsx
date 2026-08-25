"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
type Forecast = {
  state: string;
  covered: boolean;
  durationMinutes: number;
  tariffName: string;
  currentAmount: number;
  secondsUntilNext: number | null;
  estimatedNextAmount: number | null;
  graceRemainingSeconds: number;
  graceMinutes: number;
  firstHourAmount: number;
  additionalAmount: number;
  additionalFractionMinutes: number;
  dailyAfterMinutes: number | null;
  dailyCapAmount: number | null;
  dailyCapReached: boolean;
  alertMinutes: number;
  shouldPoll: boolean;
};
export function ParkingForecastPanel({
  sessionId,
  initialAmount,
  compact = false,
}: {
  sessionId: string;
  initialAmount: number;
  compact?: boolean;
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
  const timeline=useMemo(()=>buildTimeline(forecast),[forecast]);
  if (forecast?.covered)
    return (
      <section className={`rounded-2xl border border-emerald-200 bg-emerald-50 ${compact ? "p-2.5" : "p-4"}`}>
        <p className="font-semibold text-emerald-800">Estadia coberta pela mensalidade.</p>
        <p className="mt-1 text-sm text-emerald-700">Nenhuma cobrança avulsa é prevista enquanto a cobertura permanecer válida.</p>
      </section>
    );
  return (
    <section className={`${compact ? "space-y-2 p-2.5" : "space-y-4 p-4"} rounded-2xl border border-blue-100 bg-blue-50/50`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Previsibilidade da estadia</p>
        <div className={`${compact ? "mt-1.5 gap-1.5" : "mt-3 gap-3"} grid sm:grid-cols-3`}>
          <Metric label="Agora" value={money(amount)} compact={compact} />
          <Metric
            label="Próxima mudança"
            value={
              seconds === null
                ? "Sem aumento previsto"
                : seconds <= 0
                  ? "Atualizando..."
                  : shortDuration(seconds)
            }
            compact={compact}
          />
          <Metric
            label="Estimativa após mudança"
            value={
              forecast?.estimatedNextAmount != null
                ? money(forecast.estimatedNextAmount)
                : "—"
            }
            compact={compact}
          />
        </div>
      </div>

      {forecast && timeline.length ? (
        <div className={`${compact ? "p-2" : "p-3"} rounded-xl border border-blue-100 bg-white/80`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Como a tarifa evolui</p>
          <div className={`${compact ? "mt-1.5 gap-1 lg:flex-nowrap" : "mt-3 gap-2"} flex flex-wrap items-stretch`}>
            {timeline.map((item,index)=>(
              <div key={item.label} className={`${compact ? "flex-1" : ""} flex min-w-0 items-center gap-1`}>
                <div className={`${compact ? "w-full px-2 py-1" : "px-3 py-2"} rounded-xl border ${item.active?"border-blue-400 bg-blue-50":"bg-white"}`}>
                  <p className="text-xs font-bold text-slate-700">{item.label}</p>
                  <p className="mt-0.5 text-xs leading-4 text-slate-500">{item.detail}</p>
                </div>
                {index<timeline.length-1?<span className="shrink-0 text-slate-300">→</span>:null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {compact && forecast ? (
        <p className="text-xs leading-4 text-slate-500">
          {forecast.dailyCapAmount ? `Teto da diária: ${money(forecast.dailyCapAmount)}. ` : ""}
          Alerta interno configurado para {forecast.alertMinutes} minutos antes da próxima mudança. Valores futuros são estimativas; o servidor confirma o valor oficial.
        </p>
      ) : (
        <>
          {forecast && forecast.graceRemainingSeconds > 0 ? (
            <p className="text-sm text-blue-800">
              Você está dentro da tolerância: aproximadamente {shortDuration(forecast.graceRemainingSeconds)} restantes.
            </p>
          ) : null}
          {forecast?.dailyCapReached ? (
            <p className="text-sm font-semibold text-emerald-800">
              Você atingiu o valor máximo previsto para esta diária.
            </p>
          ) : forecast?.dailyCapAmount ? (
            <p className="text-sm text-slate-600">
              Teto da diária: {money(forecast.dailyCapAmount)}.
            </p>
          ) : null}
          {forecast ? (
            <p className="text-xs text-slate-500">
              Alerta interno configurado para {forecast.alertMinutes} minutos antes da próxima mudança de valor. Valores futuros são estimativas; o servidor confirma o valor oficial.
            </p>
          ) : (
            <p className="text-xs text-slate-500">Valores futuros são estimativas. O servidor confirma o valor oficial.</p>
          )}
        </>
      )}
    </section>
  );
}
function Metric({ label, value, compact=false }: { label: string; value: string; compact?:boolean }) {
  return (
    <div className={`rounded-xl bg-white/80 ${compact ? "px-2.5 py-2" : "p-3"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`${compact ? "text-sm" : "text-lg"} mt-0.5 font-bold`}>{value}</p>
    </div>
  );
}
function buildTimeline(forecast:Forecast|null){
  if(!forecast)return[];
  const items=[
    {label:"Entrada",detail:"início da estadia",active:forecast.durationMinutes===0},
  ];
  if(forecast.graceMinutes>0)items.push({label:"Tolerância",detail:`${forecast.graceMinutes} min`,active:forecast.durationMinutes<=forecast.graceMinutes});
  items.push({label:"1ª hora",detail:money(forecast.firstHourAmount),active:forecast.durationMinutes>forecast.graceMinutes&&forecast.durationMinutes<=60});
  items.push({label:"Próxima fração",detail:`+ ${money(forecast.additionalAmount)} a cada ${forecast.additionalFractionMinutes} min`,active:forecast.durationMinutes>60&&!forecast.dailyCapReached});
  if(forecast.dailyCapAmount!=null)items.push({label:"Diária",detail:`até ${money(forecast.dailyCapAmount)}${forecast.dailyAfterMinutes?` em ${formatMinutes(forecast.dailyAfterMinutes)}`:""}`,active:forecast.dailyCapReached});
  return items;
}
function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
function shortDuration(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} ${minutes === 1 ? "min" : "min"}`;
}
function formatMinutes(minutes:number){
  if(minutes%60===0){const hours=minutes/60;return `${hours} ${hours===1?"hora":"horas"}`;}
  if(minutes>60){const hours=Math.floor(minutes/60);const rest=minutes%60;return `${hours}h ${rest}min`;}
  return `${minutes} min`;
}
