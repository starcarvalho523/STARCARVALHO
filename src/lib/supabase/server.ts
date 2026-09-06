import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnvironment } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  // Server-side database selection must depend on trusted deployment metadata,
  // never on Host/X-Forwarded-Host supplied by an incoming request.
  const runtimeHostname =
    process.env.VERCEL_ENV === "preview" ? "preview.vercel.app" : undefined;
  const { url, publishableKey } = getSupabaseEnvironment(runtimeHostname);

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* Server Components cannot persist cookies. */
        }
      },
    },
  });
}
