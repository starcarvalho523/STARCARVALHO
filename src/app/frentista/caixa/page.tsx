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
 return <section className="relative overflow-hidden rounded-[30px] border border-emerald-200/80 bg-[radial-gradient(circle_at_50%_-8%,#ffffff_0%,#f5fff9_30%,#ecfbf4_67%,#f8fffb_100%)] shadow-[0_28px_80px_rgba(15,23,42,0.11)] sm:rounded-[38px]">
  <div className="relative px-4 pb-5 pt-9 text-center sm:px-10 sm:pb-8 sm:pt-12 lg:px-16 lg:pt-14">
   <CloudDecoration className="-left-8 top-8 w-36 text-emerald-100 sm:left-3 sm:top-12 sm:w-52"/>
   <CloudDecoration className="-right-10 top-16 w-40 text-sky-100 sm:right-2 sm:top-20 sm:w-56" flip/>
   <CloudDecoration className="left-[3%] top-[53%] hidden w-28 text-sky-100/90 sm:block"/>
   <CloudDecoration className="right-[4%] top-[56%] hidden w-24 text-emerald-100/90 sm:block" flip/>
   <SkyBird className="left-[14%] top-[38%] hidden w-9 text-emerald-300 sm:block"/>
   <SkyBird className="right-[15%] top-[43%] hidden w-7 text-sky-300 sm:block" flip/>
   <div className="relative mx-auto max-w-[720px]">
    <div className="relative mx-auto w-fit">
     <ConfettiDecoration/>
     <span className="relative grid size-[86px] place-items-center rounded-full border-[5px] border-white/70 bg-[radial-gradient(circle_at_31%_25%,#5ee8b1_0%,#10b981_43%,#047857_100%)] text-white shadow-[inset_0_-8px_14px_rgba(4,120,87,0.24),inset_0_5px_9px_rgba(255,255,255,0.38),0_13px_0_-6px_#a7f3d0,0_20px_40px_rgba(16,185,129,0.34)] ring-[10px] ring-emerald-100/75 sm:size-[104px]"><CheckCircle2 strokeWidth={3.1} className="size-11 drop-shadow-[0_3px_2px_rgba(4,120,87,0.18)] sm:size-14"/></span>
    </div>
    <h1 className="mt-8 text-[34px] font-black leading-[1.03] tracking-[-0.035em] text-slate-950 sm:mt-9 sm:text-[50px] lg:text-[56px]">Que este turno<br/>seja de conquistas! 🏆</h1>
    <p className="mx-auto mt-5 max-w-[630px] text-[15px] leading-6 text-slate-600 sm:text-lg sm:leading-7">Foco, atenção e disposição são os combustíveis<br className="hidden sm:block"/> do nosso sucesso.</p>
    <p className="mt-3 text-lg font-extrabold text-emerald-600 sm:text-[23px]">Você faz parte disso tudo! ✨</p>
    <div className="mx-auto mt-7 flex max-w-[650px] items-center gap-3 rounded-[22px] border border-emerald-100 bg-white/95 px-4 py-4 text-left shadow-[0_16px_38px_rgba(15,23,42,0.09)] backdrop-blur-sm sm:gap-5 sm:px-6 sm:py-5">
     <span className="grid size-13 shrink-0 place-items-center rounded-full border border-emerald-100 bg-[linear-gradient(145deg,#ecfdf5,#d1fae5)] text-emerald-600 shadow-[inset_0_1px_0_white,0_7px_16px_rgba(16,185,129,0.13)] sm:size-16"><PartyPopper className="size-6 sm:size-8"/></span>
     <div><p className="text-[16px] font-extrabold leading-tight text-slate-950 sm:text-xl">Caixa aberto com sucesso! 🎉</p><p className="mt-1.5 text-[13px] text-slate-500 sm:text-base">Tudo pronto para começar a operação.</p></div>
    </div>
    <Link href="/frentista" className="mx-auto mt-5 flex h-14 w-full max-w-[650px] items-center justify-center gap-3 rounded-[18px] border border-emerald-500/40 bg-[linear-gradient(135deg,#16c982_0%,#08a765_58%,#059669_100%)] px-6 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_14px_28px_rgba(5,150,105,0.25)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_18px_34px_rgba(5,150,105,0.32)] sm:h-16 sm:text-xl"><LayoutGrid className="size-5 sm:size-6"/>Ir para o painel</Link>
   </div>
  </div>
  <ParkingSuccessIllustration/>
 </section>
}

