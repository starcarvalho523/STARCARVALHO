"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOperatorContext } from "@/lib/operator-data";
export type ExitReceipt = { plate:string; amount:number; method:string; exitedAt:string };
export type OperatorActionState = { error?:string; success?:string; sessionId?:string; receipt?:ExitReceipt; relatedMessage?:string; relatedHref?:string };
function humanError(message:string):string {
  const errors:Record<string,string>={PARKING_FULL:"O pátio atingiu a capacidade máxima. Não é possível registrar outra entrada.",INVALID_PLATE:"Informe uma placa brasileira válida.",NO_ACTIVE_TARIFF:"Esta unidade não possui uma tarifa ativa configurada para este veículo.",ACTIVE_SESSION_EXISTS:"Este veículo já possui uma estadia ativa.",CASH_SHIFT_REQUIRED:"Abra o caixa do turno antes de registrar pagamentos.",PIX_PROVIDER_NOT_CONFIGURED:"PIX integrado ainda não configurado.",PAYMENT_REQUIRED:"O pagamento precisa estar confirmado antes da saída.",EXIT_NOT_STARTED:"Inicie a saída antes de registrar o pagamento.",INVALID_SESSION_STATE:"Esta operação não é permitida no estado atual.",SHIFT_NOT_OPEN:"Este caixa não está aberto.",INVALID_AMOUNT:"Informe um valor válido.",OPERATOR_FORBIDDEN:"Você não possui permissão operacional nesta unidade.",CLOSING_NOTES_REQUIRED:"Explique a divergência antes de fechar o caixa."};
  return Object.entries(errors).find(([key])=>message.includes(key))?.[1] ?? "Não foi possível concluir a operação. Tente novamente.";
}
function refresh() { ["/frentista","/frentista/entradas","/frentista/saidas","/frentista/veiculos","/frentista/pagamentos","/frentista/caixa"].forEach((path)=>revalidatePath(path)); }
export async function registerEntry(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{
  const plate=String(formData.get("plate")??"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7); const vehicleType=String(formData.get("vehicleType")??"CAR");
  if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) return{error:"Informe uma placa brasileira válida."};
  const {unitId}=await getOperatorContext(); const supabase=await createClient();
  const [{data:lastStay},{data:unit}]=await Promise.all([
    supabase.from("parking_sessions").select("id,exited_at").eq("unit_id",unitId).eq("plate_snapshot",plate).eq("status","EXITED").order("exited_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("parking_units").select("timezone").eq("id",unitId).single(),
  ]);
  const {data,error}=await supabase.rpc("register_parking_entry",{target_unit:unitId,raw_plate:plate,target_vehicle_type:vehicleType});
  if(error){if(error.message.includes("ACTIVE_SESSION_EXISTS")){const{data:active}=await supabase.from("parking_sessions").select("id").eq("unit_id",unitId).eq("plate_snapshot",plate).in("status",["OPEN","PAYMENT_PENDING","PAID","MANUAL_REVIEW"]).order("entered_at",{ascending:false}).limit(1).maybeSingle();return{error:humanError(error.message),relatedHref:active?`/frentista/saidas?session=${active.id}`:undefined,relatedMessage:active?"Abrir sessão ativa":undefined}}return{error:humanError(error.message)}}
  refresh();
  return{success:`Entrada de ${plate} registrada.`,sessionId:String(data),relatedMessage:lastStay?.exited_at?`Última estadia finalizada em ${new Intl.DateTimeFormat("pt-BR",{timeZone:unit?.timezone??"America/Bahia",dateStyle:"short",timeStyle:"short"}).format(new Date(lastStay.exited_at))}.`:undefined,relatedHref:lastStay?`/frentista/historico?q=${plate}&status=all&period=30&session=${lastStay.id}`:undefined};
}
export async function startExit(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const id=String(formData.get("sessionId")??""); await getOperatorContext(); const supabase=await createClient(); const{error}=await supabase.rpc("start_parking_exit",{session_id:id});if(error)return{error:humanError(error.message)};refresh();return{success:"Saída iniciada. Cobrança calculada."};}
export async function recordPayment(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const id=String(formData.get("sessionId")??"");const method=String(formData.get("method")??"");await getOperatorContext();const supabase=await createClient();const{error}=await supabase.rpc("record_manual_payment",{session_id:id,payment_method:method,request_key:crypto.randomUUID()});if(error)return{error:humanError(error.message)};refresh();return{success:"Pagamento registrado."};}
export async function completeExit(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{
  const id=String(formData.get("sessionId")??""); await getOperatorContext(); const supabase=await createClient();
  const{error}=await supabase.rpc("complete_parking_exit",{session_id:id}); if(error)return{error:humanError(error.message)};
  const{data}=await supabase.from("parking_sessions").select("exited_at,total_amount,vehicles(plate),payments(method,paid_at)").eq("id",id).single();
  const vehicle=Array.isArray(data?.vehicles)?data.vehicles[0]:data?.vehicles; const payments=Array.isArray(data?.payments)?data.payments:[];
  const payment=payments.find((item)=>item.paid_at)??payments[0]; refresh();
  return{success:"Saída liberada e registrada.",receipt:{plate:vehicle?.plate??"—",amount:Number(data?.total_amount??0),method:payment?.method??"—",exitedAt:data?.exited_at??new Date().toISOString()}};
}
export async function openShift(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const amount=Number(String(formData.get("openingAmount")??"0").replace(",","."));if(!Number.isFinite(amount)||amount<0)return{error:"Informe um saldo inicial válido."};const{unitId}=await getOperatorContext();const supabase=await createClient();const{error}=await supabase.rpc("open_cash_shift",{target_unit:unitId,initial_amount:amount});if(error)return{error:humanError(error.message)};refresh();return{success:"Caixa aberto com sucesso."};}
export async function closeShift(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const shiftId=String(formData.get("shiftId")??"");const amount=Number(String(formData.get("declaredAmount")??"").replace(",","."));if(!Number.isFinite(amount)||amount<0)return{error:"Informe o dinheiro contado."};await getOperatorContext();const supabase=await createClient();const{data,error}=await supabase.rpc("close_cash_shift",{shift_id:shiftId,declared_amount:amount,closing_notes:String(formData.get("notes")??"")||null});if(error)return{error:humanError(error.message)};refresh();return{success:`Caixa fechado. Diferença: ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(data))}.`};}

