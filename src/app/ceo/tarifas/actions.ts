"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type TariffActionState = {
  error?: string;
  success?: string;
  preview?: Array<{ minutes: number; total: number }>;
  activePreview?: Array<{ minutes: number; total: number }>;
};

const samples = [10, 30, 60, 90, 120, 180, 240, 360, 480, 600, 720, 1440, 2880];

function numberFrom(formData: FormData, name: string, optional = false) {
  const raw = String(formData.get(name) ?? "").trim().replace(/\s/g, "");
  if (!raw && optional) return null;
  if (!raw) return Number.NaN;
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "")
    : raw.replace(",", ".");
  return Number(normalized);
}

function values(formData: FormData) {
  return {
    unitId: String(formData.get("unitId") ?? ""),
    vehicleType: String(formData.get("vehicleType") ?? ""),
    firstHour: numberFrom(formData, "firstHour") as number,
    additional: numberFrom(formData, "additional") as number,
    fractionMinutes: numberFrom(formData, "fractionMinutes") as number,
    toleranceMinutes: numberFrom(formData, "toleranceMinutes") as number,
    dailyAmount: numberFrom(formData, "dailyAmount") as number,
    dailyHours: numberFrom(formData, "dailyHours") as number,
    intermediateAmount: numberFrom(formData, "intermediateAmount", true),
    intermediateHours: numberFrom(formData, "intermediateHours", true),
    exitGraceMinutes: numberFrom(formData, "exitGraceMinutes") as number,
    dailyCycleHours: numberFrom(formData, "dailyCycleHours") as number,
  };
}

async function authorizeOwner(unitId: string) {
  const access = await requireArea("ceo");
  if (!access.assignments.some((item) => item.unit_id === unitId && item.role === "owner")) {
    throw new Error("OWNER_FORBIDDEN");
  }
}

function validate(input: ReturnType<typeof values>) {
  if (!input.unitId || !["CAR", "MOTORCYCLE"].includes(input.vehicleType)) return "Selecione uma unidade e um tipo de veículo.";
  if (!Number.isFinite(input.firstHour) || input.firstHour <= 0) return "Informe um valor válido e positivo para a primeira hora.";
  if (!Number.isFinite(input.additional) || input.additional <= 0) return "Informe um valor válido e positivo para a fração adicional.";
  if (!Number.isInteger(input.fractionMinutes) || input.fractionMinutes <= 0) return "A duração da fração deve ser um número inteiro maior que zero.";
  if (!Number.isInteger(input.toleranceMinutes) || input.toleranceMinutes < 0) return "A tolerância deve ser um número inteiro igual ou maior que zero.";
  if (!Number.isFinite(input.dailyAmount) || input.dailyAmount <= 0) return "Informe um valor válido e positivo para a diária.";
  if (!Number.isInteger(input.dailyHours) || input.dailyHours <= 0) return "As horas para aplicar a diária devem ser um número inteiro maior que zero.";
  if (!Number.isInteger(input.dailyCycleHours) || input.dailyCycleHours <= 0) return "O ciclo da diária deve ser informado em horas inteiras.";
  if (input.dailyHours > input.dailyCycleHours) return "A diária não pode começar depois do fim do próprio ciclo.";
  if (!Number.isInteger(input.exitGraceMinutes) || input.exitGraceMinutes < 0 || input.exitGraceMinutes > 120) return "A tolerância de saída deve ficar entre 0 e 120 minutos.";
  const hasIntermediateAmount = input.intermediateAmount !== null;
  const hasIntermediateHours = input.intermediateHours !== null;
  if (hasIntermediateAmount !== hasIntermediateHours) return "Para usar o teto intermediário, informe valor e horário de início.";
  if (input.intermediateAmount !== null && (!Number.isFinite(input.intermediateAmount) || input.intermediateAmount <= 0)) return "O teto intermediário deve ser positivo.";
  if (input.intermediateHours !== null && (!Number.isFinite(input.intermediateHours) || input.intermediateHours <= 0 || input.intermediateHours >= input.dailyHours)) return "O teto intermediário deve começar antes da diária.";
  return null;
}

