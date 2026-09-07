"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCeoScope } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const numberValue = (form: FormData, key: string) => Number(text(form, key).replace(",", "."));
const optionalNumber = (form: FormData, key: string) => {
  const raw = text(form, key);
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : null;
};
const checked = (form: FormData, key: string) => form.get(key) === "on";
const fail = (message: string, path: string): never => redirect(`${path}?erro=${encodeURIComponent(message)}`);

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function parseInput(form: FormData) {
  const name = text(form, "name");
  const capacity = Math.trunc(numberValue(form, "capacity"));
  const areaSqm = optionalNumber(form, "areaSqm");
  const monthlyFixedCost = optionalNumber(form, "monthlyFixedCost");
  const timezone = text(form, "timezone") || "America/Bahia";
  const isActive = checked(form, "isActive");

  if (name.length < 2 || name.length > 100) throw new Error("Nome da unidade inválido.");
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 10000) throw new Error("Capacidade inválida.");
  if (areaSqm !== null && areaSqm <= 0) throw new Error("Área inválida.");
  if (monthlyFixedCost !== null && monthlyFixedCost < 0) throw new Error("Custo fixo inválido.");
  if (![/^America\/[A-Za-z_]+$/, /^UTC$/].some((rule) => rule.test(timezone))) throw new Error("Fuso horário inválido.");

  return {
    name,
    capacity,
    area_sqm: areaSqm,
    monthly_fixed_cost: monthlyFixedCost,
    timezone,
    is_active: isActive,
  };
}

async function requireUnitManager(unitId: string) {
  const access = await requireCeoScope("admin");
  const allowed = access.assignments.some(
    (assignment) => String(assignment.unit_id) === unitId && assignment.is_active && ["owner", "manager"].includes(String(assignment.role)),
  );
  if (!allowed) redirect("/ceo/unidades?erro=sem-permissao");
  return access;
}

export async function createUnit(form: FormData) {
  const path = "/ceo/unidades/nova";
  try {
    const access = await requireCeoScope("admin");
    const input = parseInput(form);
    const admin = createAdminClient();
    const baseSlug = slugify(input.name) || "unidade";
    let slug = baseSlug;
    const { data: existing } = await admin.from("parking_units").select("id").eq("slug", slug).maybeSingle();
    if (existing) slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;

    const { data: unit, error } = await admin
      .from("parking_units")
      .insert({ ...input, slug })
      .select("id")
      .single();
    if (error || !unit?.id) throw new Error("Não foi possível criar a unidade.");

    const role = access.roles.includes("owner") ? "owner" : "manager";
    const assignment = await admin.from("user_unit_roles").upsert(
      {
        user_id: access.user.id,
        unit_id: unit.id,
        role,
        is_active: true,
        disabled_at: null,
        disabled_by: null,
      },
      { onConflict: "user_id,unit_id,role" },
    );

    if (assignment.error) {
      await admin.from("parking_units").delete().eq("id", unit.id);
      throw new Error("A unidade foi criada, mas não foi possível vincular o acesso administrativo.");
    }

    revalidatePath("/ceo/unidades");
    redirect(`/ceo/unidades/${unit.id}?sucesso=${encodeURIComponent("Unidade criada")}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    fail(error instanceof Error ? error.message : "Não foi possível criar a unidade.", path);
  }
}

export async function updateUnit(form: FormData) {
  const unitId = text(form, "unitId");
  const path = `/ceo/unidades/${unitId}/editar`;
  try {
    await requireUnitManager(unitId);
    const input = parseInput(form);
    const admin = createAdminClient();
    const { error } = await admin.from("parking_units").update(input).eq("id", unitId);
    if (error) throw new Error("Não foi possível atualizar a unidade.");

    revalidatePath("/ceo/unidades");
    revalidatePath(`/ceo/unidades/${unitId}`);
    redirect(`/ceo/unidades/${unitId}?sucesso=${encodeURIComponent("Unidade atualizada")}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    fail(error instanceof Error ? error.message : "Não foi possível atualizar a unidade.", path);
  }
}

export async function toggleUnitStatus(form: FormData) {
  const unitId = text(form, "unitId");
  const nextActive = text(form, "nextActive") === "true";
  await requireUnitManager(unitId);
  const admin = createAdminClient();
  const { error } = await admin.from("parking_units").update({ is_active: nextActive }).eq("id", unitId);
  if (error) redirect(`/ceo/unidades/${unitId}?erro=${encodeURIComponent("Não foi possível alterar o status da unidade.")}`);

  revalidatePath("/ceo/unidades");
  revalidatePath(`/ceo/unidades/${unitId}`);
  redirect(`/ceo/unidades/${unitId}?sucesso=${encodeURIComponent(nextActive ? "Unidade ativada" : "Unidade desativada")}`);
}
