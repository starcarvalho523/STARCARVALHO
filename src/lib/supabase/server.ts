import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnvironment } from "./env";
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseEnvironment();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot persist cookies. */ }
      },
    },
  });
}

