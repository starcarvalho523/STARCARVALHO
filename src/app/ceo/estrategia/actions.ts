"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMonthlyUnit } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const num = (form: FormData, key: string) => Number(text(form, key).replace(",", "."));
const optionalNum = (form: FormData,key: string) => { const raw=text(form,key); return raw ? Number(raw.replace(",",".")) : null; };
const fail = (message: string): never => redirect(`/ceo/estrategia?erro=${encodeURIComponent(message)}`);

function friendly(message: string) {
  if (message.includes("ZONE_CAPACITY_EXCEEDS_UNIT")) return "A soma das zonas ultrapassa a capacidade física da unidade.";
  if (message.includes("INVALID_ZONE")) return "Revise nome, código, capacidade, tipo e prioridade da zona.";
  if (message.includes("INVALID_BUSINESS_CONTRACT")) return "Revise os dados e limites do contrato empresarial.";
  if (message.includes("BUSINESS_MAX_VEHICLES_REACHED")) return "O contrato empresarial atingiu o limite de placas cadastradas.";
  if (message.includes("INVALID_CALENDAR_DATE")) return "Revise a data e a descrição do calendário.";
  if (message.includes("INVALID_MARKETING_SPEND")) return "Revise canal, período e valor do investimento de marketing.";
  if (message.includes("INVALID_ACQUISITION_SOURCE")) return "Selecione uma origem de aquisição válida.";
  if (message.includes("CUSTOMER_NOT_RELATED_TO_UNIT")) return "Este cliente ainda não possui relação operacional com a unidade selecionada.";
  if (message.includes("INVALID_UNIT_AREA") || message.includes("INVALID_FIXED_COST")) return "Revise área e custo fixo mensal da unidade.";
  if (message.includes("COMMERCIAL_RESERVED_CAPACITY_EXCEEDED")) return "A capacidade comercial reservada ultrapassa a capacidade física da unidade.";
  if (message.includes("FORBIDDEN") || message.includes("MONTHLY_ADMIN_FORBIDDEN")) return "Você não tem permissão para alterar esta unidade.";
  return "Não foi possível salvar a alteração com segurança.";
}

async function rpcForUnit(unitId:string, rpc:string, args:Record<string,unknown>) {
  await requireMonthlyUnit(unitId,true);
  const supabase=await createClient();
  const { error }=await supabase.rpc(rpc,args);
  if(error) fail(friendly(error.message));
}

export async function saveZone(form: FormData) {
  const unitId = text(form, "unitId");
  try {
    await rpcForUnit(unitId,"upsert_parking_zone",{
      target_zone: text(form, "zoneId") || null,
      target_unit: unitId,
      p_zone_name: text(form, "name"),
      p_zone_code: text(form, "code").toUpperCase(),
      p_zone_capacity: num(form, "capacity"),
      p_zone_type: text(form, "zoneType"),
      p_zone_priority: num(form, "priority"),
      p_zone_active: text(form, "active") !== "false",
    });
  } catch (error) { fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia"); redirect("/ceo/estrategia?sucesso=Zona salva");
}

export async function saveCalendarDate(form:FormData) {
  const unitId=text(form,"unitId");
  try { await rpcForUnit(unitId,"upsert_parking_calendar_date",{target_unit:unitId,target_date:text(form,"date"),target_label:text(form,"label"),target_is_holiday:text(form,"isHoliday")!=="false"}); }
  catch(error){ fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia"); redirect("/ceo/estrategia?sucesso=Calendário atualizado");
}

export async function saveUnitCommercialProfile(form:FormData) {
  const unitId=text(form,"unitId");
  try { await rpcForUnit(unitId,"update_unit_commercial_profile",{target_unit:unitId,target_area_sqm:optionalNum(form,"areaSqm"),target_monthly_fixed_cost:optionalNum(form,"monthlyFixedCost")}); }
  catch(error){ fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia"); redirect("/ceo/estrategia?sucesso=Perfil econômico atualizado");
}

export async function createBusinessContract(form: FormData) {
  const unitId = text(form, "unitId");
  try {
    await rpcForUnit(unitId,"create_business_parking_contract",{
      target_unit: unitId,
      business_legal_name: text(form, "legalName"),
      business_trade_name: text(form, "tradeName"),
      business_tax_document: text(form, "taxDocument"),
      contract_name: text(form, "contractName"),
      contract_price: num(form, "price"),
      contract_starts_on: text(form, "startsOn"),
      contract_max_registered: num(form, "maxRegistered"),
      contract_max_simultaneous: num(form, "maxSimultaneous"),
      contract_guaranteed_spaces: num(form, "guaranteedSpaces"),
    });
  } catch (error) { fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia"); redirect("/ceo/estrategia?sucesso=Contrato empresarial criado");
}

export async function attachBusinessVehicle(form:FormData) {
  const unitId=text(form,"unitId");
  try { await rpcForUnit(unitId,"attach_business_contract_vehicle",{target_contract:text(form,"contractId"),target_vehicle:text(form,"vehicleId"),target_valid_from:text(form,"validFrom")}); }
  catch(error){ fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia"); redirect("/ceo/estrategia?sucesso=Placa empresarial vinculada");
}

export async function detachBusinessVehicle(form:FormData) {
  const unitId=text(form,"unitId");
  try { await rpcForUnit(unitId,"detach_business_contract_vehicle",{target_link:text(form,"linkId"),target_valid_until:text(form,"validUntil")}); }
  catch(error){ fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia"); redirect("/ceo/estrategia?sucesso=Placa empresarial desvinculada");
}

export async function saveAcquisitionSource(form:FormData) {
  const unitId=text(form,"unitId");
  try { await rpcForUnit(unitId,"set_customer_acquisition_source",{target_unit:unitId,target_customer:text(form,"customerId"),target_source:text(form,"source"),target_campaign:text(form,"campaign") || null}); }
  catch(error){ fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia"); redirect("/ceo/estrategia?sucesso=Origem do cliente atualizada");
}

export async function saveMarketingSpend(form:FormData) {
  const unitId=text(form,"unitId");
  try { await rpcForUnit(unitId,"record_marketing_spend",{target_unit:unitId,target_source:text(form,"source"),target_campaign:text(form,"campaign") || null,target_amount:num(form,"amount"),target_period_start:text(form,"periodStart"),target_period_end:text(form,"periodEnd"),target_notes:text(form,"notes") || null}); }
  catch(error){ fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia"); redirect("/ceo/estrategia?sucesso=Investimento de marketing registrado");
}
