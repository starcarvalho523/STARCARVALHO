export type MonthlyPlanInput={name:string;price:number;dueDay:number;graceDays:number;maxVehicles:number};
export function validateMonthlyPlan(input:MonthlyPlanInput){return input.name.trim().length>=2&&Number.isFinite(input.price)&&input.price>0&&Number.isInteger(input.dueDay)&&input.dueDay>=1&&input.dueDay<=31&&Number.isInteger(input.graceDays)&&input.graceDays>=0&&input.graceDays<=90&&Number.isInteger(input.maxVehicles)&&input.maxVehicles>=1&&input.maxVehicles<=100;}
export function isMonthlyOverdue(status:string,graceUntil:string,today:string){return status==="PENDING"&&graceUntil<today;}