function CloudDecoration({className,flip=false}:{className:string;flip?:boolean}){
 return <svg viewBox="0 0 210 76" className={`pointer-events-none absolute ${className} ${flip?"-scale-x-100":""}`} fill="none" aria-hidden="true"><path d="M14 61.5c0-10.4 8.4-18.8 18.8-18.8 2.6 0 5 .5 7.2 1.4C43.5 29.6 56.5 19 72 19c13.3 0 24.8 7.7 30.3 18.9A27 27 0 0 1 124 27c13.8 0 25.2 10.3 26.8 23.7 3.8-2.8 8.5-4.4 13.6-4.4 12.7 0 23 10.3 23 23H21.8A7.8 7.8 0 0 1 14 61.5Z" fill="currentColor"/><path d="M22 69.2h166" stroke="white" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round"/></svg>
}

function SkyBird({className,flip=false}:{className:string;flip?:boolean}){
 return <svg viewBox="0 0 42 18" className={`pointer-events-none absolute ${className} ${flip?"-scale-x-100":""}`} fill="none" aria-hidden="true"><path d="M2 13c5.5-8 11-8 16.5 0C24 5 29.5 5 40 12" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"/></svg>
}

function ConfettiDecoration(){
 const pieces=["-left-16 top-1 h-2.5 w-1 rotate-[24deg] bg-emerald-400","-left-12 -top-7 h-1.5 w-3 -rotate-[28deg] bg-sky-300","-left-20 top-10 h-1.5 w-3 rotate-[62deg] bg-teal-400","-left-8 top-20 h-2 w-1 -rotate-12 bg-sky-400","-right-16 top-0 h-2.5 w-1 -rotate-[22deg] bg-emerald-400","-right-12 -top-7 h-1.5 w-3 rotate-[28deg] bg-teal-300","-right-20 top-10 h-1.5 w-3 -rotate-[58deg] bg-sky-400","-right-8 top-20 h-2 w-1 rotate-12 bg-emerald-300"];
 return <div className="pointer-events-none absolute inset-0" aria-hidden="true">{pieces.map((piece,index)=><span key={index} className={`absolute rounded-sm ${piece}`}/>)}<span className="absolute -left-24 top-2 text-2xl text-emerald-400">✦</span><span className="absolute -right-24 top-5 text-xl text-emerald-300">✦</span><span className="absolute -left-14 top-14 text-sm text-white drop-shadow-[0_0_2px_#10b981]">✦</span><span className="absolute -right-14 top-13 text-base text-white drop-shadow-[0_0_2px_#10b981]">✦</span></div>
}

