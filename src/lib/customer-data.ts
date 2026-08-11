import "server-only";
import { cache } from "react";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CustomerPayment = { id:string; amount:number; method:string; status:string; paid_at:string|null; created_at:string };
export type CustomerSession = { id:string; vehicle_id:string; plate_snapshot:string; vehicle_type:string; status:string; payment_status:string; entry_mode:string; financial_obligation:string; entered_at:string; exited_at:string|null; final_amount:number|null; calculated_amount:number|null; tariff_snapshot:Record<string,unknown>; parking_units:{name:string;timezone:string}|null; payments:CustomerPayment[] };
export type CustomerVehicle = { id:string; plate:string; vehicle_type:string; created_at:string };
export type CustomerCharge = { entered_at:string; reference_time:string; duration_minutes:number; tariff_name:string; total:number };

export const getCustomerData = cache(async () => {
  const access = await requireArea("cliente");
  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase.from("customer_profiles").select("full_name,created_at,updated_at").eq("user_id", access.user.id).single();
  if (profileError) throw new Error("CUSTOMER_PROFILE_UNAVAILABLE");
  const { data: vehicleRows, error: vehicleError } = await supabase.from("vehicles").select("id,plate,vehicle_type,created_at").eq("customer_id", access.user.id).order("plate");
  if (vehicleError) throw new Error("CUSTOMER_VEHICLES_UNAVAILABLE");
  const vehicles = (vehicleRows ?? []) as CustomerVehicle[];
  const vehicleIds = vehicles.map((vehicle) => vehicle.id);
  let sessions: CustomerSession[] = [];
  if (vehicleIds.length) {
    const since = new Date(); since.setFullYear(since.getFullYear() - 1);
    const { data, error } = await supabase.from("parking_sessions").select("id,vehicle_id,plate_snapshot,vehicle_type,status,payment_status,entry_mode,financial_obligation,entered_at,exited_at,final_amount,calculated_amount,tariff_snapshot,parking_units(name,timezone),payments(id,amount,method,status,paid_at,created_at)").in("vehicle_id", vehicleIds).gte("entered_at", since.toISOString()).order("entered_at", { ascending:false }).limit(250);
    if (error) throw new Error("CUSTOMER_SESSIONS_UNAVAILABLE");
    sessions = (data ?? []) as unknown as CustomerSession[];
  }
  const active = sessions.find((session) => ["OPEN","PAYMENT_PENDING","PAID","MANUAL_REVIEW"].includes(session.status)) ?? null;
  let activeCharge: CustomerCharge|null = null;
  if (active) {
    const { data, error } = await supabase.rpc("customer_parking_charge", { session_id:active.id }).maybeSingle();
    if (!error && data) activeCharge = data as CustomerCharge;
  }
  return { access, profile, vehicles, sessions, active, activeCharge, email:access.user.email ?? "" };
});

export function findOwnedSession(sessions:CustomerSession[], id?:string) { return id ? sessions.find((session) => session.id === id) ?? null : null; }
export function findOwnedPayment(sessions:CustomerSession[], id?:string) { if (!id) return null; for (const session of sessions) { const payment=session.payments.find((row)=>row.id===id); if(payment)return {payment,session}; } return null; }

