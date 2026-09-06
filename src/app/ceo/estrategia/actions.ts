"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMonthlyUnit } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const num = (form: FormData, key: string) => Number(text(form, key).replace(",", "."));
const fail = (message: string): never => redirect(`/ceo/estrategia?erro=${encodeURIComponent(message)}`);

function friendly(message: string) {
  if (message.includes("ZONE_CAPACITY_EXCEEDS_UNIT")) return "A soma das zonas ultrapassa a capacidade física da unidade.";
  if (message.includes("INVALID_ZONE")) return "Revise nome, código, capacidade, tipo e prioridade da zona.";
  if (message.includes("INVALID_BUSINESS_CONTRACT")) return "Revise os dados e limites do contrato empresarial.";
  if (message.includes("FORBIDDEN")) return "Você não tem permissão para alterar esta unidade.";
  return "Não foi possível salvar a alteração com segurança.";
}

export async function saveZone(form: FormData) {
  const unitId = text(form, "unitId");
  try {
    await requireMonthlyUnit(unitId, true);
    const supabase = await createClient();
    const { error } = await supabase.rpc("upsert_parking_zone", {
      target_zone: text(form, "zoneId") || null,
      target_unit: unitId,
      p_zone_name: text(form, "name"),
      p_zone_code: text(form, "code").toUpperCase(),
      p_zone_capacity: num(form, "capacity"),
      p_zone_type: text(form, "zoneType"),
      p_zone_priority: num(form, "priority"),
      p_zone_active: text(form, "active") !== "false",
    });
    if (error) fail(friendly(error.message));
  } catch (error) { fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia");
  redirect("/ceo/estrategia?sucesso=Zona salva");
}

export async function createBusinessContract(form: FormData) {
  const unitId = text(form, "unitId");
  try {
    await requireMonthlyUnit(unitId, true);
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_business_parking_contract", {
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
    if (error) fail(friendly(error.message));
  } catch (error) { fail(friendly(error instanceof Error ? error.message : "")); }
  revalidatePath("/ceo/estrategia");
  redirect("/ceo/estrategia?sucesso=Contrato empresarial criado");
}
