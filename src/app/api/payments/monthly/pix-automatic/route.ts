import { createClient } from "@/lib/supabase/server";
import { createMonthlyPixAutomatic, getMonthlyPixAutomatic } from "@/lib/payments/monthly-pix-automatic-service";

export async function GET(request: Request) {
  try {
    const billingPeriodId = new URL(request.url).searchParams.get("billingPeriodId") ?? "";
    if (!billingPeriodId) return Response.json({ error: "BILLING_PERIOD_ID_REQUIRED" }, { status: 400 });
    const payment = await getMonthlyPixAutomatic(billingPeriodId, await createClient());
    return Response.json({ payment }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const billingPeriodId = typeof body?.billingPeriodId === "string" ? body.billingPeriodId : "";
    if (!billingPeriodId) return Response.json({ error: "BILLING_PERIOD_ID_REQUIRED" }, { status: 400 });
    const payment = await createMonthlyPixAutomatic(billingPeriodId, await createClient());
    return Response.json({ payment }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "MONTHLY_PIX_AUTOMATIC_ERROR";
  const status = /AUTHENTICATION|FORBIDDEN/.test(message) ? 403
    : /NOT_FOUND/.test(message) ? 404
    : /NOT_PAYABLE|DISABLED|DOCUMENT_REQUIRED/.test(message) ? 409
    : 503;
  if (process.env.VERCEL_ENV === "preview") {
    console.warn("MONTHLY_PIX_AUTOMATIC_FAILED", { code: safeCode(message), status });
  }
  return Response.json({ error: publicError(message) }, { status });
}

function safeCode(message: string) {
  const match = message.toUpperCase().match(/[A-Z][A-Z0-9_]{2,80}/);
  return match?.[0] ?? "MONTHLY_PIX_AUTOMATIC_ERROR";
}

function publicError(message: string) {
  if (message.includes("DOCUMENT_REQUIRED")) return "Cadastre seu CPF/CNPJ antes de ativar a mensalidade.";
  if (message.includes("DISABLED")) return "Pix Automático ainda não está habilitado neste ambiente.";
  if (message.includes("NOT_PAYABLE")) return "Esta mensalidade não está disponível para ativação.";
  if (message.includes("FORBIDDEN")) return "Você não pode acessar esta mensalidade.";
  return "Não foi possível iniciar o Pix Automático agora.";
}
