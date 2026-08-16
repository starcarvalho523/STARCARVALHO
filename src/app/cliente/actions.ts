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
