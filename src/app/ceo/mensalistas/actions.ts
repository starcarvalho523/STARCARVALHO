"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMonthlyUnit } from "@/lib/monthly-admin";
import { createClient } from "@/lib/supabase/server";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const num = (form: FormData, key: string) => Number(text(form, key).replace(",", "."));
const optionalNum = (form: FormData, key: string) => { const raw=text(form,key); return raw ? Number(raw.replace(",",".")) : null; };
const checked = (form: FormData, key: string) => text(form,key) === "true";
const fail = (message: string, path: string): never => redirect(`${path}?erro=${encodeURIComponent(message)}`);

function friendly(message: string) {
  if (message.includes("MONTHLY_ADMIN_FORBIDDEN") || message.includes("MONTHLY_FORBIDDEN")) return "Você não tem permissão para administrar mensalistas nesta unidade.";
  if (message.includes("MONTHLY_PLAN_UNAVAILABLE")) return "O plano selecionado não está disponível.";
  if (message.includes("MONTHLY_CUSTOMER_NOT_FOUND")) return "Cliente não encontrado ou inativo.";
  if (message.includes("one_live_customer")) return "Este cliente já possui uma assinatura ativa ou suspensa nesta unidade.";
  if (message.includes("MONTHLY_VEHICLE_CUSTOMER_MISMATCH")) return "O veículo não pertence ao cliente desta assinatura.";
  if (message.includes("MONTHLY_MAX_VEHICLES_REACHED")) return "O limite de veículos do plano foi atingido.";
  if (message.includes("MONTHLY_INVALID_STATUS_TRANSITION")) return "Esta alteração de status não é permitida.";
  if (message.includes("MONTHLY_INVALID_PLAN")) return "As regras comerciais do plano são incompatíveis. Revise simultaneidade, horários e capacidade reservada.";
  return "Não foi possível concluir a operação com segurança.";
}

export async function createPlan(form: FormData) {
  const path = "/ceo/mensalistas/planos";
  const unitId = text(form, "unitId");
  try {
    await requireMonthlyUnit(unitId, true);
    const input = {
      name: text(form, "name"), description: text(form, "description"), price: num(form, "price"),
      graceDays: num(form, "graceDays"), maxVehicles: num(form, "maxVehicles"),
      maxSimultaneous: num(form, "maxSimultaneous"), planCategory: text(form, "planCategory"),
      vehicleScope: text(form, "vehicleScope"), guaranteedSpace: checked(form, "guaranteedSpace"),
      access24h: checked(form, "access24h"), accessStart: text(form, "accessStart") || null,
      accessEnd: text(form, "accessEnd") || null, holidaysAllowed: checked(form, "holidaysAllowed"),
      dailyEntryLimit: optionalNum(form, "dailyEntryLimit"), cancellationNoticeDays: num(form, "cancellationNoticeDays"),
      reservedCapacity: num(form, "reservedCapacity"),
    };
    if (input.name.length < 2 || input.price <= 0 || input.graceDays < 0 || input.graceDays > 90 || input.maxVehicles < 1 || input.maxSimultaneous < 1 || input.maxSimultaneous > input.maxVehicles || !["ECONOMIC","STANDARD","GUARANTEED","BUSINESS"].includes(input.planCategory) || !["CAR","MOTORCYCLE","BOTH"].includes(input.vehicleScope) || input.cancellationNoticeDays < 0 || input.cancellationNoticeDays > 90 || input.reservedCapacity < 0 || (!input.access24h && (!input.accessStart || !input.accessEnd))) fail("Revise as regras comerciais do plano.", path);

    const supabase = await createClient();
    const { error } = await supabase.rpc("create_monthly_plan_v2", {
      target_unit: unitId,
      plan_name: input.name,
      plan_description: input.description,
      plan_price: input.price,
      plan_grace_days: input.graceDays,
      plan_max_vehicles: input.maxVehicles,
      plan_max_simultaneous: input.maxSimultaneous,
      plan_category: input.planCategory,
      plan_vehicle_scope: input.vehicleScope,
      plan_guaranteed_space: input.guaranteedSpace,
      plan_access_24h: input.access24h,
      plan_access_start: input.accessStart,
      plan_access_end: input.accessEnd,
      plan_holidays_allowed: input.holidaysAllowed,
      plan_daily_entry_limit: input.dailyEntryLimit,
      plan_cancellation_notice_days: input.cancellationNoticeDays,
      plan_reserved_capacity: input.reservedCapacity,
    });
    if (error) fail(friendly(error.message), path);
  } catch (error) { fail(friendly(error instanceof Error ? error.message : ""), path); }
  revalidatePath(path);
  redirect(`${path}?sucesso=Plano comercial criado`);
}

