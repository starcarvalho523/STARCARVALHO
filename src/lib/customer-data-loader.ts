import type { requireArea } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import type { getPaymentAvailability, resolveCustomerPaymentOptions } from "@/lib/payments/payment-availability";
import type { isEfiCardProductionCanaryForActor } from "@/lib/payments/efi-card-canary";
import type { isEfiPixProductionCanaryForActor } from "@/lib/payments/efi-pix-canary";

export type CustomerPayment = { id:string; amount:number; method:string; status:string; provider:string|null; paid_at:string|null; created_at:string };
export type CustomerSession = { id:string; unit_id:string; vehicle_id:string; plate_snapshot:string; vehicle_type:string; status:string; payment_status:string; entry_mode:string; financial_obligation:string; entered_at:string; exited_at:string|null; final_amount:number|null; calculated_amount:number|null; tariff_snapshot:Record<string,unknown>; parking_units:{name:string;timezone:string}|null; payments:CustomerPayment[] };
export type CustomerVehicle = { id:string; plate:string; vehicle_type:string; created_at:string };
export type CustomerCharge = { entered_at:string; reference_time:string; duration_minutes:number; tariff_name:string; total:number };
export type CustomerMonthlyPeriod={id:string;reference_year:number;reference_month:number;period_start:string;period_end:string;due_date:string;grace_until:string;amount:number;status:string;parking_units:{name:string;timezone:string}|null;monthly_subscriptions:{id:string;plan_name:string;unit_id:string;status:string;auto_renew:boolean;preferred_payment_method:string|null;renewal_provider:string|null;next_billing_date:string|null;cancel_at_period_end:boolean;parking_units:{name:string;timezone:string}|null;monthly_subscription_vehicles:Array<{vehicle_id:string;vehicles:{plate:string}|null}>}|null;payments:CustomerPayment[]};
export type CustomerNotification={id:string;type:string;title:string;message:string;created_at:string;read_at:string|null;internal_link:string|null};
export type CustomerProfile={full_name:string;created_at:string;updated_at:string;tariff_alert_minutes:number;billing_document:string|null};


export type CustomerDataScope = "all" | "home" | "stays" | "vehicles" | "payments" | "monthly" | "account" | "notifications";
export type CustomerDataDependencies = {
  requireArea: typeof requireArea;
  createClient: typeof createClient;
  getPaymentAvailability: typeof getPaymentAvailability;
  resolveCustomerPaymentOptions: typeof resolveCustomerPaymentOptions;
  isEfiCardProductionCanaryForActor: typeof isEfiCardProductionCanaryForActor;
  isEfiPixProductionCanaryForActor: typeof isEfiPixProductionCanaryForActor;
};

