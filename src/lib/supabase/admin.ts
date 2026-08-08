import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "./env";

export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY_NOT_CONFIGURED");
  const { url } = getSupabaseEnvironment();
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
