import "server-only";
import { cache } from "react";
import { requireArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCeoAnalytics, type CeoFilters, type CeoAnalyticsView } from "@/lib/ceo-analytics-loader";
export { normalizeCeoFilters } from "@/lib/ceo-analytics-loader";
export type { CeoPeriod, CeoFilters, CeoUnit, CeoSession, CeoPayment, CeoShift, CeoAlert, CeoAnalyticsView } from "@/lib/ceo-analytics-loader";

// Primitive cache keys deduplicate equivalent filters within the same request.
const readAnalytics = cache((period: CeoFilters["period"], unitId: string, view: CeoAnalyticsView) =>
  loadCeoAnalytics({ requireArea, createClient }, { period, unitId }, view),
);
export function getCeoAnalytics(filters: CeoFilters, view: CeoAnalyticsView = "all") {
  return readAnalytics(filters.period, filters.unitId, view);
}
