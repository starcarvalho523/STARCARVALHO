import Image from "next/image";
import Link from "next/link";
import { Banknote,CheckCircle2,CreditCard,LayoutGrid,PartyPopper,Plus,Trophy } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { CloseShiftForm,OpenShiftForm } from "@/components/cash-shift-forms";
import { formatDateTime,formatMoney,getOperatorDashboard } from "@/lib/operator-data";
import { operatorNav } from "@/lib/operator-nav";
export const dynamic="force-dynamic";
type CashPageProps={searchParams:Promise<{opened?:string;closed?:string;welcome?:string}>};

export default async function CashPage({searchParams}:CashPageProps){
 const params=await searchParams;const data=await getOperatorDashboard();const shift=data.open_shift;
 if(!shift){const greeting=greetingForTimezone(data.unit.timezone);return <DashboardShell nav={operatorNav} active="Caixa" role="Frentista"><div className="mx-auto max-w-[980px] space-y-4"><div><h1 className="text-3xl font-bold">Caixa do turno</h1><p className="text-sm text-slate-500">Caixa não aberto. Nenhum valor de turno anterior é exibido.</p></div>{params.closed==="1"?<ClosedShiftGreeting/>:<OpeningShiftGreeting greeting={greeting}/>}</div></DashboardShell>}
 if(params.opened==="1")return <DashboardShell nav={operatorNav} active="Caixa" role="Frentista"><div className="mx-auto max-w-[1040px]"><OpenedShiftGreeting/></div></DashboardShell>;
 const expected=Number(shift.opening_amount)+Number(shift.cash_total);
 return <DashboardShell nav={operatorNav} active="Caixa" role="Frentista"><div className="mx-auto max-w-5xl space-y-5"><div><h1 className="text-3xl font-bold">Caixa do turno</h1><p className="text-sm text-slate-500">Turno aberto em {formatDateTime(shift.opened_at,data.unit.timezone)}. Valores restritos à operação atual.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card label="Saldo inicial" value={formatMoney(shift.opening_amount)}/><Card label="Dinheiro recebido" value={formatMoney(shift.cash_total)}/><Card label="Cartão manual" value={formatMoney(shift.card_total)}/><Card label="PIX confirmado" value={formatMoney(shift.pix_total)} note="Integração indisponível"/></div><div className="grid gap-4 lg:grid-cols-[1fr_420px]"><section className="rounded-2xl border bg-white p-5 sm:p-6"><h2 className="font-bold">Dinheiro físico esperado</h2><div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4"><MoneyLine icon={Banknote} label="Saldo inicial" value={shift.opening_amount}/><MoneyLine icon={Plus} label="Dinheiro recebido" value={shift.cash_total}/><div className="border-t pt-4"><p className="text-sm text-slate-500">Dinheiro esperado</p><p className="mt-1 text-3xl font-bold text-emerald-600">{formatMoney(expected)}</p></div></div><div className="mt-4 flex items-center gap-3 rounded-xl border p-4"><CreditCard className="size-5 text-blue-600"/><div><p className="text-sm font-semibold">Cartão não compõe o dinheiro físico</p><p className="text-xs text-slate-500">{formatMoney(shift.card_total)} confirmado manualmente no turno.</p></div></div><p className="mt-4 text-sm"><b>{shift.payment_count}</b> pagamentos confirmados</p></section><section className="rounded-2xl border bg-white p-5 sm:p-6"><h2 className="mb-2 font-bold">Fechar caixa</h2><p className="mb-4 text-xs leading-5 text-slate-500">Conte apenas o dinheiro físico. Se houver diferença, a observação será obrigatória.</p><CloseShiftForm shiftId={shift.id} expectedAmount={expected}/></section></div></div></DashboardShell>;
}

