import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : null; }
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const next = safeNext(url.searchParams.get("next"));
  if (!code) return NextResponse.redirect(new URL("/login?erro=callback", url.origin));
  const supabase = await createClient(); const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(new URL("/login?erro=callback", url.origin));
  if (next === "/redefinir-senha") return NextResponse.redirect(new URL(next, url.origin));
  let access = await getAccess();
  if (!access) {
    const name = String(data.user.user_metadata.full_name ?? data.user.user_metadata.name ?? data.user.email?.split("@")[0] ?? "Cliente").trim();
    await supabase.from("customer_profiles").upsert({ user_id: data.user.id, full_name: name.slice(0, 120), is_active: true });
    access = await getAccess();
  }
  return NextResponse.redirect(new URL(access ? `/${access.area}` : "/login?erro=sem-acesso", url.origin));
}
