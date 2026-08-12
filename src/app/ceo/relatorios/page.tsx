import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { CeoPageHeader } from "@/components/ceo-page-header";
import { CeoFilters } from "@/components/ceo-filters";
import { ceoNav } from "@/lib/ceo-nav";
import { getCeoAnalytics, normalizeCeoFilters } from "@/lib/ceo-analytics";
import { formatDateTime, formatDuration, formatMoney, formatPaymentMethod, formatSessionFinancialStatus, formatVehicleType, sessionParkingStatus } from "@/lib/operator-format";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string; unit?: string; session?: string }> }) {
  const query = await searchParams;
  const data = await getCeoAnalytics(normalizeCeoFilters(query));
  const selected = data.sessions.find((session) => session.id === query.session);
  const sessionHref = (id: string) => `/ceo/relatorios?period=${data.filters.period}&unit=${data.filters.unitId}&session=${id}`;

  return <DashboardShell nav={ceoNav} active="Relatórios" role="CEO"><div className="mx-auto max-w-[1500px] space-y-5">
    <CeoPageHeader title="Relatórios" description="Análises operacionais e financeiras baseadas nos mesmos dados do painel."><CeoFilters units={data.units}/></CeoPageHeader>
    <div className="grid gap-4 lg:grid-cols-3">
      <Report title="Operacional" rows={[["Entradas",data.metrics.entries],["Saídas",data.metrics.exits],["Veículos no pátio",data.metrics.active],["Permanência média",data.metrics.averageMinutes?formatDuration(Math.round(data.metrics.averageMinutes)):"—"],["Ocupação atual",`${data.metrics.occupancy.toFixed(1)}%`]]}/>
      <Report title="Financeiro" rows={[["Receita",formatMoney(data.metrics.revenue)],["Ticket médio",data.metrics.ticket?formatMoney(data.metrics.ticket):"—"],["Dinheiro",formatMoney(data.methods.CASH.amount)],["PIX",formatMoney(data.methods.PIX.amount)],["Cartão legado",formatMoney(data.methods.CARD.amount)],["Débito",formatMoney(data.methods.DEBIT_CARD.amount)],["Crédito",formatMoney(data.methods.CREDIT_CARD.amount)],["Pagamentos",data.metrics.payments]]}/>
      <Report title="Caixas" rows={[["Turnos",data.shifts.length],["Abertos",data.shifts.filter((shift)=>shift.status==="OPEN").length],["Fechados",data.shifts.filter((shift)=>shift.status==="CLOSED").length],["Diferença total",formatMoney(data.metrics.cashDifference)]]}/>
    </div>
    {selected ? <section className="rounded-2xl border border-blue-100 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs text-slate-500">Detalhe da sessão</p><h2 className="text-xl font-bold">{selected.plate_snapshot}</h2></div><Link className="text-sm text-blue-600" href={`/ceo/relatorios?period=${data.filters.period}&unit=${data.filters.unitId}`}>Fechar</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Cell label="Entrada" value={formatDateTime(selected.entered_at)}/><Cell label="Saída" value={selected.exited_at?formatDateTime(selected.exited_at):"—"}/><Cell label="Veículo" value={formatVehicleType(selected.vehicle_type)}/><Cell label="Status" value={sessionParkingStatus(selected.status,selected.entry_mode,selected.financial_obligation).label}/><Cell label="Forma/modalidade" value={formatSessionFinancialStatus(selected.entry_mode,selected.financial_obligation)?"Mensalidade":"Avulso"}/><Cell label="Valor" value={formatMoney(selected.final_amount??selected.calculated_amount)}/></div></section> : null}
    <Table title="Sessões" empty={!data.sessions.length?"Nenhuma sessão encontrada neste período.":undefined}><thead><tr>{["Placa","Entrada","Saída","Status","Forma/modalidade","Valor","Ação"].map((label)=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{data.sessions.map((session)=><tr key={session.id} className="border-t"><td className="px-4 py-3 font-bold">{session.plate_snapshot}</td><td>{formatDateTime(session.entered_at)}</td><td>{session.exited_at?formatDateTime(session.exited_at):"—"}</td><td>{sessionParkingStatus(session.status,session.entry_mode,session.financial_obligation).label}</td><td>{formatSessionFinancialStatus(session.entry_mode,session.financial_obligation)?"Mensalidade":"Avulso"}</td><td>{formatMoney(session.final_amount??session.calculated_amount)}</td><td><Link className="font-semibold text-blue-600" href={sessionHref(session.id)}>Ver sessão</Link></td></tr>)}</tbody></Table>
    <Table title="Pagamentos detalhados" empty={!data.payments.length?"Nenhum pagamento encontrado neste período.":undefined}><thead><tr>{["Data","Origem","Entrada","Método","Status","Valor","Ação"].map((label)=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{data.payments.map((payment)=><tr key={payment.id} className="border-t"><td className="px-4 py-3">{formatDateTime(payment.paid_at??payment.created_at)}</td><td className="font-bold">{payment.payment_subject_type==="MONTHLY_BILLING_PERIOD"?"Mensalidade":payment.parking_sessions?.plate_snapshot??"Estacionamento avulso"}</td><td>{payment.parking_sessions?.entered_at?formatDateTime(payment.parking_sessions.entered_at):"—"}</td><td>{formatPaymentMethod(payment.method,payment.manual_confirmation)}</td><td>{payment.status==="PAID"?"Pago":payment.status}</td><td>{formatMoney(payment.amount)}</td><td>{payment.parking_session_id?<Link className="font-semibold text-blue-600" href={sessionHref(payment.parking_session_id)}>Ver sessão</Link>:"Mensalidade"}</td></tr>)}</tbody></Table>
  </div></DashboardShell>;
}

function Report({title,rows}:{title:string;rows:Array<[string,string|number]>}){return <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">{title}</h2><dl className="mt-4 space-y-3">{rows.map(([label,value])=><div key={label} className="flex justify-between border-b pb-2 text-sm"><dt className="text-slate-500">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl></section>}
function Table({title,children,empty}:{title:string;children:React.ReactNode;empty?:string}){return <section className="overflow-x-auto rounded-2xl border bg-white"><h2 className="p-5 font-bold">{title}</h2>{empty?<p className="border-t p-8 text-center text-sm text-slate-500">{empty}</p>:<table className="w-full min-w-[760px] text-left text-sm">{children}</table>}</section>}
function Cell({label,value}:{label:string;value:string}){return <div><p className="text-xs text-slate-500">{label}</p><p className="font-semibold">{value}</p></div>}