function message(error: string) {
  if (error.includes("OWNER_FORBIDDEN")) return "Somente o proprietário autorizado desta unidade pode criar tarifas.";
  if (error.includes("INVALID_TARIFF")) return "Os valores informados não formam uma tarifa válida.";
  return "Não foi possível processar a tarifa. Tente novamente.";
}

const rpcArgs = (input: ReturnType<typeof values>) => ({
  target_unit: input.unitId,
  first_hour: input.firstHour,
  additional: input.additional,
  fraction_minutes: input.fractionMinutes,
  tolerance_minutes: input.toleranceMinutes,
  daily_amount: input.dailyAmount,
  daily_hours: input.dailyHours,
  intermediate_amount: input.intermediateAmount,
  intermediate_hours: input.intermediateHours,
  exit_grace: input.exitGraceMinutes,
  daily_cycle_hours: input.dailyCycleHours,
  sample_minutes: samples,
});

export async function previewTariff(_: TariffActionState, formData: FormData): Promise<TariffActionState> {
  const input = values(formData);
  const invalid = validate(input);
  if (invalid) return { error: invalid };
  try {
    await authorizeOwner(input.unitId);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("preview_tariff_charges_v2", rpcArgs(input));
    if (error) return { error: message(error.message) };
    return { success: "Simulação calculada pelo motor oficial Tarifa 2.0.", preview: (data ?? []) as Array<{ minutes: number; total: number }> };
  } catch (error) {
    return { error: message(error instanceof Error ? error.message : "") };
  }
}

export async function createTariffVersion(_: TariffActionState, formData: FormData): Promise<TariffActionState> {
  const input = values(formData);
  const invalid = validate(input);
  if (invalid) return { error: invalid };
  try {
    await authorizeOwner(input.unitId);
    const supabase = await createClient();
    const { data: current } = await supabase
      .from("tariff_rules")
      .select("first_hour_amount,additional_amount,additional_fraction_minutes,grace_minutes,daily_cap_amount,daily_after_minutes,intermediate_cap_amount,intermediate_after_minutes,exit_grace_minutes,daily_cycle_minutes")
      .eq("unit_id", input.unitId)
      .eq("vehicle_type", input.vehicleType)
      .eq("is_active", true)
      .is("valid_until", null)
      .maybeSingle();

    const sameIntermediateAmount = Number(current?.intermediate_cap_amount ?? 0) === Number(input.intermediateAmount ?? 0);
    const sameIntermediateMinutes = Number(current?.intermediate_after_minutes ?? 0) === Math.round(Number(input.intermediateHours ?? 0) * 60);
    if (
      current && Number(current.first_hour_amount) === input.firstHour && Number(current.additional_amount) === input.additional &&
      current.additional_fraction_minutes === input.fractionMinutes && current.grace_minutes === input.toleranceMinutes &&
      Number(current.daily_cap_amount) === input.dailyAmount && current.daily_after_minutes === input.dailyHours * 60 &&
      sameIntermediateAmount && sameIntermediateMinutes && current.exit_grace_minutes === input.exitGraceMinutes &&
      current.daily_cycle_minutes === input.dailyCycleHours * 60
    ) return { error: "Os valores são idênticos à tarifa ativa. Nenhuma nova versão foi criada." };

    const { error } = await supabase.rpc("create_tariff_version_v2", {
      target_unit: input.unitId,
      target_vehicle_type: input.vehicleType,
      first_hour: input.firstHour,
      additional: input.additional,
      fraction_minutes: input.fractionMinutes,
      tolerance_minutes: input.toleranceMinutes,
      daily_amount: input.dailyAmount,
      daily_hours: input.dailyHours,
      intermediate_amount: input.intermediateAmount,
      intermediate_hours: input.intermediateHours,
      exit_grace: input.exitGraceMinutes,
      daily_cycle_hours: input.dailyCycleHours,
    });
    if (error) return { error: message(error.message) };
    revalidatePath("/ceo/tarifas");
    revalidatePath("/frentista");
    revalidatePath("/frentista/entradas");
    return { success: "Nova versão Tarifa 2.0 criada. Sessões já abertas mantêm a regra anterior." };
  } catch (error) {
    return { error: message(error instanceof Error ? error.message : "") };
  }
}
