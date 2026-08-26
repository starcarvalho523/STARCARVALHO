import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { EfiCardProviderError, createEfiOneStep, getEfiCardNotification, type EfiCardPayer, type EfiCardState } from "./efi-credit-card-client";

type CardContext = {
  paymentId: string;
  status: string;
  amountCents: number;
  chargeId: string | null;
  providerStatus: string | null;
  creationState: string | null;
};

export type EfiCardMetadata = {
  brand: string;
  last4: string;
};

export class EfiCardServiceError extends Error {
  constructor(readonly publicCode: string, readonly httpStatus: number) {
    super(publicCode);
  }
}

function rpcError(name: string) {
  return new EfiCardServiceError(`${name.toUpperCase()}_FAILED`, 502);
}

function publicCard(state: EfiCardState, amountCents: number, brand: string | null = null, last4: string | null = null) {
  return { state, amount: amountCents / 100, brand, last4 };
}

function rpcResult(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export class EfiCardService {
  constructor(private readonly admin = createAdminClient()) {}

  private async context(paymentId: string): Promise<CardContext> {
    const { data, error } = await this.admin.rpc("get_efi_card_payment_context", { target_payment: paymentId });
    if (error) throw rpcError("get_efi_card_payment_context");
    const value = data as Record<string, unknown> | null;
    if (!value || typeof value.paymentId !== "string" || typeof value.status !== "string" || typeof value.amountCents !== "number" || !Number.isSafeInteger(value.amountCents) || value.amountCents <= 0) {
      throw new EfiCardServiceError("EFI_CARD_INVALID_CONTEXT", 502);
    }
    return {
      paymentId: value.paymentId,
      status: value.status,
      amountCents: value.amountCents,
      chargeId: typeof value.chargeId === "string" ? value.chargeId : null,
      providerStatus: typeof value.providerStatus === "string" ? value.providerStatus : null,
      creationState: typeof value.creationState === "string" ? value.creationState : null,
    };
  }

  private async markFailure(paymentId: string, cause: EfiCardProviderError) {
    const state = !cause.providerPostSent ? "FAILED_BEFORE_PROVIDER" : cause.uncertain ? "UNCERTAIN" : "REJECTED";
    const { error } = await this.admin.rpc("mark_efi_card_creation_failure", {
      target_payment: paymentId,
      target_state: state,
      target_stage: cause.stage,
      target_provider_code: cause.providerCode,
    });
    if (error) throw rpcError("mark_efi_card_creation_failure");
  }

  async createPayment(paymentId: string, paymentToken: string, payer: EfiCardPayer, cardMeta: EfiCardMetadata) {
    const context = await this.context(paymentId);
    if (context.status === "PAID") return publicCard("PAID", context.amountCents);
    if (context.status !== "PENDING") throw new EfiCardServiceError("EFI_CARD_PAYMENT_NOT_PENDING", 409);
    if (context.chargeId) {
      const state: EfiCardState = context.providerStatus === "PAID" ? "PAID" : context.providerStatus === "FAILED" ? "FAILED" : context.providerStatus === "REVIEW" ? "REVIEW" : "PENDING";
      return publicCard(state, context.amountCents);
    }
    if (context.creationState) {
      throw new EfiCardServiceError(`EFI_CARD_CREATION_${context.creationState}`, 409);
    }

    const { data: claimData, error: claimError } = await this.admin.rpc("claim_efi_card_creation", { target_payment: context.paymentId });
    if (claimError) throw rpcError("claim_efi_card_creation");
    const claim = rpcResult(claimData);
    if (claim.result !== "claimed") {
      throw new EfiCardServiceError(`EFI_CARD_CREATION_${String(claim.state ?? "BLOCKED")}`, 409);
    }

    let charge;
    try {
      charge = await createEfiOneStep({
        paymentToken,
        amountCents: context.amountCents,
        payer,
        externalReference: context.paymentId,
      });
    } catch (cause) {
      if (cause instanceof EfiCardProviderError) {
        await this.markFailure(context.paymentId, cause);
        throw cause;
      }
      const unknown = new EfiCardProviderError("EFI_CARD_UNKNOWN_AFTER_CLAIM", 0, null, "PROVIDER_POST", true, true);
      await this.markFailure(context.paymentId, unknown);
      throw unknown;
    }

    const persistedBrand = charge.brand ?? cardMeta.brand;
    const persistedLast4 = charge.last4 ?? cardMeta.last4;
    const { error: completeError } = await this.admin.rpc("complete_efi_card_creation", {
      target_payment: context.paymentId,
      target_charge_id: charge.chargeId,
      target_status: charge.status,
      target_brand: persistedBrand,
      target_last4: persistedLast4,
    });
    if (completeError) {
      throw new EfiCardServiceError("EFI_CARD_LOCAL_PERSISTENCE_FAILED", 502);
    }

    if (charge.status === "PAID" || charge.status === "FAILED") {
      const { data, error } = await this.admin.rpc("process_efi_card_settlement", {
        target_charge_id: charge.chargeId,
        target_custom_id: context.paymentId,
        target_amount_cents: context.amountCents,
        target_provider_status: charge.status,
      });
      if (error) throw new EfiCardServiceError("EFI_CARD_SETTLEMENT_FAILED", 502);
      const result = data && typeof data === "object" ? String((data as { result?: unknown }).result ?? "") : "";
      if (!["processed", "already_paid"].includes(result)) return publicCard("REVIEW", context.amountCents, persistedBrand, persistedLast4);
    }

    return publicCard(charge.status, context.amountCents, persistedBrand, persistedLast4);
  }

  async processNotification(notificationToken: string) {
    const notification = await getEfiCardNotification(notificationToken);
    const { data, error } = await this.admin.rpc("process_efi_card_settlement", {
      target_charge_id: notification.chargeId,
      target_custom_id: notification.customId,
      target_amount_cents: notification.amountCents,
      target_provider_status: notification.status,
    });
    if (error) throw rpcError("process_efi_card_settlement");
    const result = data && typeof data === "object" ? String((data as { result?: unknown }).result ?? "") : "";
    if (!["processed", "pending", "unknown", "review", "already_paid"].includes(result)) throw new EfiCardServiceError("EFI_CARD_INVALID_SETTLEMENT_RESULT", 502);
    return { result };
  }
}
