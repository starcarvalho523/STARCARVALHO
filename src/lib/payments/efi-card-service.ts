import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEfiOneStep, getEfiCardNotification, type EfiCardPayer, type EfiCardState } from "./efi-credit-card-client";

type CardContext = {
  paymentId: string;
  status: string;
  amountCents: number;
  chargeId: string | null;
  providerStatus: string | null;
};

function rpcError(name: string, message: string) {
  return new Error(`${name}: ${message}`);
}

function publicCard(state: EfiCardState, amountCents: number, brand: string | null = null, last4: string | null = null) {
  return { state, amount: amountCents / 100, brand, last4 };
}

export class EfiCardService {
  constructor(private readonly admin = createAdminClient()) {}

  private async context(paymentId: string): Promise<CardContext> {
    const { data, error } = await this.admin.rpc("get_efi_card_payment_context", { target_payment: paymentId });
    if (error) throw rpcError("get_efi_card_payment_context", error.message);
    const value = data as Record<string, unknown> | null;
    if (!value || typeof value.paymentId !== "string" || typeof value.status !== "string" || typeof value.amountCents !== "number" || !Number.isSafeInteger(value.amountCents) || value.amountCents <= 0) {
      throw new Error("EFI_CARD_INVALID_CONTEXT");
    }
    return {
      paymentId: value.paymentId,
      status: value.status,
      amountCents: value.amountCents,
      chargeId: typeof value.chargeId === "string" ? value.chargeId : null,
      providerStatus: typeof value.providerStatus === "string" ? value.providerStatus : null,
    };
  }

  async createPayment(paymentId: string, paymentToken: string, payer: EfiCardPayer) {
    const context = await this.context(paymentId);
    if (context.status === "PAID") return publicCard("PAID", context.amountCents);
    if (context.status !== "PENDING") throw new Error("EFI_CARD_PAYMENT_NOT_PENDING");
    if (context.chargeId) {
      const state: EfiCardState = context.providerStatus === "PAID" ? "PAID" : context.providerStatus === "FAILED" ? "FAILED" : context.providerStatus === "REVIEW" ? "REVIEW" : "PENDING";
      return publicCard(state, context.amountCents);
    }

    const charge = await createEfiOneStep({
      paymentToken,
      amountCents: context.amountCents,
      payer,
      externalReference: context.paymentId,
    });

    const { error: reserveError } = await this.admin.rpc("reserve_efi_card_reference", {
      target_payment: context.paymentId,
      target_charge_id: charge.chargeId,
      target_status: charge.status,
      target_brand: charge.brand,
      target_last4: charge.last4,
    });
    if (reserveError) throw rpcError("reserve_efi_card_reference", reserveError.message);

    if (charge.status === "PAID" || charge.status === "FAILED") {
      const { data, error } = await this.admin.rpc("process_efi_card_settlement", {
        target_charge_id: charge.chargeId,
        target_custom_id: context.paymentId,
        target_amount_cents: context.amountCents,
        target_provider_status: charge.status,
      });
      if (error) throw rpcError("process_efi_card_settlement", error.message);
      const result = data && typeof data === "object" ? String((data as { result?: unknown }).result ?? "") : "";
      if (!["processed", "already_paid"].includes(result)) return publicCard("REVIEW", context.amountCents, charge.brand, charge.last4);
    }

    return publicCard(charge.status, context.amountCents, charge.brand, charge.last4);
  }

  async processNotification(notificationToken: string) {
    const notification = await getEfiCardNotification(notificationToken);
    const { data, error } = await this.admin.rpc("process_efi_card_settlement", {
      target_charge_id: notification.chargeId,
      target_custom_id: notification.customId,
      target_amount_cents: notification.amountCents,
      target_provider_status: notification.status,
    });
    if (error) throw rpcError("process_efi_card_settlement", error.message);
    const result = data && typeof data === "object" ? String((data as { result?: unknown }).result ?? "") : "";
    if (!["processed", "pending", "unknown", "review", "already_paid"].includes(result)) throw new Error("EFI_CARD_INVALID_SETTLEMENT_RESULT");
    return { result };
  }
}
