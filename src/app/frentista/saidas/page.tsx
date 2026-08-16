import Link from "next/link";
import { CarFront, CircleDollarSign, Clock3, Info, Search, Tag, Zap } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { OperationBadge } from "@/components/operation-badge";
import { PixPaymentPanel } from "@/components/pix-payment-panel";
import { CreditCheckoutPanel } from "@/components/credit-checkout-panel";
import { CompleteExitForm, PaymentForm, StartExitForm } from "@/components/session-operation-form";
import { formatDateTime, formatDuration, formatMoney, getOperatorDashboard } from "@/lib/operator-data";
import { formatSessionFinancialStatus, formatVehicleType, sessionParkingStatus } from "@/lib/operator-format";
import { operatorNav } from "@/lib/operator-nav";
import { canUsePayment, getPaymentAvailability } from "@/lib/payments/payment-availability";
import { isAsaasSandboxConfigured } from "@/lib/payments/provider-factory";

export const dynamic = "force-dynamic";

export default async function ExitsPage({ searchParams }: { searchParams: Promise<{ session?: string; q?: string }> }) {
  const [params, data] = await Promise.all([searchParams, getOperatorDashboard()]);
  const availability = await getPaymentAvailability(data.unit.id);
  const cashEnabled = canUsePayment(availability,"CASH","MANUAL","INTERNAL");
  const pixEnabled = canUsePayment(availability,"PIX","QR","ASAAS");
  const creditEnabled = isAsaasSandboxConfigured()&&canUsePayment(availability,"CREDIT_CARD","HOSTED_CHECKOUT","ASAAS");
  const query=(params.q??"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);
  const visibleSessions=data.active_sessions.filter(item=>!query||item.plate.includes(query));
  const selected = data.active_sessions.find((item) => item.id === params.session) ?? visibleSessions[0] ?? data.active_sessions[0];

  return <DashboardShell nav={operatorNav} active="Saídas" role="Frentista">
    <div className="mx-auto max-w-[1320px] space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Saída de veículo</h1>
        <p className="text-sm text-slate-500">Selecione uma placa ativa e siga o fluxo de cobrança.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="self-start rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-950">Veículos ativos</h2>
              <p className="mt-1 text-xs text-slate-500">Escolha a placa para continuar o atendimento de saída.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{data.active_sessions.length}</span>
          </div>

          <form className="mt-4" method="get">
            <label className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50">
              <Search className="size-4 text-slate-400"/>
              <input name="q" defaultValue={query} placeholder="Buscar por placa" aria-label="Buscar veículo por placa" className="min-w-0 flex-1 bg-transparent text-sm uppercase outline-none placeholder:normal-case"/>
            </label>
          </form>

          <div className="mt-4 space-y-3">
            {visibleSessions.map((item) => {
              const active=selected?.id===item.id;
              return <Link key={item.id} href={{pathname:"/frentista/saidas",query:{session:item.id,...(query?{q:query}:{})}}} className={`block rounded-2xl border p-4 transition ${active?"border-blue-500 bg-blue-50 shadow-[0_0_0_1px_rgba(37,99,235,.12)]":"border-slate-200 hover:border-blue-200 hover:bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-extrabold tracking-tight text-slate-950">{item.plate}</p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Sessão ativa</p>
                  </div>
                  <OperationBadge {...sessionParkingStatus(item.status,item.entry_mode,item.financial_obligation)}/>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-3">
                  <div className="rounded-xl bg-white/70 px-3 py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Tipo</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><CarFront className="size-3.5 text-slate-400"/>{formatVehicleType(item.vehicle_type)}</p>
                  </div>
                  <div className="rounded-xl bg-white/70 px-3 py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Permanência</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-800"><Clock3 className="size-3.5 text-blue-500"/>{formatDuration(item.duration_minutes)}</p>
                  </div>
                </div>
              </Link>;
            })}
            {visibleSessions.length===0?<div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">Nenhum veículo encontrado para esta placa.</div>:null}
          </div>

          <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-slate-500">
            <span>{data.active_sessions.length} {data.active_sessions.length===1?"veículo ativo":"veículos ativos"}</span>
            <span>Seleção por placa</span>
          </div>
        </section>

        {selected ? <ExitDetail
          selected={selected}
          timezone={data.unit.timezone}
          cashEnabled={cashEnabled}
          pixEnabled={pixEnabled}
          creditEnabled={creditEnabled}
        /> : <section className="grid min-h-72 place-items-center rounded-2xl border bg-white p-6 text-center text-slate-500 shadow-sm">Selecione um veículo.</section>}
      </div>
    </div>
  </DashboardShell>;
}

function ExitDetail({selected,timezone,cashEnabled,pixEnabled,creditEnabled}:{selected:Awaited<ReturnType<typeof getOperatorDashboard>>["active_sessions"][number];timezone:string;cashEnabled:boolean;pixEnabled:boolean;creditEnabled:boolean}){
  const monthly=selected.financial_obligation==="WAIVED_BY_MONTHLY_COVERAGE";
  const monthlyLabel=formatSessionFinancialStatus(selected.entry_mode,selected.financial_obligation);
  const financialState=monthly?monthlyLabel:selected.status==="OPEN"?"Aguardando início da cobrança":selected.status==="PAYMENT_PENDING"?"Aguardando pagamento":selected.status==="PAID"?"Pagamento confirmado":"Em revisão";
  const chargeAmount=monthly?0:(selected.amount??0);

  return <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
      <div className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><CarFront className="size-6"/></span>
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">{selected.plate}</h2>
          <p className="mt-1 text-sm text-slate-500">{formatVehicleType(selected.vehicle_type)} • {selected.tariff_name}</p>
        </div>
      </div>
      <OperationBadge {...sessionParkingStatus(selected.status,selected.entry_mode,selected.financial_obligation)} />
    </div>

    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Clock3 className="size-4 text-blue-600"/>Sessão</h3>
      <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
        <InfoItem label="Entrada" value={formatDateTime(selected.entered_at,timezone)}/>
        <InfoItem label="Permanência" value={formatDuration(selected.duration_minutes)}/>
        <InfoItem label="Tarifa" value={selected.tariff_name} icon/>
      </div>
    </section>

    <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="grid size-6 place-items-center rounded-full bg-emerald-600 text-white"><CircleDollarSign className="size-4"/></span>Cobrança</h3>
      <div className="mt-4 grid gap-4 border-t border-emerald-200/70 pt-4 sm:grid-cols-3">
        <InfoItem label="Valor calculado" value={formatMoney(selected.amount)}/>
        <div><p className="text-xs text-slate-500">Valor a cobrar</p><p className="mt-1 text-2xl font-extrabold text-emerald-600">{formatMoney(chargeAmount)}</p></div>
        <div><p className="text-xs text-slate-500">Situação financeira</p><p className="mt-2 flex items-start gap-2 text-sm font-semibold text-slate-800"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-600"/>{financialState??"Não informado"}</p></div>
      </div>
      {monthly?<div className="mt-4 border-t border-emerald-200/70 pt-3 text-xs text-emerald-800">Valor avulso teórico: <b>{formatMoney(selected.theoretical_amount)}</b></div>:null}
    </section>

    {selected.status==="OPEN"?<div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"><Info className="mt-0.5 size-4 shrink-0"/><p>{monthly?"Ao confirmar a mensalidade, a sessão será preparada para saída sem cobrança avulsa.":"Ao iniciar a saída, o valor da cobrança será fixado para esta sessão."}</p></div>:null}

    <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Zap className="size-4 text-blue-600"/>Ação</h3>
      <div className="mt-3">
        {selected.status === "OPEN" ? <StartExitForm sessionId={selected.id} monthly={monthly} /> : null}
        {selected.status === "PAYMENT_PENDING" && !monthly ? <div><p className="mb-3 text-sm font-semibold text-slate-700">Registrar recebimento</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{cashEnabled?<PaymentForm sessionId={selected.id} method="CASH"/>:null}{pixEnabled?<PixPaymentPanel sessionId={selected.id}/>:null}{creditEnabled?<CreditCheckoutPanel sessionId={selected.id}/>:null}</div></div> : null}
        {selected.status === "PAID" ? <CompleteExitForm sessionId={selected.id} /> : null}
        {selected.status === "MANUAL_REVIEW" ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Esta sessão está em revisão e requer conferência antes da liberação.</div> : null}
      </div>
    </section>
  </section>;
}

function InfoItem({label,value,icon=false}:{label:string;value:string;icon?:boolean}){
  return <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs text-slate-500">{icon?<Tag className="size-3.5"/>:null}{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</p></div>;
}
