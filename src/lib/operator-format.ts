export type ActiveSession = { id:string; plate:string; vehicle_type:"CAR"|"MOTORCYCLE"; status:"OPEN"|"PAYMENT_PENDING"|"PAID"|"MANUAL_REVIEW"; entered_at:string; duration_minutes:number; amount:number|null; payment_status:string; tariff_name:string };
export type StatusTone = "blue"|"amber"|"green"|"slate"|"red";
const parkingStatuses:Record<string,{label:string;tone:StatusTone}>={OPEN:{label:"Estacionado",tone:"blue"},PAYMENT_PENDING:{label:"Aguardando pagamento",tone:"amber"},PAID:{label:"Pago — aguardando saída",tone:"green"},EXITED:{label:"Finalizado",tone:"slate"},CANCELLED:{label:"Cancelado",tone:"red"},MANUAL_REVIEW:{label:"Em revisão",tone:"amber"}};
const paymentStatuses:Record<string,{label:string;tone:StatusTone}>={PENDING:{label:"Pendente",tone:"amber"},PAID:{label:"Pago",tone:"green"},FAILED:{label:"Falhou",tone:"red"},CANCELLED:{label:"Cancelado",tone:"red"},REFUNDED:{label:"Estornado",tone:"slate"}};
export function parkingStatus(value:string){return parkingStatuses[value]??{label:value,tone:"slate" as const}}
export function paymentStatus(value:string){return paymentStatuses[value]??{label:value,tone:"slate" as const}}
export function formatParkingStatus(value:string){return parkingStatus(value).label}
export function formatPaymentStatus(value:string){return paymentStatus(value).label}
export function formatPaymentMethod(value:string,manual=false){if(value==="CASH")return "Dinheiro";if(value==="CARD")return manual?"Cartão — legado manual":"Cartão — legado";if(value==="DEBIT_CARD")return "Cartão de débito";if(value==="CREDIT_CARD")return "Cartão de crédito";if(value==="PIX")return "PIX";return value}
export function formatPaymentChannel(value:string){return ({MANUAL:"Manual",QR:"QR Code",HOSTED_CHECKOUT:"Checkout online",POINT:"Point",TAP:"Tap"} as Record<string,string>)[value]??value}
export function formatPaymentProvider(value:string|null|undefined){return ({INTERNAL:"Interno",ASAAS:"Asaas",MERCADO_PAGO:"Mercado Pago"} as Record<string,string>)[value??""]??"Não informado"}
export function formatVehicleType(value:string){return value==="CAR"?"Carro":value==="MOTORCYCLE"?"Moto":value}
export function formatSubscriptionStatus(value:string){return ({ACTIVE:"Ativo",EXPIRED:"Expirado",CANCELLED:"Cancelado",SUSPENDED:"Suspenso",PENDING:"Pendente"} as Record<string,string>)[value]??"Status desconhecido"}
export function formatDuration(minutes:number) { const h=Math.floor(minutes/60); const m=minutes%60; return h ? `${h}h ${m}min` : `${m}min`; }
export function formatMoney(value:number|null|undefined) { return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value ?? 0); }
export function formatDateTime(value:string,timezone="America/Bahia") { return new Intl.DateTimeFormat("pt-BR",{timeZone:timezone,dateStyle:"short",timeStyle:"short"}).format(new Date(value)); }

