import { EfiCardService } from "@/lib/payments/efi-card-service";
import {
  isEfiCardProductionRuntimeEnabled,
  isEfiCardQaPreviewRuntime,
} from "@/lib/supabase/env";

export async function POST(request: Request) {
  const isQa = isEfiCardQaPreviewRuntime();
  const isProduction = isEfiCardProductionRuntimeEnabled();

  if (!isQa && !isProduction) {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_NOT_AVAILABLE" }, { status: 404 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_INVALID" }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_INVALID" }, { status: 415 });
  }

  const form = await request.formData().catch(() => null);
  if (!form || [...form.keys()].some((key) => key !== "notification")) {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_INVALID" }, { status: 400 });
  }

  const token = form.get("notification");
  if (typeof token !== "string" || token.length === 0 || token.length > 512) {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_INVALID" }, { status: 400 });
  }

  try {
    const environment = isProduction ? "PRODUCTION" : "SANDBOX";
    const result = await new EfiCardService(undefined, environment).processNotification(token);
    return Response.json(result, { status: 200 });
  } catch {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_FAILED" }, { status: 502 });
  }
}
