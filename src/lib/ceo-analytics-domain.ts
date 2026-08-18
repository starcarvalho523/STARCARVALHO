export type ContractRow = { id:string; unit_id:string; status:string; contracted_price:number|string|null; starts_on:string|null; cancel_at_period_end:boolean };
export type CoverageSession = { vehicle_id:string|null; entry_mode:string; financial_obligation:string; monthly_subscription_id:string|null; monthly_billing_period_id:string|null; monthly_coverage_reason:string|null; theoretical_amount:number|string|null };
export type MonthlyPeriodRow = { id:string; subscription_id:string; unit_id:string; reference_year:number; reference_month:number; due_date:string; grace_until:string; status:string };
export type GenerationRunRow = { id:string; unit_id:string; failed_count:number; started_at:string; finished_at:string|null };

export function previousRevenueTotal<T extends {amount:number|string}>(rows:T[],isOperational:(row:T)=>boolean){return rows.filter(isOperational).reduce((sum,row)=>sum+Number(row.amount),0)}

export function contractedMrr(rows:ContractRow[]){
  const active=rows.filter(row=>row.status==="ACTIVE"),suspended=rows.filter(row=>row.status==="SUSPENDED");
  const activeAmount=active.reduce((sum,row)=>sum+Number(row.contracted_price??0),0);
  return{amount:activeAmount,activeAmount,suspendedAmount:suspended.reduce((sum,row)=>sum+Number(row.contracted_price??0),0),contracts:active.length,suspendedContracts:suspended.length};
}

export function coverageAnalytics(rows:CoverageSession[]){
  const covered=rows.filter(row=>row.financial_obligation==="WAIVED_BY_MONTHLY_COVERAGE"&&Boolean(row.monthly_subscription_id)&&Boolean(row.monthly_coverage_reason));
  const casual=rows.filter(row=>row.entry_mode==="CASUAL"&&row.financial_obligation==="REQUIRED");
  const subscriptions=new Set(covered.map(row=>row.monthly_subscription_id!));
  const vehicles=new Set(covered.map(row=>row.vehicle_id).filter(Boolean));
  const total=covered.length+casual.length;
  return{coveredStays:covered.length,monthlyEntries:covered.length,monthlyVehiclesUsed:vehicles.size,theoreticalWaived:covered.reduce((sum,row)=>sum+Number(row.theoretical_amount??0),0),averageStaysPerSubscriber:subscriptions.size?covered.length/subscriptions.size:0,monthlyShare:total?covered.length/total*100:0,casualShare:total?casual.length/total*100:0,casualEntries:casual.length};
}

export type MonthlyAlertSeed={id:string;category:"Financeiro";severity:"Info"|"Atenção"|"Crítico";unitId:string;at:string;title:string;description:string;href:string};
export function monthlyAlertSeeds(contracts:ContractRow[],periods:MonthlyPeriodRow[],runs:GenerationRunRow[],now=new Date()):MonthlyAlertSeed[]{
  const today=now.toISOString().slice(0,10);const soon=new Date(`${today}T00:00:00Z`);soon.setUTCDate(soon.getUTCDate()+3);const soonDate=soon.toISOString().slice(0,10);const out:MonthlyAlertSeed[]=[];
  const contractById=new Map(contracts.map(contract=>[contract.id,contract]));
  for(const period of periods.filter(row=>row.status==="PENDING")){
    const contract=contractById.get(period.subscription_id);const firstActivation=contract?.status==="PENDING_ACTIVATION";const month=`${String(period.reference_month).padStart(2,"0")}/${period.reference_year}`;const href=firstActivation&&contract?`/ceo/mensalistas/${contract.id}`:"/ceo/mensalistas/inadimplentes";
    if(period.due_date<today){
      if(firstActivation)out.push({id:`monthly-activation-overdue-${period.id}`,category:"Financeiro",severity:period.grace_until<today?"Crítico":"Atenção",unitId:period.unit_id,at:`${period.due_date}T12:00:00Z`,title:"Primeiro pagamento pendente",description:`Primeiro pagamento de ${month} vencido${period.grace_until>=today?" e ainda dentro da tolerância":" com prazo de tolerância encerrado"}.`,href});
      else out.push({id:`monthly-overdue-${period.id}`,category:"Financeiro",severity:period.grace_until<today?"Crítico":"Atenção",unitId:period.unit_id,at:`${period.due_date}T12:00:00Z`,title:"Mensalidade vencida",description:`Mensalidade de ${month} vencida${period.grace_until>=today?" e ainda dentro da tolerância":" fora da tolerância"}.`,href});
    }else if(period.due_date<=soonDate){
      if(firstActivation)out.push({id:`monthly-activation-due-${period.id}`,category:"Financeiro",severity:"Info",unitId:period.unit_id,at:`${period.due_date}T12:00:00Z`,title:"Primeiro pagamento próximo",description:`Primeiro pagamento de ${month} vence em breve.`,href});
      else out.push({id:`monthly-due-${period.id}`,category:"Financeiro",severity:"Info",unitId:period.unit_id,at:`${period.due_date}T12:00:00Z`,title:"Mensalidade vencendo",description:`Mensalidade de ${month} vence em breve.`,href});
    }
  }
  for(const contract of contracts){if(contract.status==="SUSPENDED")out.push({id:`monthly-suspended-${contract.id}`,category:"Financeiro",severity:"Atenção",unitId:contract.unit_id,at:`${today}T12:00:00Z`,title:"Mensalista suspenso",description:"Contrato suspenso requer acompanhamento da gestão.",href:`/ceo/mensalistas/${contract.id}`});if(contract.cancel_at_period_end&&(contract.status==="ACTIVE"||contract.status==="SUSPENDED"))out.push({id:`monthly-cancel-${contract.id}`,category:"Financeiro",severity:"Info",unitId:contract.unit_id,at:`${today}T12:00:00Z`,title:"Cancelamento no fim do período",description:"Contrato marcado para cancelamento ao término da mensalidade.",href:`/ceo/mensalistas/${contract.id}`})}
  const latestRuns=new Map<string,GenerationRunRow>();for(const run of [...runs].sort((a,b)=>b.started_at.localeCompare(a.started_at)))if(!latestRuns.has(run.unit_id))latestRuns.set(run.unit_id,run);for(const run of latestRuns.values())if(run.failed_count>0)out.push({id:`monthly-generation-${run.id}`,category:"Financeiro",severity:"Crítico",unitId:run.unit_id,at:run.finished_at??run.started_at,title:"Falha na geração mensal",description:`A última geração registrou ${run.failed_count} ${run.failed_count===1?"falha":"falhas"}.`,href:"/ceo/mensalistas/automacao"});
  const year=now.getUTCFullYear(),month=now.getUTCMonth()+1,periodKeys=new Set(periods.filter(p=>p.reference_year===year&&p.reference_month===month).map(p=>p.subscription_id));for(const contract of contracts.filter(c=>(c.status==="ACTIVE"||c.status==="SUSPENDED")&&Boolean(c.starts_on)&&c.starts_on!<=today&&!periodKeys.has(c.id)))out.push({id:`monthly-missing-${contract.id}`,category:"Financeiro",severity:"Atenção",unitId:contract.unit_id,at:`${today}T12:00:00Z`,title:"Mensalidade mensal ausente",description:`Contrato ativo sem mensalidade gerada para ${String(month).padStart(2,"0")}/${year}.`,href:"/ceo/mensalistas/automacao"});
  return out;
}
