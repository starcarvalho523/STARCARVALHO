export type CoverageReason="ACTIVE_PAID"|"ACTIVE_WITHIN_GRACE"|"OVERDUE_OUTSIDE_GRACE"|"SUBSCRIPTION_SUSPENDED"|"SUBSCRIPTION_CANCELED"|"SUBSCRIPTION_ENDED"|"NO_BILLING_PERIOD"|"VEHICLE_NOT_COVERED";
export type EntryMode="CASUAL"|"MONTHLY"|"MONTHLY_GRACE"|"MONTHLY_EXCEPTION";
export type FinancialObligation="REQUIRED"|"WAIVED_BY_MONTHLY_COVERAGE";
export function coveragePresentation(reason:CoverageReason){
  if(reason==="ACTIVE_PAID")return{label:"Mensalista ativo",tone:"green",covered:true,mode:"MONTHLY" as EntryMode};
  if(reason==="ACTIVE_WITHIN_GRACE")return{label:"Mensalista em carência",tone:"amber",covered:true,mode:"MONTHLY_GRACE" as EntryMode};
  if(reason==="OVERDUE_OUTSIDE_GRACE")return{label:"Mensalidade vencida",tone:"red",covered:false,mode:"CASUAL" as EntryMode};
  if(reason==="SUBSCRIPTION_SUSPENDED")return{label:"Assinatura suspensa",tone:"red",covered:false,mode:"CASUAL" as EntryMode};
  if(reason==="SUBSCRIPTION_CANCELED"||reason==="SUBSCRIPTION_ENDED")return{label:"Assinatura encerrada",tone:"slate",covered:false,mode:"CASUAL" as EntryMode};
  if(reason==="NO_BILLING_PERIOD")return{label:"Competência pendente de revisão",tone:"amber",covered:false,mode:"CASUAL" as EntryMode};
  return{label:"Veículo avulso",tone:"slate",covered:false,mode:"CASUAL" as EntryMode};
}
