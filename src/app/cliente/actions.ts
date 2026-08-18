"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CustomerActionState={error?:string;success?:string};

function message(error:string){
  if(error.includes("INVALID_PLATE"))return"Informe uma placa brasileira válida.";
  if(error.includes("VEHICLE_ALREADY_OWNED"))return"Este veículo já está vinculado a outra conta.";
  if(error.includes("MONTHLY_VEHICLE_FORBIDDEN"))return"Selecione um veículo da sua conta.";
  if(error.includes("MONTHLY_PLAN_UNAVAILABLE"))return"Este plano não está disponível para adesão.";
  if(error.includes("MONTHLY_VEHICLE_ALREADY_ATTACHED"))return"Este veículo já está vinculado a uma mensalidade.";
  if(error.includes("MONTHLY_ENROLLMENT_EXISTS"))return"Você já possui uma mensalidade ativa ou aguardando ativação nesta unidade.";
  return"Não foi possível concluir a operação com segurança.";
}

function validCpf(value:string){
  if(!/^\d{11}$/.test(value)||/^(\d)\1{10}$/.test(value))return false;
  const digit=(base:string,factor:number)=>{let sum=0;for(const char of base)sum+=Number(char)*factor--;const mod=(sum*10)%11;return mod===10?0:mod};
  return digit(value.slice(0,9),10)===Number(value[9])&&digit(value.slice(0,10),11)===Number(value[10]);
}
function validCnpj(value:string){
  if(!/^\d{14}$/.test(value)||/^(\d)\1{13}$/.test(value))return false;
  const calc=(base:string,weights:number[])=>{const sum=base.split("").reduce((total,char,index)=>total+Number(char)*weights[index],0);const mod=sum%11;return mod<2?0:11-mod};
  const first=calc(value.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
  const second=calc(value.slice(0,12)+first,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return first===Number(value[12])&&second===Number(value[13]);
}

export async function updateBillingDocument(_:CustomerActionState,formData:FormData):Promise<CustomerActionState>{
  const document=String(formData.get("billingDocument")??"").replace(/\D/g,"");
  if(!validCpf(document)&&!validCnpj(document))return{error:"Informe um CPF ou CNPJ válido."};
  const supabase=await createClient();
  const{data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user)return{error:"Sua sessão expirou. Entre novamente."};
  const{error}=await supabase.from("customer_profiles").update({billing_document:document,updated_at:new Date().toISOString()}).eq("user_id",user.id);
  if(error)return{error:"Não foi possível salvar o CPF/CNPJ com segurança."};
  revalidatePath("/cliente/conta");
  return{success:"CPF/CNPJ salvo para emissão e conciliação de cobranças."};
}

export async function claimVehicle(_:CustomerActionState,formData:FormData):Promise<CustomerActionState>{
  const plate=String(formData.get("plate")??"");
  const vehicleType=String(formData.get("vehicleType")??"");
  if(!["CAR","MOTORCYCLE"].includes(vehicleType))return{error:"Selecione o tipo do veículo."};
  const normalized=plate.toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalized))return{error:"Informe uma placa brasileira válida."};
  const supabase=await createClient();

  const {data:owned,error:ownedError}=await supabase
    .from("vehicles")
    .select("id")
    .eq("normalized_plate",normalized)
    .limit(1);
  if(!ownedError&&owned?.length)return{error:"Este veículo já está vinculado à sua conta."};

  const{error}=await supabase.rpc("claim_customer_vehicle",{raw_plate:plate,target_vehicle_type:vehicleType});
  if(error)return{error:message(error.message)};
  revalidatePath("/cliente/veiculos");revalidatePath("/cliente/mensalidade");
  return{success:"Veículo vinculado à sua conta."};
}

export async function enrollMonthly(_:CustomerActionState,formData:FormData):Promise<CustomerActionState>{
  const planId=String(formData.get("planId")??"");
  const vehicleId=String(formData.get("vehicleId")??"");
  if(!planId||!vehicleId||formData.get("accepted")!=="yes")return{error:"Selecione plano e veículo e aceite as condições."};
  const supabase=await createClient();
  const{error}=await supabase.rpc("create_customer_monthly_enrollment",{target_plan:planId,target_vehicle:vehicleId,request_key:crypto.randomUUID()});
  if(error)return{error:message(error.message)};
  revalidatePath("/cliente/mensalidade");
  return{success:"Adesão criada. Conclua o pagamento para ativar a cobertura."};
}
