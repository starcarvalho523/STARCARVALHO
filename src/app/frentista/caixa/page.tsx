import Image from "next/image";
import Link from "next/link";
import { Banknote,CheckCircle2,CreditCard,Plus,Trophy } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CloseShiftForm,OpenShiftForm } from "@/components/cash-shift-forms";
import { formatDateTime,formatMoney,getOperatorDashboard } from "@/lib/operator-data";
import { operatorNav } from "@/lib/operator-nav";
export const dynamic="force-dynamic";
type CashPageProps={searchParams:Promise<{opened?:string;closed?:string;welcome?:string}>};

export default async function CashPage({searchParams}:CashPageProps){
 const params=await searchParams;const data=await getOperatorDashboard();const shift=data.open_shift;
 if(!shift){const greeting=greetingForTimezone(data.unit.timezone);return <DashboardShell nav={operatorNav} active="Caixa" role="Frentista"><div className="mx-auto max-w-[980px] space-y-4"><div><h1 className="text-3xl font-bold">Caixa do turno</h1><p className="text-sm text-slate-500">Caixa não aberto. Nenhum valor de turno anterior é exibido.</p></div>{params.closed==="1"?<ClosedShiftGreeting/>:<OpeningShiftGreeting greeting={greeting}/>}</div></DashboardShell>}
 if(params.opened==="1")return <DashboardShell nav={operatorNav} active="Caixa" role="Frentista"><div className="mx-auto max-w-3xl"><OpenedShiftGreeting/></div></DashboardShell>;
 const expected=Number(shift.opening_amount)+Number(shift.cash_total);
 return <DashboardShell nav={operatorNav} active="Caixa" role="Frentista"><div className="mx-auto max-w-5xl space-y-5"><div><h1 className="text-3xl font-bold">Caixa do turno</h1><p className="text-sm text-slate-500">Turno aberto em {formatDateTime(shift.opened_at,data.unit.timezone)}. Valores restritos à operação atual.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card label="Saldo inicial" value={formatMoney(shift.opening_amount)}/><Card label="Dinheiro recebido" value={formatMoney(shift.cash_total)}/><Card label="Cartão manual" value={formatMoney(shift.card_total)}/><Card label="PIX confirmado" value={formatMoney(shift.pix_total)} note="Integração indisponível"/></div><div className="grid gap-4 lg:grid-cols-[1fr_420px]"><section className="rounded-2xl border bg-white p-5 sm:p-6"><h2 className="font-bold">Dinheiro físico esperado</h2><div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4"><MoneyLine icon={Banknote} label="Saldo inicial" value={shift.opening_amount}/><MoneyLine icon={Plus} label="Dinheiro recebido" value={shift.cash_total}/><div className="border-t pt-4"><p className="text-sm text-slate-500">Dinheiro esperado</p><p className="mt-1 text-3xl font-bold text-emerald-600">{formatMoney(expected)}</p></div></div><div className="mt-4 flex items-center gap-3 rounded-xl border p-4"><CreditCard className="size-5 text-blue-600"/><div><p className="text-sm font-semibold">Cartão não compõe o dinheiro físico</p><p className="text-xs text-slate-500">{formatMoney(shift.card_total)} confirmado manualmente no turno.</p></div></div><p className="mt-4 text-sm"><b>{shift.payment_count}</b> pagamentos confirmados</p></section><section className="rounded-2xl border bg-white p-5 sm:p-6"><h2 className="mb-2 font-bold">Fechar caixa</h2><p className="mb-4 text-xs leading-5 text-slate-500">Conte apenas o dinheiro físico. Se houver diferença, a observação será obrigatória.</p><CloseShiftForm shiftId={shift.id} expectedAmount={expected}/></section></div></div></DashboardShell>;
}

