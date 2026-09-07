import "server-only";
import { cache } from "react";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPaymentAvailability,resolveCustomerPaymentOptions } from "@/lib/payments/payment-availability";
import { isEfiCardProductionCanaryForActor } from "@/lib/payments/efi-card-canary";
import { isEfiPixProductionCanaryForActor } from "@/lib/payments/efi-pix-canary";

import { loadCustomerData, type CustomerDataScope } from "@/lib/customer-data-loader";
export type { CustomerPayment, CustomerSession, CustomerVehicle, CustomerCharge, CustomerMonthlyPeriod, CustomerNotification, CustomerProfile, CustomerDataScope } from "@/lib/customer-data-loader";
import type { CustomerSession } from "@/lib/customer-data-loader";

// React cache deduplicates only within this server request, never across customers.
export const getCustomerData = cache((scope: CustomerDataScope = "all") => loadCustomerData({
  requireArea, createClient, getPaymentAvailability, resolveCustomerPaymentOptions,
  isEfiCardProductionCanaryForActor, isEfiPixProductionCanaryForActor,
}, scope));

export function findOwnedSession(sessions: CustomerSession[], id?: string) {
  return id ? sessions.find(session => session.id === id) ?? null : null;
}
