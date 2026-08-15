import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId)
    return Response.json({ error: "SESSION_ID_REQUIRED" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "refresh_customer_parking_forecast",
    { target_session: sessionId },
  );
  if (error)
    return Response.json(
      { error: "FORECAST_NOT_AVAILABLE" },
      { status: error.message.includes("SESSION_NOT_FOUND") ? 404 : 400 },
    );
  return Response.json(
    { forecast: data },
    { headers: { "cache-control": "no-store" } },
  );
}
