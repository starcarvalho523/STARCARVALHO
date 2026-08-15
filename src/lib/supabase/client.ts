"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnvironment } from "./env";

export function createClient() {
  const hostname = typeof window === "undefined" ? undefined : window.location.hostname;
  const { url, publishableKey } = getSupabaseEnvironment(hostname);
  return createBrowserClient(url, publishableKey);
}
