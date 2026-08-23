import { EfiCardService } from "@/lib/payments/efi-card-service";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 8192) return Response.json({ error: "EFI_CARD_NOTIFICATION_INVALID" }, { status: 413 });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_INVALID" }, { status: 415 });
  }

  const form = await request.formData().catch(() => null);
  if (!form || [...form.keys()].some((key) => key !== "notification")) return Response.json({ error: "EFI_CARD_NOTIFICATION_INVALID" }, { status: 400 });
  const token = form.get("notification");
  if (typeof token !== "string" || token.length === 0 || token.length > 512) {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_INVALID" }, { status: 400 });
  }

  try {
    const result = await new EfiCardService().processNotification(token);
    return Response.json(result, { status: 200 });
  } catch {
    return Response.json({ error: "EFI_CARD_NOTIFICATION_FAILED" }, { status: 502 });
  }
}