function ParkingSuccessIllustration(){
 return <div className="relative h-[170px] bg-[linear-gradient(180deg,rgba(236,253,245,0)_0%,rgba(209,250,229,.28)_100%)] sm:h-[220px] lg:h-[245px]">
  <svg viewBox="0 0 1200 270" className="absolute inset-0 h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
   <g fill="#10b981" opacity=".075"><path d="M0 172h45v-54h34v54h31V94h44v78h40v-45h31v45h44v-67h38v67h570v-51h35v51h31V83h46v89h34v-66h34v66h45v-42h34v42h34v98H0z"/><path d="M90 97h8v8h-8zm24 0h8v8h-8zm770 45h8v8h-8zm80-38h9v9h-9zm25 0h9v9h-9z"/></g>
   <path d="M0 226c82-1 116-20 168-18 72 3 101 26 181 25 123-2 173-28 291-20 90 6 113 25 211 18 101-7 156-27 349-13v52H0z" fill="#d1fae5" opacity=".58"/>
   <g stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M0 242h1200" opacity=".72"/><path d="M1 225c50 0 76-11 117-27 23-9 59-11 92-2M994 207c56-17 129-14 206 6" fill="#ecfdf5"/>
    <g fill="#ecfdf5"><path d="M73 226v-77M46 181c0-27 15-48 27-54 12 6 27 27 27 54-10-8-18-10-27-2-9-8-17-6-27 2Z"/><path d="M180 220v-53M160 189c0-19 11-33 20-38 9 5 20 19 20 38-7-5-14-7-20-1-6-6-13-4-20 1Z"/><path d="M1102 226v-76M1075 181c0-28 15-48 27-55 12 7 27 27 27 55-10-8-18-10-27-2-9-8-17-6-27 2Z"/><path d="M1007 224v-50M989 194c0-18 10-32 18-36 8 4 18 18 18 36-6-5-12-6-18-1-6-5-12-4-18 1Z"/></g>
    <path d="M18 227c9-15 22-22 38-22 15 0 27 8 34 22M100 226c8-12 18-18 31-18 13 0 23 6 29 18M1040 228c8-13 20-20 34-20 15 0 27 7 34 20M1125 228c8-12 19-18 32-18 14 0 24 6 31 18" fill="#a7f3d0"/>
    <g><rect x="124" y="119" width="54" height="72" rx="7" fill="white"/><rect x="133" y="128" width="36" height="42" rx="5" fill="#d1fae5"/><path d="M151 191v37"/><text x="140" y="160" fill="#059669" stroke="none" fontSize="30" fontWeight="900">P</text></g>
    <g><path d="M271 143h464l-38-29H305l-34 29Z" fill="#a7f3d0"/><path d="M285 143h436"/><path d="M310 143v78M439 143v78M568 143v78M697 143v78"/><path d="M296 151h414" opacity=".5"/></g>
    <ParkingCar x={329} y={173} scale={.73}/><ParkingCar x={460} y={170} scale={.78}/><ParkingCar x={594} y={175} scale={.69}/><ParkingCar x={396} y={197} scale={1.12} accent/>
    <g opacity=".78"><path d="M264 235h89l-20-12h-74M510 235h87l-18-12h-74M632 235h87l-18-12h-74"/><path d="M251 238 219 251M746 234l34 15"/></g>
    <g><path d="M790 160h100v67H790z" fill="white"/><path d="M782 160h116l-12-16h-92l-12 16Z" fill="#a7f3d0"/><rect x="804" y="174" width="36" height="42" rx="3" fill="#d1fae5"/><rect x="849" y="173" width="25" height="29" rx="3" fill="#bae6fd"/><path d="M790 211h100"/></g>
    <g><rect x="918" y="208" width="22" height="29" rx="3" fill="#a7f3d0"/><path d="M929 208v-48M929 166h148"/><path d="m949 160 13 12m12-12 13 12m12-12 13 12m12-12 13 12m12-12 13 12" stroke="#059669" strokeWidth="5"/><path d="M1077 160v11"/></g>
    <g><rect x="961" y="131" width="49" height="61" rx="6" fill="white"/><rect x="970" y="140" width="31" height="35" rx="4" fill="#d1fae5"/><text x="977" y="168" fill="#059669" stroke="none" fontSize="27" fontWeight="900">P</text><path d="M985 192v34"/></g>
    <g stroke="#059669" strokeWidth="3"><path d="M918 193h-50"/><path d="m878 182-12 11 12 11"/></g>
   </g>
  </svg>
 </div>
}

function ParkingCar({x,y,scale,accent=false}:{x:number;y:number;scale:number;accent?:boolean}){
 return <g transform={`translate(${x} ${y}) scale(${scale})`} stroke="#10b981" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 41 8 22c2-6 8-10 14-11l14-1L48-2h34l17 13 16 4c8 2 13 7 15 15l2 11H1Z" fill={accent?"#d1fae5":"#f0fdf4"}/><path d="m38 10 13-7h27l13 9-53-2Z" fill="#bae6fd"/><path d="M47 4v7M80 4l-2 8M12 25h113M103 17l14 3M7 35h15M111 35h16"/><circle cx="27" cy="42" r="10" fill="white"/><circle cx="105" cy="42" r="10" fill="white"/><circle cx="27" cy="42" r="4" fill="#a7f3d0"/><circle cx="105" cy="42" r="4" fill="#a7f3d0"/></g>
}

function ClosedShiftGreeting(){return <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 text-center shadow-sm sm:p-8"><span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg"><CheckCircle2 className="size-8"/></span><h2 className="mt-4 text-2xl font-extrabold">Caixa fechado com sucesso! 🎉</h2><p className="mt-2 text-base text-slate-600">Tudo conferido, tudo certo. Seu esforço faz a nossa operação seguir em frente.</p><p className="mt-3 inline-flex items-center gap-2 font-bold text-emerald-700"><Trophy className="size-5"/>Ótimo trabalho hoje! Descanse bem e até o próximo turno! 👏</p></section>}
function greetingForTimezone(timezone:string){const hour=Number(new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,hour:"2-digit",hourCycle:"h23"}).format(new Date()));if(hour<12)return"Bom dia";if(hour<18)return"Boa tarde";return"Boa noite"}
function Card({label,value,note}:{label:string;value:string;note?:string}){return <div className="rounded-2xl border bg-white p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p>{note?<p className="mt-2 text-[11px] text-slate-400">{note}</p>:null}</div>}
function MoneyLine({icon:Icon,label,value}:{icon:typeof Banknote;label:string;value:number}){return <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm text-slate-600"><Icon className="size-4"/>{label}</span><b>{formatMoney(value)}</b></div>}
