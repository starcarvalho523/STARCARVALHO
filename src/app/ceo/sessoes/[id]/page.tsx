import Link from "next/link";
import { ArrowLeft, CarFront, Clock3, CreditCard, MapPin, ReceiptText, ShieldCheck, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ceoNav } from "@/lib/ceo-nav";
import { requireCeoScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/operator-format";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  unit_id: string;
  plate_snapshot: string;
  vehicle_type: string;
  status: string;
  entered_at: string;
  exited_at: string | null;
  calculated_amount: number | null;
  final_amount: number | null;
  payment_status: string;
  entry_mode: string;
  financial_obligation: string;
  monthly_coverage_reason: string | null;
  entry_operator_id: string;
  exit_operator_id: string | null;
};

type PaymentRow = { amount: number; status: string; method: string; paid_at: string | null; created_at: string };

export default async function CeoSessionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireCeoScope("admin");
  const supabase = await createClient();
  const unitIds = [...new Set(access.assignments.map((assignment) => String(assignment.unit_id)))];
  if (!unitIds.length) notFound();

  const { data } = await supabase
    .from("parking_sessions")
    .select("id,unit_id,plate_snapshot,vehicle_type,status,entered_at,exited_at,calculated_amount,final_amount,payment_status,entry_mode,financial_obligation,monthly_coverage_reason,entry_operator_id,exit_operator_id")
    .eq("id", id)
    .in("unit_id", unitIds)
    .maybeSingle();
  if (!data) notFound();
  const session = data as SessionRow;

  const [{ data: unit }, { data: payments }, { data: profiles }] = await Promise.all([
    supabase.from("parking_units").select("id,name,timezone").eq("id", session.unit_id).maybeSingle(),
    supabase.from("payments").select("amount,status,method,paid_at,created_at").eq("parking_session_id", session.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("profiles").select("id,full_name").in("id", [session.entry_operator_id, session.exit_operator_id].filter(Boolean) as string[]),
  ]);

  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const timezone = unit?.timezone ?? "America/Bahia";
  const payment = (payments?.[0] ?? null) as PaymentRow | null;
  const end = session.exited_at ? new Date(session.exited_at) : new Date();
  const minutes = Math.max(0, Math.round((end.getTime() - new Date(session.entered_at).getTime()) / 60000));
  const covered = session.financial_obligation === "WAIVED_BY_MONTHLY_COVERAGE";

  return (
    <DashboardShell nav={ceoNav} active="Alertas" role="CEO">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Detalhes da sessão</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">{session.plate_snapshot}</h1>
            <p className="mt-1 text-sm text-slate-500">Consulta administrativa somente leitura.</p>
          </div>
          <Link href="/ceo/alertas" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
            <ArrowLeft className="size-4" /> Voltar para Alertas
          </Link>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Summary icon={Clock3} label="Permanência" value={formatDuration(minutes)} />
          <Summary icon={ReceiptText} label="Situação" value={statusLabel(session.status)} />
          <Summary icon={CreditCard} label="Pagamento" value={covered ? "Coberto por mensalidade" : paymentLabel(session.payment_status)} />
          <Summary icon={CarFront} label="Veículo" value={vehicleLabel(session.vehicle_type)} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-extrabold text-slate-950">Resumo operacional</h2>
            <p className="mt-1 text-sm text-slate-500">Informações registradas durante a permanência.</p>
          </div>
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
            <Detail icon={MapPin} label="Unidade" value={unit?.name ?? "Unidade"} />
            <Detail icon={Clock3} label="Entrada" value={formatDateTime(session.entered_at, timezone)} />
            <Detail icon={Clock3} label="Saída" value={session.exited_at ? formatDateTime(session.exited_at, timezone) : "Ainda no pátio"} />
            <Detail icon={UserRound} label="Operador de entrada" value={names.get(session.entry_operator_id) ?? "Operador"} />
            <Detail icon={UserRound} label="Operador de saída" value={session.exit_operator_id ? names.get(session.exit_operator_id) ?? "Operador" : "Ainda não registrado"} />
            <Detail icon={ShieldCheck} label="Modalidade" value={covered ? "Cobertura mensal" : session.entry_mode === "MONTHLY" ? "Mensalista" : "Avulso"} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-extrabold text-slate-950">Financeiro da sessão</h2>
              <p className="mt-1 text-sm text-slate-500">Esta tela não permite confirmar, cancelar ou alterar pagamentos.</p>
            </div>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${covered ? "bg-violet-50 text-violet-700" : payment?.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {covered ? "Cobertura mensal" : payment?.status === "PAID" ? "Pago" : "Pagamento pendente"}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Value label="Valor calculado" value={formatMoney(Number(session.calculated_amount ?? 0))} />
            <Value label="Valor final" value={formatMoney(Number(session.final_amount ?? session.calculated_amount ?? 0))} />
            <Value label="Último pagamento" value={payment ? `${formatMoney(Number(payment.amount))} · ${methodLabel(payment.method)}` : covered ? "Dispensado pela cobertura" : "Não registrado"} />
          </div>
          {covered && session.monthly_coverage_reason ? <p className="mt-4 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-700">Cobertura aplicada: {coverageLabel(session.monthly_coverage_reason)}</p> : null}
        </section>
      </div>
    </DashboardShell>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="size-4.5" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-extrabold text-slate-950">{value}</p></div></div></article>;
}
function Detail({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) { return <div className="flex gap-3 bg-white p-5"><Icon className="mt-0.5 size-4 shrink-0 text-slate-400"/><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div></div>; }
function Value({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-950">{value}</p></div>; }
function formatDuration(minutes: number) { const hours=Math.floor(minutes/60),rest=minutes%60; return hours ? `${hours}h ${String(rest).padStart(2,"0")}min` : `${rest} min`; }
function formatDateTime(value:string,timeZone:string){return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone}).format(new Date(value));}
function statusLabel(value:string){return ({OPEN:"No pátio",PAYMENT_PENDING:"Aguardando pagamento",PAID:"Pagamento confirmado",EXITED:"Encerrada",MANUAL_REVIEW:"Revisão manual"} as Record<string,string>)[value]??"Em acompanhamento";}
function paymentLabel(value:string){return ({PENDING:"Pendente",PAID:"Pago",FAILED:"Falhou",REFUNDED:"Estornado"} as Record<string,string>)[value]??"Em acompanhamento";}
function vehicleLabel(value:string){return ({CAR:"Carro",MOTORCYCLE:"Moto",TRUCK:"Caminhão",OTHER:"Outro"} as Record<string,string>)[value]??"Veículo";}
function methodLabel(value:string){return ({CASH:"Dinheiro",PIX:"PIX",CARD:"Cartão",DEBIT_CARD:"Débito",CREDIT_CARD:"Crédito"} as Record<string,string>)[value]??value;}
function coverageLabel(value:string){return ({ACTIVE_SUBSCRIPTION:"Assinatura ativa",MONTHLY_COVERAGE:"Mensalidade válida",ACTIVE_MONTHLY_SUBSCRIPTION:"Assinatura mensal ativa"} as Record<string,string>)[value]??"Mensalidade válida";}
