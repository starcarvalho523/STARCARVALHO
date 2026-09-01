import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, History, Info, ShieldCheck } from "lucide-react";
import { CustomerShell } from "@/components/customer-shell";
import { MonthlyPaymentActions } from "@/components/monthly-payment-actions";
import { MonthlyRenewalControls } from "@/components/monthly-renewal-controls";
import { MonthlyAutomaticChargeGuard } from "@/components/monthly-automatic-charge-guard";
import { MonthlyEnrollmentForm,type SelfServicePlan } from "@/components/customer-self-service-forms";
import { getCustomerData } from "@/lib/customer-data";
import { getPaymentAvailability,canUsePayment } from "@/lib/payments/payment-availability";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime,formatMoney,formatPaymentMethod } from "@/lib/operator-format";
export const dynamic="force-dynamic";

type Stage="SCHEDULED"|"START"|"RUNNING"|"ENDING"|"ENDED";

export default async function Page(){
  const supabase=await createClient();
  const[data,{data:planRows}]=await Promise.all([getCustomerData(),supabase.rpc("list_self_service_monthly_plans")]);
  const plans=(planRows??[]) as SelfServicePlan[];
  const units=[...new Set(data.monthlyPeriods.map(p=>p.monthly_subscriptions?.unit_id).filter((id):id is string=>Boolean(id)))];
  const availability=Object.fromEntries(await Promise.all(units.map(async id=>[id,await getPaymentAvailability(id)])));
  const coverage=new Map<string,string>();
  for(const p of data.monthlyPeriods){const id=p.monthly_subscriptions?.id;if(!id||p.status!=="PAID")continue;const current=coverage.get(id);if(!current||p.period_end>current)coverage.set(id,p.period_end)}

  const current=data.monthlyPeriods.find(p=>p.status==="PENDING"&&["ACTIVE","PENDING_ACTIVATION"].includes(p.monthly_subscriptions?.status??""))??null;
  const sub=current?.monthly_subscriptions??null;
  const awaiting=sub?.status==="PENDING_ACTIVATION";
  const currentCoverage=sub?coverage.get(sub.id)??null:null;
  const autoRenew=Boolean(!awaiting&&sub?.auto_renew&&!sub.cancel_at_period_end&&sub.renewal_provider==="ASAAS"&&(sub.preferred_payment_method==="CREDIT_CARD"||sub.preferred_payment_method==="CARD"));
  const nextRenewal=current?addDays(current.due_date,30):null;
  const timezone=current?.parking_units?.timezone??sub?.parking_units?.timezone??"America/Bahia";
  const progress=current?(awaiting?scheduled():cycleProgress(current.period_start,current.period_end,timezone)):null;
  const recent=data.monthlyPeriods.filter(p=>p.status==="PAID"&&p.payments.some(x=>x.status==="PAID")).slice(0,3);

  return <CustomerShell name={data.profile.full_name} active="Mensalidade" unreadNotifications={data.unreadNotifications} wide>
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-extrabold sm:text-3xl">Minha mensalidade</h1><ShieldCheck className="size-5 text-blue-600"/></div><p className="mt-1 text-sm text-slate-500">Acompanhe sua cobertura, o progresso do ciclo e as ações da sua assinatura.</p></div>
        <Link href="/cliente/pagamentos" className="hidden items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm sm:flex"><History className="size-4"/>Histórico de pagamentos</Link>
      </header>

      {!data.monthlyPeriods.length?<MonthlyEnrollmentForm plans={plans} vehicles={data.vehicles}/>:null}

      {current&&sub&&nextRenewal&&progress?<>
        <section className="grid gap-3 lg:grid-cols-[.9fr_1.2fr_.9fr]">
          <Card>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><CheckCircle2 className={`size-5 ${awaiting?"text-blue-600":"text-emerald-600"}`}/>Situação atual</span><Badge tone={awaiting?"blue":"green"}>{awaiting?"Pendente":"Ativa"}</Badge></div>
            <div className={`mt-3 rounded-2xl border p-4 ${awaiting?"border-blue-100 bg-blue-50":"border-emerald-100 bg-emerald-50"}`}><p className={`text-lg font-extrabold ${awaiting?"text-blue-700":"text-emerald-700"}`}>{awaiting?"Aguardando primeiro pagamento":"Cobertura ativa"}</p><p className="mt-1 text-sm text-slate-600">{awaiting?"A cobertura será ativada somente após a confirmação do pagamento.":"Sua mensalidade atual está paga."}</p></div>
            <div className="mt-3 border-t pt-3"><p className="text-xs font-bold uppercase text-slate-400">{awaiting?"Cobertura":"Cobertura atual até"}</p><p className={`mt-1 text-xl font-extrabold ${awaiting?"text-blue-600":"text-emerald-600"}`}>{awaiting?"Ainda não iniciada":currentCoverage?date(currentCoverage):"A confirmar"}</p></div>
          </Card>

          <Card accent>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><CalendarDays className="size-5 text-blue-600"/>{awaiting?"Primeiro ciclo":"Próximo ciclo"}</span><Badge tone="blue">30 dias corridos</Badge></div>
            <p className="mt-3 text-xs font-bold uppercase text-slate-400">{awaiting?"Cobertura após confirmação":"Período de cobertura"}</p><p className="mt-1 text-xl font-extrabold text-blue-700 sm:text-2xl">{date(current.period_start)} <span className="text-slate-300">→</span> {date(current.period_end)}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3"><Metric label="Cobrança" value={date(current.due_date)}/><Metric label="Renovação" value={date(nextRenewal)}/><Metric label="Valor" value={formatMoney(current.amount)}/></div>
          </Card>

          <Card>
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold"><Clock3 className="size-5 text-violet-600"/>{awaiting?"Primeiro pagamento":"Cobrança automática"}</span><Badge tone={autoRenew?"green":awaiting?"blue":"gray"}>{autoRenew?"Ativa":awaiting?"Pendente":"Desativada"}</Badge></div>
            <p className="mt-3 text-sm text-slate-600">{awaiting?"Escolha PIX ou cartão para ativar a primeira cobertura.":autoRenew?"Seu cartão está configurado para renovar automaticamente.":"A renovação automática está desligada."}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3"><Metric label="Cobrança" value={date(current.due_date)}/><Metric label="Método" value={awaiting?"Escolher":autoRenew?"Cartão":"Manual"}/></div>
            <div className="mt-3">{awaiting?<a href="#payment" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-bold text-white">Escolher forma de pagamento<ArrowRight className="size-4"/></a>:autoRenew?<MonthlyAutomaticChargeGuard subscriptionId={sub.id} nextBillingDate={current.due_date} compact/>:<a href="#payment" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 font-bold text-white">Ver formas de pagamento<ArrowRight className="size-4"/></a>}</div>
          </Card>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">Acompanhamento do ciclo</h2><p className="text-xs text-slate-500">{awaiting?"A contagem começa depois da confirmação do primeiro pagamento.":"As cores mostram em que etapa dos 30 dias sua cobertura está."}</p></div><div className="flex flex-wrap gap-2"><Badge tone={stageTone(progress.stage)}>{progress.label}</Badge><Badge tone="gray">{progress.day?`Dia ${progress.day} de 30`:"Ainda não iniciado"}</Badge><Badge tone="blue">{progress.remaining} dias restantes</Badge></div></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${stageBar(progress.stage)}`} style={{width:`${progress.percent}%`}}/></div>
          <div className="mt-5 grid gap-3 md:grid-cols-4"><Point tone="blue" dateText={date(current.due_date)} title="Cobrança / compra" text={awaiting?"Confirme o primeiro pagamento.":"Pagamento confirmado."}/><Point tone="green" dateText={date(current.period_start)} title="Início da cobertura" text="Começo dos 30 dias."/><Point tone="amber" dateText={date(addDays(current.period_start,14))} title="Ciclo em andamento" text="Metade do período."/><Point tone="red" dateText={date(nextRenewal)} title="Renovação próxima" text="Próxima cobrança."/></div>
          <div className="mt-4 flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3"><Info className="mt-0.5 size-5 shrink-0 text-blue-600"/><p className="text-sm text-slate-700">{awaiting?<>O ciclo ainda está em <b>0%</b>. Nenhum dia de cobertura é consumido antes da confirmação do pagamento.</>:<>Azul = compra, verde = início ativo, amarelo = andamento e vermelho = renovação próxima.</>}</p></div>
        </section>

        <section id="payment" className="scroll-mt-28 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold">{awaiting?"Finalize sua adesão":sub.plan_name}</h2><p className="mt-1 text-sm text-slate-500">{sub.parking_units?.name??"Star Carvalhos"} · {date(current.period_start)} a {date(current.period_end)}</p></div><div className="rounded-xl bg-slate-50 px-4 py-3 text-right"><p className="text-xs font-bold uppercase text-slate-400">Valor</p><p className="text-2xl font-extrabold">{formatMoney(current.amount)}</p></div></div>
          <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">{awaiting?<><b>Aguardando primeiro pagamento.</b> Escolha PIX ou cartão. A cobertura será ativada somente após a confirmação.</>:<><b>Pagamento disponível.</b> Escolha o método desejado.</>}</p>
          <PaymentBlock period={current} availability={availability[sub.unit_id]??[]} autoRenew={autoRenew}/>
          {!awaiting&&sub.status==="ACTIVE"?<div id="renewal-management" className="scroll-mt-28"><MonthlyRenewalControls subscriptionId={sub.id} autoRenew={sub.auto_renew} nextBillingDate={sub.next_billing_date} coverageUntil={currentCoverage} cancelAtPeriodEnd={sub.cancel_at_period_end}/></div>:null}
        </section>
      </>:null}

      {recent.length?<section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex justify-between"><h2 className="font-extrabold">Últimos pagamentos</h2><Link href="/cliente/pagamentos" className="text-sm font-bold text-blue-700">Ver todos</Link></div><div className="mt-2 divide-y">{recent.map(p=>{const paid=p.payments.find(x=>x.status==="PAID");return <div key={p.id} className="grid gap-2 py-3 sm:grid-cols-4 sm:items-center"><div><b>{date(p.due_date)}</b><p className="text-xs text-emerald-600">Pagamento aprovado</p></div><div className="text-sm">{date(p.period_start)} a {date(p.period_end)}</div><div className="text-sm">{paid?formatPaymentMethod(paid.method):"Pagamento"}{paid?<p className="text-xs text-slate-400">{formatDateTime(paid.paid_at??paid.created_at)}</p>:null}</div><b className="text-emerald-600 sm:text-right">{formatMoney(p.amount)}</b></div>})}</div></section>:null}
    </div>
  </CustomerShell>
}

function PaymentBlock({period,availability,autoRenew}:{period:Awaited<ReturnType<typeof getCustomerData>>["monthlyPeriods"][number];availability:Awaited<ReturnType<typeof getPaymentAvailability>>;autoRenew:boolean}){const pending=period.payments.find(p=>p.status==="PENDING");const pix=canUsePayment(availability,"PIX","QR","ASAAS");const credit=canUsePayment(availability,"CREDIT_CARD","HOSTED_CHECKOUT","ASAAS");if(period.status!=="PENDING"||autoRenew)return null;return <MonthlyPaymentActions billingPeriodId={period.id} pendingMethod={pending?.method??null} pixEnabled={pix} creditEnabled={credit}/>}
function Card({children,accent=false}:{children:React.ReactNode;accent?:boolean}){return <div className={`rounded-2xl border bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,.06)] ${accent?"border-blue-200 ring-1 ring-blue-100":"border-slate-200"}`}>{children}</div>}
function Metric({label,value}:{label:string;value:string}){return <div><p className="text-[11px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-sm font-extrabold">{value}</p></div>}
function Badge({children,tone}:{children:React.ReactNode;tone:"blue"|"green"|"amber"|"red"|"gray"}){const c={blue:"bg-blue-50 text-blue-700",green:"bg-emerald-50 text-emerald-700",amber:"bg-amber-50 text-amber-700",red:"bg-red-50 text-red-700",gray:"bg-slate-100 text-slate-600"}[tone];return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c}`}>{children}</span>}
function Point({tone,dateText,title,text}:{tone:"blue"|"green"|"amber"|"red";dateText:string;title:string;text:string}){const c={blue:"bg-blue-50 text-blue-700",green:"bg-emerald-50 text-emerald-700",amber:"bg-amber-50 text-amber-700",red:"bg-red-50 text-red-700"}[tone];return <div className={`rounded-xl p-3 text-center ${c}`}><p className="font-extrabold">{dateText}</p><p className="mt-1 font-bold text-slate-950">{title}</p><p className="mt-1 text-xs text-slate-500">{text}</p></div>}
function date(v:string){return new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR")}
function addDays(v:string,n:number){const d=new Date(`${v}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function dateKey(tz:string){try{const parts=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const p=(t:string)=>parts.find(x=>x.type===t)?.value??"";return `${p("year")}-${p("month")}-${p("day")}`}catch{return new Date().toISOString().slice(0,10)}}
function scheduled(){return{day:0,remaining:30,percent:0,stage:"SCHEDULED" as Stage,label:"Aguardando pagamento"}}
function cycleProgress(start:string,end:string,tz:string){const today=dateKey(tz);if(today<start)return scheduled();if(today>end)return{day:30,remaining:0,percent:100,stage:"ENDED" as Stage,label:"Ciclo encerrado"};const day=Math.min(30,Math.max(1,daysBetween(start,today)+1));const remaining=30-day;const percent=Math.round(day/30*100);const stage:Stage=day<=10?"START":day<=24?"RUNNING":"ENDING";return{day,remaining,percent,stage,label:stage==="START"?"Cobertura ativa":stage==="RUNNING"?"Ciclo em andamento":"Renovação próxima"}}
function daysBetween(a:string,b:string){return Math.floor((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000)}
function stageTone(s:Stage):"blue"|"green"|"amber"|"red"{if(s==="START")return"green";if(s==="RUNNING")return"amber";if(s==="ENDING"||s==="ENDED")return"red";return"blue"}
function stageBar(s:Stage){if(s==="START")return"bg-emerald-500";if(s==="RUNNING")return"bg-amber-400";if(s==="ENDING"||s==="ENDED")return"bg-red-500";return"bg-blue-600"}
