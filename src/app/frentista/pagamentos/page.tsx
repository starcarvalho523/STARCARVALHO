import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { OperationBadge } from "@/components/operation-badge";
import { getOperatorContext } from "@/lib/operator-data";
import { formatDateTime,formatMoney,formatPaymentMethod,paymentStatus } from "@/lib/operator-format";
import { operatorNav } from "@/lib/operator-nav";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";

type PaymentRow={id:string;payment_subject_type:string;monthly_billing_period_id:string|null;amount:number;method:string;status:string;manual_confirmation:boolean;received_by:string|null;paid_at:string|null;created_at:string;parking_session_id:string|null;parking_sessions:{plate_snapshot:string}|null;monthly_billing_periods:{reference_year:number;reference_month:number}|null};

export default async function PaymentsPage(){
 const{unitId}=await getOperatorContext();const supabase=await createClient();
 const[{data:unit},{data}]=await Promise.all([
  supabase.from("parking_units").select("timezone").eq("id",unitId).single(),
  supabase.from("payments").select("id,payment_subject_type,monthly_billing_period_id,amount,method,status,manual_confirmation,received_by,paid_at,created_at,parking_session_id,parking_sessions(plate_snapshot),monthly_billing_periods(reference_year,reference_month)").eq("unit_id",unitId).order("created_at",{ascending:false}).limit(100)
 ]);
 const rows=(data??[]) as unknown as PaymentRow[];const operatorIds=[...new Set(rows.map(row=>row.received_by).filter(Boolean) as string[])];
 const{data:profiles}=operatorIds.length?await supabase.from("profiles").select("id,full_name").in("id",operatorIds):{data:[]};const names=new Map((profiles??[]).map(profile=>[profile.id,profile.full_name]));
 return <DashboardShell nav={operatorNav} active="Pagamentos" role="Frentista"><div className="mx-auto max-w-6xl space-y-5"><div><h1 className="text-3xl font-bold">Pagamentos do turno</h1><p className="text-sm text-slate-500">Receitas de estacionamento e mensalidade permanecem identificadas separadamente.</p></div><section className="overflow-hidden rounded-2xl border bg-white"><div className="hidden md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4">Origem</th><th>Valor</th><th>Método</th><th>Status</th><th>Operador</th><th>Horário</th><th className="pr-4 text-right">Ação</th></tr></thead><tbody>{rows.map(row=><PaymentTableRow key={row.id} row={row} timezone={unit?.timezone} operator={row.received_by?names.get(row.received_by):undefined}/>)}</tbody></table></div>{rows.length===0?<p className="p-8 text-center text-sm text-slate-500">Nenhum pagamento registrado.</p>:null}</section></div></DashboardShell>;
}
function subject(row:PaymentRow){if(row.payment_subject_type==="MONTHLY_BILLING_PERIOD"){const p=row.monthly_billing_periods;return p?`Mensalidade ${String(p.reference_month).padStart(2,"0")}/${p.reference_year}`:"Mensalidade"}return row.parking_sessions?.plate_snapshot??"Estacionamento avulso"}
function PaymentTableRow({row,timezone,operator}:{row:PaymentRow;timezone?:string;operator?:string}){const status=paymentStatus(row.status);return <tr className="border-t"><td className="p-4"><b>{subject(row)}</b><p className="text-xs text-slate-500">{row.payment_subject_type==="MONTHLY_BILLING_PERIOD"?"MENSALIDADE":"ESTACIONAMENTO AVULSO"}</p></td><td>{formatMoney(row.amount)}</td><td>{formatPaymentMethod(row.method,row.manual_confirmation)}</td><td><OperationBadge {...status}/></td><td>{operator??"Operador não identificado"}</td><td>{formatDateTime(row.paid_at??row.created_at,timezone)}</td><td className="pr-4 text-right">{row.parking_session_id?<Link className="font-semibold text-blue-600 hover:underline" href={`/frentista/historico?session=${row.parking_session_id}&status=all&period=30`}>Ver sessão</Link>:<Link className="font-semibold text-blue-600 hover:underline" href="/frentista/mensalistas">Ver mensalista</Link>}</td></tr>}
