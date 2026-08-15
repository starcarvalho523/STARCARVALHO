"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOperatorContext } from "@/lib/operator-data";

export type ExitReceipt={plate:string;amount:number;method:string;exitedAt:string};
export type OperatorActionState={error?:string;success?:string;sessionId?:string;receipt?:ExitReceipt;relatedMessage?:string;relatedHref?:string;monthlyDecisionRequired?:boolean;coverageReason?:string;plate?:string;vehicleType?:string};

function humanError(message:string){
  if(message.includes("MONTHLY_ENTRY_DECISION_REQUIRED"))return "A mensalidade não cobre esta entrada. Escolha cobrar como avulso ou solicite uma autorização.";
  if(message.includes("MONTHLY_AUTHORIZATION_ALREADY_OPEN"))return "Já existe uma solicitação de autorização aberta para este veículo.";
  if(message.includes("MONTHLY_AUTHORIZATION_INVALID"))return "A autorização não é válida, expirou ou pertence a outro veículo ou unidade.";
  if(message.includes("PAYMENT_METHOD_NOT_AVAILABLE"))return "Este meio de pagamento não está habilitado para esta unidade.";
  const errors:Record<string,string>={PARKING_FULL:"O pátio atingiu a capacidade máxima. Não é possível registrar outra entrada.",INVALID_PLATE:"Informe uma placa brasileira válida.",NO_ACTIVE_TARIFF:"Esta unidade não possui uma tarifa ativa configurada para este veículo.",ACTIVE_SESSION_EXISTS:"Este veículo já possui uma estadia ativa.",CASH_SHIFT_REQUIRED:"Abra o caixa do turno antes de registrar pagamentos.",PIX_PROVIDER_NOT_CONFIGURED:"PIX integrado ainda não configurado.",PAYMENT_REQUIRED:"O pagamento precisa estar confirmado antes da saída.",EXIT_NOT_STARTED:"Inicie a saída antes de registrar o pagamento.",INVALID_SESSION_STATE:"Esta operação não é permitida no estado atual.",SHIFT_NOT_OPEN:"Este caixa não está aberto.",INVALID_AMOUNT:"Informe um valor válido.",OPERATOR_FORBIDDEN:"Você não possui permissão operacional nesta unidade.",CLOSING_NOTES_REQUIRED:"Explique a divergência antes de fechar o caixa.",AUTHORIZATION_REASON_REQUIRED:"Informe uma justificativa com pelo menos 5 caracteres."};
  return Object.entries(errors).find(([key])=>message.includes(key))?.[1]??"Não foi possível concluir a operação. Tente novamente.";
}
function refresh(){["/frentista","/frentista/entradas","/frentista/saidas","/frentista/veiculos","/frentista/pagamentos","/frentista/caixa"].forEach(path=>revalidatePath(path));}

