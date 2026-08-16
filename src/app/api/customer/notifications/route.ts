import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_notifications")
    .select("id,type,title,message,created_at,read_at,internal_link")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    return Response.json({ error: "NOTIFICATIONS_NOT_AVAILABLE" }, { status: 400 });
  }

  return Response.json(
    { notifications: data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
