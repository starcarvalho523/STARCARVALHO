const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;

export function addCalendarDaysIso(date:string,days:number){
  if(!ISO_DATE.test(date))throw new Error("INVALID_RECURRING_DUE_DATE");
  const parsed=new Date(`${date}T00:00:00.000Z`);
  if(Number.isNaN(parsed.getTime()))throw new Error("INVALID_RECURRING_DUE_DATE");
  parsed.setUTCDate(parsed.getUTCDate()+days);
  return parsed.toISOString().slice(0,10);
}

export function nextUngeneratedThirtyDayDueDate(localNextDueDate:string,generatedDueDates:readonly (string|null|undefined)[],todayIso:string){
  if(!ISO_DATE.test(localNextDueDate)||!ISO_DATE.test(todayIso))throw new Error("INVALID_RECURRING_DUE_DATE");
  const validGenerated=generatedDueDates.filter((value):value is string=>typeof value==="string"&&ISO_DATE.test(value));
  const latestGenerated=validGenerated.length?validGenerated.sort().at(-1)!:null;
  let candidate=localNextDueDate;
  while(candidate<=todayIso||(latestGenerated!==null&&candidate<=latestGenerated)){
    candidate=addCalendarDaysIso(candidate,30);
  }
  return candidate;
}