export async function registerEntry(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{
  const plate=String(formData.get("plate")??"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);
  const vehicleType=String(formData.get("vehicleType")??"CAR");const entryDecision=String(formData.get("entryDecision")??"REQUIRE_DECISION");
  if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))return{error:"Informe uma placa brasileira válida."};
  const{unitId}=await getOperatorContext();const supabase=await createClient();
  const[{data:lastStay},{data:unit}]=await Promise.all([
    supabase.from("parking_sessions").select("id,exited_at").eq("unit_id",unitId).eq("plate_snapshot",plate).eq("status","EXITED").order("exited_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("parking_units").select("timezone").eq("id",unitId).single(),
  ]);
  const{data,error}=await supabase.rpc("register_parking_entry_with_coverage",{target_unit:unitId,raw_plate:plate,target_vehicle_type:vehicleType,uncovered_action:entryDecision,authorization_id:null});
  if(error){
    if(error.message.includes("ACTIVE_SESSION_EXISTS")){const{data:active}=await supabase.from("parking_sessions").select("id").eq("unit_id",unitId).eq("plate_snapshot",plate).in("status",["OPEN","PAYMENT_PENDING","PAID","MANUAL_REVIEW"]).order("entered_at",{ascending:false}).limit(1).maybeSingle();return{error:humanError(error.message),relatedHref:active?`/frentista/saidas?session=${active.id}`:undefined,relatedMessage:active?"Abrir sessão ativa":undefined};}
    if(error.message.includes("MONTHLY_ENTRY_DECISION_REQUIRED"))return{error:humanError(error.message),monthlyDecisionRequired:true,coverageReason:error.message.split(":").at(-1),plate,vehicleType};
    return{error:humanError(error.message)};
  }
  refresh();const result=data as {session_id?:string;entry_mode?:string};
  return{success:`Entrada de ${plate} registrada${result?.entry_mode&&result.entry_mode!=="CASUAL"?" como mensalista":""}.`,sessionId:String(result?.session_id??""),relatedMessage:lastStay?.exited_at?`Última estadia finalizada em ${new Intl.DateTimeFormat("pt-BR",{timeZone:unit?.timezone??"America/Bahia",dateStyle:"short",timeStyle:"short"}).format(new Date(lastStay.exited_at))}.`:undefined,relatedHref:lastStay?`/frentista/historico?q=${plate}&status=all&period=30&session=${lastStay.id}`:undefined};
}

export async function requestMonthlyEntryAuthorization(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{
  const plate=String(formData.get("plate")??"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);const reason=String(formData.get("reason")??"").trim();
  const{unitId}=await getOperatorContext();const supabase=await createClient();const{error}=await supabase.rpc("request_monthly_entry_authorization",{target_unit:unitId,raw_plate:plate,reason_text:reason});
  if(error)return{error:humanError(error.message),plate};refresh();return{success:"Autorização solicitada ao responsável. A entrada ainda não foi registrada.",plate};
}

export async function startExit(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const id=String(formData.get("sessionId")??"");await getOperatorContext();const supabase=await createClient();const{error}=await supabase.rpc("start_parking_exit",{session_id:id});if(error)return{error:humanError(error.message)};refresh();return{success:"Saída iniciada. Valor devido fixado."};}
export async function recordPayment(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const id=String(formData.get("sessionId")??"");const method=String(formData.get("method")??"");await getOperatorContext();const supabase=await createClient();const{error}=await supabase.rpc("record_manual_payment",{session_id:id,payment_method:method,request_key:crypto.randomUUID()});if(error)return{error:humanError(error.message)};refresh();return{success:"Pagamento registrado."};}
export async function completeExit(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const id=String(formData.get("sessionId")??"");await getOperatorContext();const supabase=await createClient();const{error}=await supabase.rpc("complete_parking_exit",{session_id:id});if(error)return{error:humanError(error.message)};const{data}=await supabase.from("parking_sessions").select("exited_at,total_amount,final_amount,financial_obligation,vehicles(plate),payments(method,paid_at)").eq("id",id).single();const vehicle=Array.isArray(data?.vehicles)?data.vehicles[0]:data?.vehicles;const payments=Array.isArray(data?.payments)?data.payments:[];const payment=payments.find(item=>item.paid_at)??payments[0];refresh();return{success:"Saída liberada e registrada.",receipt:{plate:vehicle?.plate??"—",amount:Number(data?.final_amount??data?.total_amount??0),method:data?.financial_obligation==="WAIVED_BY_MONTHLY_COVERAGE"?"Mensalista":payment?.method??"—",exitedAt:data?.exited_at??new Date().toISOString()}};}
export async function openShift(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const amount=Number(String(formData.get("openingAmount")??"").replace(",","."));if(!Number.isFinite(amount)||amount<=0)return{error:"Informe um saldo inicial maior que R$ 0,00."};const{unitId}=await getOperatorContext();const supabase=await createClient();const{error}=await supabase.rpc("open_cash_shift",{target_unit:unitId,initial_amount:amount});if(error)return{error:humanError(error.message)};refresh();return{success:"Caixa aberto com sucesso."};}
export async function closeShift(_:OperatorActionState,formData:FormData):Promise<OperatorActionState>{const shiftId=String(formData.get("shiftId")??"");const amount=Number(String(formData.get("declaredAmount")??"").replace(",","."));if(!Number.isFinite(amount)||amount<0)return{error:"Informe o dinheiro contado."};await getOperatorContext();const supabase=await createClient();const{data,error}=await supabase.rpc("close_cash_shift",{shift_id:shiftId,declared_amount:amount,closing_notes:String(formData.get("notes")??"")||null});if(error)return{error:humanError(error.message)};refresh();return{success:`Caixa fechado. Diferença: ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(data))}.`};}
