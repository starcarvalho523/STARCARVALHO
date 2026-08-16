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

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const notificationId = typeof body?.notificationId === "string" ? body.notificationId : "";
  if (!notificationId) {
    return Response.json({ error: "NOTIFICATION_ID_REQUIRED" }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_customer_notification_read", {
    notification_id: notificationId,
  });
  if (error) {
    return Response.json({ error: "NOTIFICATION_NOT_AVAILABLE" }, { status: 404 });
  }
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
