export type ActiveSession = { id:string; plate:string; vehicle_type:"CAR"|"MOTORCYCLE"; status:"OPEN"|"PAYMENT_PENDING"|"PAID"|"MANUAL_REVIEW"; entered_at:string; duration_minutes:number; amount:number|null; payment_status:string; tariff_name:string };
export function formatDuration(minutes:number) { const h=Math.floor(minutes/60); const m=minutes%60; return h ? `${h}h ${m}min` : `${m}min`; }
export function formatMoney(value:number|null|undefined) { return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value ?? 0); }
export function formatDateTime(value:string,timezone="America/Bahia") { return new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(new Date(value)); }
