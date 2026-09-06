import { BarChart3, BriefcaseBusiness, Building2, CalendarDays, CarFront, CircleDollarSign, Gauge, Layers3, Megaphone, TrendingUp } from "lucide-react";
import { getMonthlyAccess, money } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";
import { commercialSummary } from "@/lib/ceo-commercial-analytics";
import { daysAgoIso } from "@/lib/server-clock";
import { attachBusinessVehicle, createBusinessContract, detachBusinessVehicle, saveAcquisitionSource, saveCalendarDate, saveMarketingSpend, saveUnitCommercialProfile, saveZone } from "./actions";

const pct = (value: number) => `${value.toFixed(1).replace(".", ",")}%`;
const field = "mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const CHANNELS = [["GOOGLE","Google"],["GOOGLE_MAPS","Google Maps"],["INSTAGRAM","Instagram"],["REFERRAL","Indicação"],["STOREFRONT","Fachada"],["BUSINESS","Empresa"],["WHATSAPP","WhatsApp"],["OTHER","Outro"]] as const;

export default async function StrategyPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const params = await searchParams;
  const { unitIds, manageableUnitIds } = await getMonthlyAccess();
  const supabase = await createClient();
  const since = daysAgoIso(30);

  const [unitsQ,zonesQ,sessionsQ,paymentsQ,subscriptionsQ,demandQ,businessQ,calendarQ,spendQ,acquisitionQ,vehiclesQ,linksQ,customersQ] = await Promise.all([
    supabase.from("parking_units").select("id,name,capacity,area_sqm,monthly_fixed_cost").in("id",unitIds),
    supabase.from("parking_zones").select("id,unit_id,name,code,capacity,zone_type,priority,is_active").in("unit_id",unitIds).order("priority"),
    supabase.from("parking_sessions").select("unit_id,status,entered_at,exited_at,entry_mode").in("unit_id",unitIds).gte("entered_at",since),
    supabase.from("payments").select("unit_id,status,amount,paid_at").in("unit_id",unitIds).eq("status","PAID").gte("paid_at",since),
    supabase.from("monthly_subscriptions").select("unit_id,status,contracted_price").in("unit_id",unitIds),
    supabase.from("parking_demand_events").select("unit_id,reason,occurred_at").in("unit_id",unitIds).gte("occurred_at",since),
    supabase.from("business_parking_contracts").select("id,unit_id,status,price,name,business_id,max_registered_vehicles,max_simultaneous_vehicles,guaranteed_spaces").in("unit_id",unitIds),
    supabase.from("parking_calendar_dates").select("unit_id,calendar_date,label,is_holiday").in("unit_id",unitIds).gte("calendar_date",new Date().toISOString().slice(0,10)).order("calendar_date").limit(12),
    supabase.from("marketing_spend").select("unit_id,source,campaign,amount,period_start,period_end").in("unit_id",unitIds).gte("period_end",since.slice(0,10)),
    supabase.from("customer_acquisition_attribution").select("unit_id,customer_id,source,campaign,first_touch_at").in("unit_id",unitIds).gte("first_touch_at",since),
    supabase.from("vehicles").select("id,normalized_plate,vehicle_type,customer_id").order("normalized_plate").limit(300),
    supabase.from("business_contract_vehicles").select("id,contract_id,vehicle_id,valid_from,valid_until"),
    supabase.rpc("get_ceo_customer_directory"),
  ]);

  const units = unitsQ.data ?? [];
  const zones = zonesQ.data ?? [];
  const business = businessQ.data ?? [];
  const calendar = calendarQ.data ?? [];
  const spend = spendQ.data ?? [];
  const acquisitions = acquisitionQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];
  const links = linksQ.data ?? [];
  const rawCustomers = Array.isArray(customersQ.data) ? customersQ.data : [];
  const customers = rawCustomers.flatMap((row:unknown)=>{
    if (!row || typeof row!=="object") return [];
    const record=row as Record<string,unknown>;
    const id=String(record.customer_id ?? "");
    if(!id) return [];
    return [{id,name:String(record.full_name ?? record.email ?? "Cliente"),email:String(record.email ?? "")}];
  });
  const summary = commercialSummary({
    units, zones, sessions: sessionsQ.data ?? [], payments: paymentsQ.data ?? [],
    subscriptions: subscriptionsQ.data ?? [], demand: demandQ.data ?? [], businessContracts: business,
    marketingSpend: spend, acquisitions, days: 30,
  });
  const canManage = manageableUnitIds.length > 0;
  const manageableUnits=units.filter((u)=>manageableUnitIds.includes(u.id));
  const today=new Date().toISOString().slice(0,10);

  return <main className="space-y-6 pb-10">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700"><TrendingUp className="size-3.5" />Operação Comercial 2.0</div><h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Estratégia, capacidade e expansão</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Capacidade, mensalistas, B2B, aquisição e unit economics reunidos em uma visão comercial.</p></div><div className={`rounded-2xl px-4 py-3 text-sm font-bold ${summary.expansionStatus === "STUDY_EXPANSION" ? "bg-amber-50 text-amber-800" : summary.expansionStatus === "WATCH" ? "bg-blue-50 text-blue-800" : "bg-emerald-50 text-emerald-800"}`}>{summary.expansionStatus === "STUDY_EXPANSION" ? "Estudar expansão" : summary.expansionStatus === "WATCH" ? "Monitorar capacidade" : "Capacidade saudável"}</div></div>
    </header>

    {params.erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{params.erro}</div>}
    {params.sucesso && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{params.sucesso}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Building2} label="Capacidade física" value={`${summary.totalCapacity} vagas`} detail={`${summary.allocatedZoneCapacity} distribuídas em zonas`} />
      <Metric icon={Gauge} label="Ocupação agora" value={pct(summary.occupancy)} detail={`${summary.openSessions} veículos em operação`} />
      <Metric icon={CircleDollarSign} label="RevPAS · 30 dias" value={money(summary.revpas)} detail="receita paga / vaga / dia" />
      <Metric icon={TrendingUp} label="MRR recorrente" value={money(summary.recurringMrr)} detail={`${summary.activeMonthlyContracts} mensalistas + ${summary.activeBusinessContracts} B2B`} />
      <Metric icon={CarFront} label="Demanda perdida · 30d" value={String(summary.lostDemand)} detail={`${summary.fullDemand} por lotação`} />
      <Metric icon={BarChart3} label="Mix de entradas" value={`${pct(summary.monthlyShare)} mensal`} detail={`${pct(summary.casualShare)} avulso · ${pct(summary.businessShare)} B2B`} />
      <Metric icon={Megaphone} label="CAC observado · 30d" value={summary.acquiredCustomers ? money(summary.cac) : "—"} detail={`${summary.acquiredCustomers} clientes atribuídos · ${money(summary.marketingSpend)} investidos`} />
      <Metric icon={CircleDollarSign} label="Custo fixo por vaga" value={summary.totalCapacity && summary.monthlyFixedCost ? money(summary.fixedCostPerSpace) : "—"} detail={`${summary.totalAreaSqm ? `${summary.totalAreaSqm.toFixed(0)} m² · ` : ""}${summary.totalAreaSqm ? `${money(summary.revenuePerSqm)}/m² em 30d` : "configure a área"}`} />
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Card title="Zonas de capacidade" subtitle="Rotatividade, flexível, mensalista ou reservada. A soma ativa nunca pode ultrapassar a unidade.">
        <div className="space-y-3">{zones.length ? zones.map((zone) => <div key={zone.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4"><div><div className="font-bold text-slate-900">{zone.code} · {zone.name}</div><div className="mt-1 text-xs text-slate-500">{zone.zone_type} · prioridade {zone.priority} · {zone.is_active ? "ativa" : "inativa"}</div></div><div className="text-right"><div className="text-xl font-black text-slate-950">{zone.capacity}</div><div className="text-xs text-slate-500">vagas</div></div></div>) : <Empty text="Nenhuma zona criada. A capacidade ainda está apenas no nível da unidade." />}</div>
      </Card>
      {canManage ? <form action={saveZone} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-black text-slate-950">Criar zona</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><UnitSelect units={manageableUnits}/><Label text="Código"><input name="code" className={field} required placeholder="A" /></Label><Label text="Nome"><input name="name" className={field} required placeholder="Rotatividade frente" /></Label><Label text="Capacidade"><input name="capacity" type="number" min="1" className={field} required /></Label><Label text="Tipo"><select name="zoneType" className={field} defaultValue="FLEX"><option value="ROTATION">Rotatividade</option><option value="FLEX">Flexível</option><option value="MONTHLY">Mensalistas</option><option value="RESERVED">Reservada</option></select></Label><Label text="Prioridade"><input name="priority" type="number" min="1" max="100" defaultValue="50" className={field} required /></Label></div><input type="hidden" name="active" value="true" /><button className="mt-4 h-11 w-full rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700">Salvar zona</button></form> : null}
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <Card title="Perfil econômico da unidade" subtitle="Base para custo por vaga, receita por m² e futuro break-even.">
        <div className="space-y-3">{units.map((unit)=><div key={unit.id} className="rounded-2xl bg-slate-50 p-4 text-sm"><div className="font-bold text-slate-900">{unit.name}</div><div className="mt-1 text-slate-500">{unit.capacity ?? 0} vagas · {unit.area_sqm ?? "área não informada"}{unit.area_sqm ? " m²" : ""} · custo fixo {unit.monthly_fixed_cost==null ? "não informado" : money(Number(unit.monthly_fixed_cost))}</div></div>)}</div>
        {canManage && <form action={saveUnitCommercialProfile} className="mt-4 grid gap-3 sm:grid-cols-3"><UnitSelect units={manageableUnits}/><Label text="Área útil (m²)"><input name="areaSqm" type="number" min="1" step="0.01" className={field}/></Label><Label text="Custo fixo mensal"><input name="monthlyFixedCost" type="number" min="0" step="0.01" className={field}/></Label><button className="h-10 rounded-xl bg-slate-950 font-bold text-white sm:col-span-3">Atualizar perfil econômico</button></form>}
      </Card>
      <Card title="Calendário operacional" subtitle="Feriados e datas especiais usados pelas regras dos planos.">
        <div className="space-y-2">{calendar.length ? calendar.map((item)=><div key={`${item.unit_id}-${item.calendar_date}`} className="flex justify-between rounded-xl border border-slate-100 p-3 text-sm"><span className="font-semibold text-slate-800">{item.calendar_date} · {item.label}</span><span className="text-slate-500">{item.is_holiday ? "feriado" : "data especial"}</span></div>) : <Empty text="Nenhuma data futura cadastrada." />}</div>
        {canManage && <form action={saveCalendarDate} className="mt-4 grid gap-3 sm:grid-cols-2"><UnitSelect units={manageableUnits}/><Label text="Data"><input name="date" type="date" min={today} className={field} required/></Label><Label text="Descrição"><input name="label" className={field} required placeholder="Ex.: Feriado municipal"/></Label><Label text="Tipo"><select name="isHoliday" className={field} defaultValue="true"><option value="true">Feriado</option><option value="false">Data especial</option></select></Label><button className="h-10 rounded-xl bg-blue-600 font-bold text-white sm:col-span-2">Salvar no calendário</button></form>}
      </Card>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <Card title="Contratos empresariais" subtitle="B2B com placas cadastradas, simultaneidade e vagas garantidas.">
        <div className="space-y-3">{business.length ? business.map((contract)=>{
          const contractLinks=links.filter((link)=>link.contract_id===contract.id && (!link.valid_until || link.valid_until>=today));
          return <div key={contract.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-900">{contract.name}</div><div className="mt-1 text-xs text-slate-500">{contract.status} · {contractLinks.length}/{contract.max_registered_vehicles} placas · {contract.max_simultaneous_vehicles} simultâneos · {contract.guaranteed_spaces} garantidas</div></div><div className="font-black text-slate-950">{money(contract.price)}</div></div>{contractLinks.length>0 && <div className="mt-3 flex flex-wrap gap-2">{contractLinks.map((link)=>{const vehicle=vehicles.find((v)=>v.id===link.vehicle_id); return <form action={detachBusinessVehicle} key={link.id} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs"><span>{vehicle?.normalized_plate ?? "Placa"}</span><input type="hidden" name="unitId" value={contract.unit_id}/><input type="hidden" name="linkId" value={link.id}/><input type="hidden" name="validUntil" value={today}/><button className="font-bold text-red-600">remover</button></form>})}</div>}</div>}) : <Empty text="Nenhum contrato B2B nesta unidade." />}</div>
        {canManage && business.length>0 && <form action={attachBusinessVehicle} className="mt-4 grid gap-3 sm:grid-cols-2"><UnitSelect units={manageableUnits}/><Label text="Contrato"><select name="contractId" className={field} required>{business.filter((c)=>manageableUnitIds.includes(c.unit_id) && ["DRAFT","ACTIVE"].includes(c.status)).map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Label><Label text="Placa"><select name="vehicleId" className={field} required>{vehicles.map((v)=><option key={v.id} value={v.id}>{v.normalized_plate} · {v.vehicle_type}</option>)}</select></Label><Label text="Válido desde"><input name="validFrom" type="date" defaultValue={today} className={field} required/></Label><button className="h-10 rounded-xl bg-blue-600 font-bold text-white sm:col-span-2">Vincular placa ao contrato</button></form>}
      </Card>
      {canManage ? <form action={createBusinessContract} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-black text-slate-950">Novo contrato B2B</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><UnitSelect units={manageableUnits}/><Label text="Razão social"><input name="legalName" className={field} required /></Label><Label text="Nome fantasia"><input name="tradeName" className={field} /></Label><Label text="CNPJ"><input name="taxDocument" inputMode="numeric" className={field} placeholder="somente números" /></Label><Label text="Nome do contrato"><input name="contractName" className={field} required placeholder="Plano Empresa" /></Label><Label text="Preço mensal"><input name="price" type="number" min="0.01" step="0.01" className={field} required /></Label><Label text="Início"><input name="startsOn" type="date" defaultValue={today} className={field} required /></Label><Label text="Placas cadastráveis"><input name="maxRegistered" type="number" min="1" defaultValue="5" className={field} required /></Label><Label text="Simultâneos"><input name="maxSimultaneous" type="number" min="1" defaultValue="1" className={field} required /></Label><Label text="Vagas garantidas"><input name="guaranteedSpaces" type="number" min="0" defaultValue="0" className={field} required /></Label></div><button className="mt-4 h-11 w-full rounded-xl bg-slate-950 font-bold text-white">Criar contrato empresarial</button></form> : null}
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <Card title="Aquisição de clientes" subtitle="Registre a primeira origem conhecida para medir CAC sem transformar o sistema em CRM.">
        <div className="space-y-2">{acquisitions.length ? acquisitions.slice(0,10).map((item)=><div key={`${item.unit_id}-${item.customer_id}`} className="rounded-xl border border-slate-100 p-3 text-sm"><b>{item.source}</b>{item.campaign ? ` · ${item.campaign}` : ""}</div>) : <Empty text="Ainda não há clientes atribuídos nos últimos 30 dias." />}</div>
        {canManage && customers.length>0 && <form action={saveAcquisitionSource} className="mt-4 grid gap-3 sm:grid-cols-2"><UnitSelect units={manageableUnits}/><Label text="Cliente"><select name="customerId" className={field} required>{customers.map((c)=><option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</option>)}</select></Label><Label text="Origem"><ChannelSelect name="source"/></Label><Label text="Campanha"><input name="campaign" className={field} placeholder="Opcional"/></Label><button className="h-10 rounded-xl bg-blue-600 font-bold text-white sm:col-span-2">Salvar origem</button></form>}
      </Card>
      <Card title="Investimento de marketing" subtitle="Cruza investimento com clientes atribuídos para gerar CAC observado.">
        <div className="space-y-2">{spend.length ? spend.slice(0,10).map((item,index)=><div key={`${item.unit_id}-${item.period_start}-${index}`} className="flex justify-between rounded-xl border border-slate-100 p-3 text-sm"><span>{item.source}{item.campaign ? ` · ${item.campaign}` : ""}</span><b>{money(Number(item.amount))}</b></div>) : <Empty text="Nenhum investimento registrado nos últimos 30 dias." />}</div>
        {canManage && <form action={saveMarketingSpend} className="mt-4 grid gap-3 sm:grid-cols-2"><UnitSelect units={manageableUnits}/><Label text="Canal"><ChannelSelect name="source"/></Label><Label text="Campanha"><input name="campaign" className={field}/></Label><Label text="Valor"><input name="amount" type="number" min="0" step="0.01" className={field} required/></Label><Label text="Início"><input name="periodStart" type="date" className={field} required/></Label><Label text="Fim"><input name="periodEnd" type="date" className={field} required/></Label><Label text="Observação"><input name="notes" className={field}/></Label><button className="h-10 rounded-xl bg-slate-950 font-bold text-white sm:col-span-2">Registrar investimento</button></form>}
      </Card>
    </section>
  </main>;
}

function Metric({icon:Icon,label,value,detail}:{icon:typeof Building2;label:string;value:string;detail:string}) { return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Icon className="size-4 text-blue-600"/>{label}</div><div className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></article>; }
function Label({text,children}:{text:string;children:React.ReactNode}) { return <label className="text-sm font-semibold text-slate-700">{text}{children}</label>; }
function Empty({text}:{text:string}) { return <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">{text}</div>; }
function Card({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}) { return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-black text-slate-950">{title}</h2><p className="mb-4 mt-1 text-sm text-slate-500">{subtitle}</p>{children}</div>; }
function UnitSelect({units}:{units:Array<{id:string;name:string}>}) { return <Label text="Unidade"><select name="unitId" className={field} required>{units.map((u)=><option key={u.id} value={u.id}>{u.name}</option>)}</select></Label>; }
function ChannelSelect({name}:{name:string}) { return <select name={name} className={field} required>{CHANNELS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>; }