/** Authorization precedes every query; dependencies are injectable for regression tests. */
export async function loadCustomerData(deps: CustomerDataDependencies, scope: CustomerDataScope = "all") {
  const access = await deps.requireArea("cliente");
  const supabase = await deps.createClient();
  const needsSessions = ["all", "home", "stays", "vehicles", "payments"].includes(scope);
  const needsVehicles = needsSessions || scope === "monthly";
  const needsMonthly = ["all", "payments", "monthly"].includes(scope);
  const needsCharge = scope === "all" || scope === "home";
  const needsOptions = needsCharge || scope === "stays";

  async function loadProfile() {
    const { data, error } = await supabase.from("customer_profiles").select("full_name,created_at,updated_at,tariff_alert_minutes,billing_document").eq("user_id", access.user.id).single();
    if (error) throw new Error("CUSTOMER_PROFILE_UNAVAILABLE");
    return data as CustomerProfile;
  }

  async function loadParking() {
    let vehicles: CustomerVehicle[] = [];
    if (needsVehicles) {
      const { data, error } = await supabase.from("vehicles").select("id,plate,vehicle_type,created_at").eq("customer_id", access.user.id).order("plate");
      if (error) throw new Error("CUSTOMER_VEHICLES_UNAVAILABLE");
      vehicles = (data ?? []) as CustomerVehicle[];
    }
    let sessions: CustomerSession[] = [];
    const vehicleIds = vehicles.map(vehicle => vehicle.id);
    if (needsSessions && vehicleIds.length) {
      const since = new Date(); since.setFullYear(since.getFullYear() - 1);
      const { data, error } = await supabase.from("parking_sessions").select("id,unit_id,vehicle_id,plate_snapshot,vehicle_type,status,payment_status,entry_mode,financial_obligation,entered_at,exited_at,final_amount,calculated_amount,tariff_snapshot,parking_units(name,timezone),payments(id,amount,method,status,provider,paid_at,created_at)").in("vehicle_id", vehicleIds).gte("entered_at", since.toISOString()).order("entered_at", { ascending: false }).limit(250);
      if (error) throw new Error("CUSTOMER_SESSIONS_UNAVAILABLE");
      sessions = (data ?? []) as unknown as CustomerSession[];
    }
    const active = sessions.find(session => ["OPEN", "PAYMENT_PENDING", "PAID", "MANUAL_REVIEW"].includes(session.status)) ?? null;
    async function loadCharge(): Promise<CustomerCharge | null> {
      if (!needsCharge || !active) return null;
      const { data, error } = await supabase.rpc("customer_parking_charge", { session_id: active.id }).maybeSingle();
      return !error && data ? data as CustomerCharge : null;
    }
    async function loadOptions() {
      if (!needsOptions || !active) return deps.resolveCustomerPaymentOptions([], { efiCardProductionCanary: false, efiPixProductionCanary: false });
      const [capabilities, efiCardProductionCanary, efiPixProductionCanary] = await Promise.all([
        deps.getPaymentAvailability(active.unit_id),
        deps.isEfiCardProductionCanaryForActor(active.id, access.user.id),
        deps.isEfiPixProductionCanaryForActor(active.id, access.user.id),
      ]);
      return deps.resolveCustomerPaymentOptions(capabilities, { efiCardProductionCanary, efiPixProductionCanary });
    }
    const [activeCharge, activePaymentOptions] = await Promise.all([loadCharge(), loadOptions()]);
    return { vehicles, sessions, active, activeCharge, activePaymentOptions };
  }

  async function loadMonthly(): Promise<CustomerMonthlyPeriod[]> {
    if (!needsMonthly) return [];
    const { data, error } = await supabase.from("monthly_billing_periods").select("id,reference_year,reference_month,period_start,period_end,due_date,grace_until,amount,status,parking_units(name,timezone),monthly_subscriptions!inner(id,plan_name,unit_id,status,auto_renew,preferred_payment_method,renewal_provider,next_billing_date,cancel_at_period_end,parking_units(name,timezone),monthly_subscription_vehicles(vehicle_id,vehicles(plate))),payments(id,amount,method,status,provider,paid_at,created_at)").order("due_date", { ascending: false }).limit(24);
    if (error) throw new Error("CUSTOMER_MONTHLY_PERIODS_UNAVAILABLE");
    return (data ?? []) as unknown as CustomerMonthlyPeriod[];
  }

  async function loadNotifications(): Promise<CustomerNotification[]> {
    // Refresh must finish before reading the badge and notification list.
    await supabase.rpc("refresh_customer_notifications");
    const { data, error } = await supabase.from("customer_notifications").select("id,type,title,message,created_at,read_at,internal_link").order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error("CUSTOMER_NOTIFICATIONS_UNAVAILABLE");
    return (data ?? []) as CustomerNotification[];
  }

  const [profile, parking, monthlyPeriods, notifications] = await Promise.all([
    loadProfile(), loadParking(), loadMonthly(), loadNotifications(),
  ]);
  return { access, profile, ...parking, monthlyPeriods, notifications, unreadNotifications: notifications.filter(item => !item.read_at).length, email: access.user.email ?? "" };
}
