import type { EfiPixWebhookEvent } from "./efi-pix-webhook-contract";

export type EfiPixSettlementResult = "processed" | "duplicate" | "unknown" | "review" | "provider_mismatch" | "already_paid";

export type EfiPixSettlementPort = {
  settle(event: EfiPixWebhookEvent, idempotencyKey: string): Promise<EfiPixSettlementResult>;
};

/** Keeps provider callbacks deterministic before persistence is attempted. */
export async function settleEfiPixEvents(events: readonly EfiPixWebhookEvent[], port: EfiPixSettlementPort, keyFor: (event: EfiPixWebhookEvent) => string) {
  const results: EfiPixSettlementResult[] = [];
  for (const event of events) results.push(await port.settle(event, keyFor(event)));
  return results;
}