export async function togglePlan(form: FormData) {
  const path = "/ceo/mensalistas/planos"; const unitId = text(form, "unitId");
  try { await requireMonthlyUnit(unitId, true); const supabase = await createClient(); const { error } = await supabase.rpc("set_monthly_plan_enabled", { target_plan: text(form, "planId"), target_enabled: text(form, "enabled") === "true" }); if (error) fail(friendly(error.message), path); }
  catch (error) { fail(friendly(error instanceof Error ? error.message : ""), path); }
  revalidatePath(path); redirect(`${path}?sucesso=Plano atualizado`);
}

export async function createSubscription(form: FormData) {
  const path = "/ceo/mensalistas/nova"; let id = "";
  try {
    const supabase = await createClient(); const planId = text(form, "planId");
    const { data: plan, error: planError } = await supabase.from("monthly_plans").select("unit_id").eq("id", planId).eq("enabled", true).maybeSingle();
    if (planError || !plan?.unit_id) throw new Error("MONTHLY_PLAN_UNAVAILABLE");
    const unitId = String(plan.unit_id); await requireMonthlyUnit(unitId, true); const startsOn = text(form, "startsOn");
    const { data, error } = await supabase.rpc("create_monthly_subscription", { target_unit: unitId, target_customer: text(form, "customerId"), target_plan: planId, target_starts_on: startsOn, override_due_day: null, override_grace_days: null, override_price: null });
    if (error) fail(friendly(error.message), path); id = String(data);
    const vehicleId = text(form, "vehicleId");
    if (vehicleId) { const linked = await supabase.rpc("attach_monthly_vehicle", { target_subscription: id, target_vehicle: vehicleId, target_valid_from: startsOn }); if (linked.error) fail(friendly(linked.error.message), `/ceo/mensalistas/${id}`); }
  } catch (error) { fail(friendly(error instanceof Error ? error.message : ""), path); }
  revalidatePath("/ceo/mensalistas"); redirect(`/ceo/mensalistas/${id}?sucesso=Assinatura criada`);
}

export async function changeSubscriptionStatus(form: FormData) {
  const id = text(form, "subscriptionId"); const path = `/ceo/mensalistas/${id}`; const unitId = text(form, "unitId");
  try { await requireMonthlyUnit(unitId, true); const supabase = await createClient(); const { error } = await supabase.rpc("set_monthly_subscription_status", { target_subscription: id, target_status: text(form, "status"), reason: text(form, "reason"), effective_at_period_end: text(form, "atPeriodEnd") === "true" }); if (error) fail(friendly(error.message), path); }
  catch (error) { fail(friendly(error instanceof Error ? error.message : ""), path); }
  revalidatePath(path); revalidatePath("/ceo/mensalistas"); redirect(`${path}?sucesso=Status atualizado`);
}

export async function attachVehicle(form: FormData) {
  const id = text(form, "subscriptionId"); const path = `/ceo/mensalistas/${id}`; const unitId = text(form, "unitId");
  try { await requireMonthlyUnit(unitId, true); const supabase = await createClient(); const { error } = await supabase.rpc("attach_monthly_vehicle", { target_subscription: id, target_vehicle: text(form, "vehicleId"), target_valid_from: text(form, "validFrom") }); if (error) fail(friendly(error.message), path); }
  catch (error) { fail(friendly(error instanceof Error ? error.message : ""), path); }
  revalidatePath(path); redirect(`${path}?sucesso=Veículo vinculado`);
}

export async function detachVehicle(form: FormData) {
  const id = text(form, "subscriptionId"); const path = `/ceo/mensalistas/${id}`; const unitId = text(form, "unitId");
  try { await requireMonthlyUnit(unitId, true); const supabase = await createClient(); const { error } = await supabase.rpc("detach_monthly_vehicle", { target_link: text(form, "linkId"), target_valid_until: new Date().toISOString().slice(0, 10) }); if (error) fail(friendly(error.message), path); }
  catch (error) { fail(friendly(error instanceof Error ? error.message : ""), path); }
  revalidatePath(path); redirect(`${path}?sucesso=Veículo desvinculado`);
}

export async function generatePeriod(form: FormData) {
  const id = text(form, "subscriptionId"); const path = `/ceo/mensalistas/${id}`; const unitId = text(form, "unitId");
  try { await requireMonthlyUnit(unitId, true); const supabase = await createClient(); const { error } = await supabase.rpc("generate_monthly_billing_period", { target_subscription: id, target_year: num(form, "year"), target_month: num(form, "month") }); if (error) fail(friendly(error.message), path); }
  catch (error) { fail(friendly(error instanceof Error ? error.message : ""), path); }
  revalidatePath(path); redirect(`${path}?sucesso=Competência disponível`);
}