function OpeningShiftGreeting({greeting}:{greeting:string}){
 return <section className="overflow-visible rounded-[28px] border border-slate-200 bg-white shadow-sm">
  <div className="grid items-center gap-2 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[312px_1fr] lg:gap-6">
   <div className="relative flex min-h-[320px] items-center justify-center lg:-my-4 lg:-ml-2">
    <Image src="/frentista-recortado.webp" alt="Frentista da Star Carvalhos dando boas-vindas ao turno" width={300} height={438} priority className="relative z-10 h-auto w-[220px] origin-bottom drop-shadow-[0_20px_18px_rgba(15,23,42,0.22)] [transform:perspective(900px)_rotateY(-3deg)_rotateX(1deg)_scale(1.03)] sm:w-[236px] lg:w-[252px] lg:translate-y-2"/>
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

function OpenedShiftGreeting(){
 return <section className="overflow-hidden rounded-[34px] border border-emerald-200 bg-[radial-gradient(circle_at_top,_#f3fff8_0%,_#ecfbf3_30%,_#f9fffc_68%,_#f1faf5_100%)] shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
  <div className="relative px-5 pb-6 pt-8 text-center sm:px-10 sm:pb-8 sm:pt-10">
   <div className="pointer-events-none absolute inset-0 overflow-hidden">
    <span className="absolute left-[10%] top-[31%] h-10 w-16 rounded-[50%] border border-emerald-200/80 sm:h-12 sm:w-20"/>
    <span className="absolute right-[8%] top-[34%] h-10 w-16 rounded-[50%] border border-sky-200/90 sm:h-12 sm:w-20"/>
    <span className="absolute left-[6%] top-[58%] h-6 w-10 rounded-[50%] border border-sky-200/70"/>
    <span className="absolute right-[5%] top-[60%] h-6 w-10 rounded-[50%] border border-emerald-200/70"/>
    <span className="absolute left-[32%] top-[12%] text-emerald-400">✦</span>
    <span className="absolute right-[31%] top-[16%] text-emerald-300">✦</span>
    <span className="absolute left-[28%] top-[22%] text-sky-300">◆</span>
    <span className="absolute right-[27%] top-[23%] text-emerald-400">◆</span>
   </div>
   <div className="relative mx-auto max-w-3xl">
    <span className="mx-auto grid size-20 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_30%,_#34d399_0%,_#10b981_48%,_#059669_100%)] text-white shadow-[0_16px_36px_rgba(16,185,129,0.32)] ring-8 ring-emerald-100/70 sm:size-24"><CheckCircle2 className="size-10 sm:size-12"/></span>
    <h1 className="mt-7 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-[44px] sm:leading-[1.05]">Que este turno<br/>seja de conquistas! 🏆</h1>
    <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Foco, atenção e disposição são os combustíveis<br className="hidden sm:block"/> do nosso sucesso.</p>
    <p className="mt-3 text-xl font-extrabold text-emerald-600 sm:text-2xl">Você faz parte disso tudo! ✨</p>
    <div className="mx-auto mt-7 flex max-w-2xl items-center gap-4 rounded-[24px] border border-slate-200 bg-white/95 px-5 py-4 text-left shadow-[0_16px_34px_rgba(15,23,42,0.10)] backdrop-blur sm:px-6 sm:py-5">
     <span className="grid size-14 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 sm:size-16"><PartyPopper className="size-7 sm:size-8"/></span>
     <div><p className="text-lg font-extrabold text-slate-950 sm:text-xl">Caixa aberto com sucesso! 🎉</p><p className="mt-1 text-sm text-slate-500 sm:text-base">Tudo pronto para começar a operação.</p></div>
    </div>
    <Link href="/frentista" className="mx-auto mt-6 flex h-14 w-full max-w-2xl items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#12c777_0%,#08a764_100%)] px-6 text-lg font-bold text-white shadow-[0_14px_28px_rgba(5,150,105,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(5,150,105,0.34)] sm:h-16 sm:text-xl"><LayoutGrid className="size-5 sm:size-6"/>Ir para o painel</Link>
   </div>
  </div>
  <ParkingSuccessIllustration/>
 </section>
}

function ParkingSuccessIllustration(){
 return <div className="relative h-[170px] border-t border-emerald-100/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.04),rgba(209,250,229,0.30))] sm:h-[220px]">
  <svg viewBox="0 0 1200 240" className="absolute inset-0 h-full w-full text-emerald-400" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
   <g opacity="0.16" fill="currentColor"><rect x="42" y="102" width="30" height="78" rx="4"/><rect x="78" y="82" width="38" height="98" rx="4"/><rect x="122" y="112" width="28" height="68" rx="4"/><rect x="1010" y="96" width="34" height="84" rx="4"/><rect x="1050" y="68" width="42" height="112" rx="4"/><rect x="1098" y="108" width="28" height="72" rx="4"/></g>
   <g opacity="0.92" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M0 204h1200"/><path d="M180 204c22-12 43-16 64-14M920 204c25-12 50-16 78-13"/>
    <path d="M314 112h374l-187-22-187 22Z"/><path d="M352 112v72M500 112v72M650 112v72"/><path d="M334 184h330"/>
    <path d="M292 198h-74l-21-13h74l21 13ZM384 198h-74l-21-13h74l21 13ZM476 198h-74l-21-13h74l21 13ZM568 198h-74l-21-13h74l21 13ZM660 198h-74l-21-13h74l21 13Z"/>
    <rect x="124" y="92" width="44" height="62" rx="5"/><path d="M146 154v45M132 134h28"/><path d="M139 111h14v22h-14z"/><path d="M141 116h10M141 122h10"/>
    <rect x="1028" y="112" width="48" height="72" rx="5"/><path d="M1052 184v18M1037 158h30"/><path d="M1042 128h20v22h-20z"/>
    <rect x="744" y="112" width="92" height="76" rx="5"/><path d="M744 128h92"/><rect x="760" y="140" width="28" height="38" rx="3"/><rect x="796" y="136" width="24" height="42" rx="3"/>
    <path d="M852 160h132M984 160v32M852 160v32"/><rect x="850" y="184" width="18" height="12" rx="2"/><rect x="966" y="184" width="18" height="12" rx="2"/><path d="M868 160l18 8 18-8 18 8 18-8 18 8"/>
    <path d="M208 198c7-22 21-34 48-34h34c16 0 31 11 36 26l3 8H208Z"/><circle cx="237" cy="198" r="10"/><circle cx="300" cy="198" r="10"/><path d="M240 164l17-16h30l17 16"/>
    <path d="M354 198c7-22 21-34 48-34h34c16 0 31 11 36 26l3 8H354Z"/><circle cx="383" cy="198" r="10"/><circle cx="446" cy="198" r="10"/><path d="M386 164l17-16h30l17 16"/>
    <path d="M500 198c7-22 21-34 48-34h34c16 0 31 11 36 26l3 8H500Z"/><circle cx="529" cy="198" r="10"/><circle cx="592" cy="198" r="10"/><path d="M532 164l17-16h30l17 16"/>
    <path d="M646 198c7-22 21-34 48-34h34c16 0 31 11 36 26l3 8H646Z"/><circle cx="675" cy="198" r="10"/><circle cx="738" cy="198" r="10"/><path d="M678 164l17-16h30l17 16"/>
    <path d="M78 202v-54M60 174c0-20 11-34 18-38 7 4 18 18 18 38M78 202c0-14-8-26-18-32M78 186c6-8 12-14 18-18"/>
    <path d="M1110 202v-64M1088 166c0-22 13-38 22-43 9 5 22 21 22 43M1110 202c0-16-9-29-20-36M1110 184c7-9 14-16 21-20"/>
    <path d="M934 202v-40M921 179c0-14 8-24 13-27 5 3 13 13 13 27M934 202c0-11-5-19-13-24M934 188c4-6 9-10 13-13"/>
    <path d="M20 202c7-11 16-16 26-16 12 0 20 7 26 16M116 202c5-8 12-12 20-12 9 0 15 4 20 12M878 202c6-9 13-13 22-13 9 0 16 5 21 13M1134 202c7-10 16-15 27-15 11 0 19 5 24 15"/>
   </g>
   <g fill="currentColor" opacity="0.92"><text x="136" y="127" fontSize="28" fontWeight="800">P</text><text x="1040" y="151" fontSize="28" fontWeight="800">P</text></g>
  </svg>
 </div>
}

function ClosedShiftGreeting(){return <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 text-center shadow-sm sm:p-8"><span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg"><CheckCircle2 className="size-8"/></span><h2 className="mt-4 text-2xl font-extrabold">Caixa fechado com sucesso! 🎉</h2><p className="mt-2 text-base text-slate-600">Tudo conferido, tudo certo. Seu esforço faz a nossa operação seguir em frente.</p><p className="mt-3 inline-flex items-center gap-2 font-bold text-emerald-700"><Trophy className="size-5"/>Ótimo trabalho hoje! Descanse bem e até o próximo turno! 👏</p></section>}
function greetingForTimezone(timezone:string){const hour=Number(new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,hour:"2-digit",hourCycle:"h23"}).format(new Date()));if(hour<12)return"Bom dia";if(hour<18)return"Boa tarde";return"Boa noite"}
function Card({label,value,note}:{label:string;value:string;note?:string}){return <div className="rounded-2xl border bg-white p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p>{note?<p className="mt-2 text-[11px] text-slate-400">{note}</p>:null}</div>}
function MoneyLine({icon:Icon,label,value}:{icon:typeof Banknote;label:string;value:number}){return <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm text-slate-600"><Icon className="size-4"/>{label}</span><b>{formatMoney(value)}</b></div>}