function OpeningShiftGreeting({greeting}:{greeting:string}){
 return <section className="overflow-visible rounded-[28px] border border-slate-200 bg-white shadow-sm">
  <div className="grid items-center gap-2 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[360px_1fr] lg:gap-8">
   <div className="relative flex min-h-[350px] items-center justify-center lg:-my-6 lg:-ml-4">
    <Image src="/frentista-recortado.webp" alt="Frentista da Star Carvalhos dando boas-vindas ao turno" width={300} height={438} priority className="relative z-10 h-auto w-[260px] origin-bottom drop-shadow-[0_20px_18px_rgba(15,23,42,0.24)] [transform:perspective(900px)_rotateY(-3deg)_rotateX(1deg)_scale(1.04)] sm:w-[285px] lg:w-[310px] lg:translate-y-2"/>
   </div>
   <div className="mx-auto w-full max-w-[560px]">
    <div className="text-center lg:text-left">
     <h2 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-[40px] sm:leading-[1.06]">{greeting}, Frentista! ☀️</h2>
     <div className="mt-4 text-base leading-7 text-slate-700 sm:text-lg">
      <span className="block">Mais um dia, novas oportunidades</span>
      <span className="block">e ótimos atendimentos pela frente.</span>
      <span className="block">Foco, atenção e disposição para fazer a diferença.</span>
     </div>
     <p className="mt-2 text-lg font-extrabold text-emerald-600 sm:text-xl">Vamos juntos fazer a diferença! 💪</p>
    </div>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:p-6">
     <h3 className="text-xl font-extrabold text-slate-950">Abrir caixa</h3>
     <p className="mb-5 mt-1 text-sm text-slate-500">Informe apenas o saldo inicial em dinheiro físico.</p>
     <OpenShiftForm/>
    </section>
   </div>
  </div>
 </section>
}

function OpenedShiftGreeting(){return <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white text-center shadow-sm"><div className="p-8 sm:p-10"><span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lg"><CheckCircle2 className="size-9"/></span><h1 className="mt-5 text-3xl font-extrabold text-slate-950">Seja bem-vindo ao seu turno! 👋</h1><p className="mx-auto mt-3 max-w-md text-base leading-7 text-slate-600">Foco, atenção e disposição são os combustíveis do nosso sucesso.</p><p className="mt-3 text-lg font-bold text-emerald-600">Bora fazer acontecer! 🚀</p><div className="mx-auto mt-8 max-w-md rounded-2xl border bg-white p-5 text-left"><p className="font-bold">Caixa aberto com sucesso! 🎉</p><p className="mt-1 text-sm text-slate-500">Tudo pronto para começar a operação.</p></div><Link href="/frentista" className="mx-auto mt-6 block max-w-md rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white shadow-sm hover:bg-emerald-700">Ir para o painel</Link></div><div className="h-20 border-t border-emerald-100 bg-[linear-gradient(160deg,transparent_35%,#d9fbe7_36%,#d9fbe7_38%,transparent_39%)]"/></section>}
function ClosedShiftGreeting(){return <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 text-center shadow-sm sm:p-8"><span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg"><CheckCircle2 className="size-8"/></span><h2 className="mt-4 text-2xl font-extrabold">Caixa fechado com sucesso! 🎉</h2><p className="mt-2 text-base text-slate-600">Tudo conferido, tudo certo. Seu esforço faz a nossa operação seguir em frente.</p><p className="mt-3 inline-flex items-center gap-2 font-bold text-emerald-700"><Trophy className="size-5"/>Ótimo trabalho hoje! Descanse bem e até o próximo turno! 👏</p></section>}
function greetingForTimezone(timezone:string){const hour=Number(new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,hour:"2-digit",hourCycle:"h23"}).format(new Date()));if(hour<12)return"Bom dia";if(hour<18)return"Boa tarde";return"Boa noite"}
function Card({label,value,note}:{label:string;value:string;note?:string}){return <div className="rounded-2xl border bg-white p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p>{note?<p className="mt-2 text-[11px] text-slate-400">{note}</p>:null}</div>}
function MoneyLine({icon:Icon,label,value}:{icon:typeof Banknote;label:string;value:number}){return <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm text-slate-600"><Icon className="size-4"/>{label}</span><b>{formatMoney(value)}</b></div>}