import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseEnvironment } from "./env";

export function createAdminClient() {
  const { environment, url } = getServerSupabaseEnvironment();
  const secret =
    environment === "qa"
      ? process.env.SUPABASE_QA_SECRET_KEY
      : process.env.SUPABASE_SECRET_KEY;

  if (!secret) {
    throw new Error(
      environment === "qa"
        ? "SUPABASE_QA_SECRET_KEY_NOT_CONFIGURED"
        : "SUPABASE_SECRET_KEY_NOT_CONFIGURED",
    );
  }

  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
