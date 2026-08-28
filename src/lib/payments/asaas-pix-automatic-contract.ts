export type AsaasPixAutomaticAuthorizationStatus =
  | "PENDING"
  | "ACTIVE"
  | "REFUSED"
  | "CANCELLED"
  | "EXPIRED";

export type AsaasPixAutomaticWebhookEvent = {
  id: string;
  event: string;
  authorizationId: string | null;
  subscriptionId: string | null;
  status: AsaasPixAutomaticAuthorizationStatus | null;
  occurredAt: string | null;
};

const AUTHORIZATION_STATES = new Set<AsaasPixAutomaticAuthorizationStatus>([
  "PENDING",
  "ACTIVE",
  "REFUSED",
  "CANCELLED",
  "EXPIRED",
]);

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseAsaasPixAutomaticWebhook(input: unknown): AsaasPixAutomaticWebhookEvent {
  if (!input || typeof input !== "object") throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_PAYLOAD");
  const body = input as Record<string, unknown>;
  const authorization = body.authorization && typeof body.authorization === "object"
    ? body.authorization as Record<string, unknown>
    : null;
  const subscription = body.subscription && typeof body.subscription === "object"
    ? body.subscription as Record<string, unknown>
    : null;

  const id = stringOrNull(body.id);
  const event = stringOrNull(body.event);
  if (!id || !event) throw new Error("ASAAS_PIX_AUTOMATIC_EVENT_ID_REQUIRED");

  const rawStatus = stringOrNull(authorization?.status ?? body.status)?.toUpperCase() ?? null;
  const status = rawStatus && AUTHORIZATION_STATES.has(rawStatus as AsaasPixAutomaticAuthorizationStatus)
    ? rawStatus as AsaasPixAutomaticAuthorizationStatus
    : null;

  return {
    id,
    event,
    authorizationId: stringOrNull(authorization?.id ?? body.authorizationId),
    subscriptionId: stringOrNull(subscription?.id ?? body.subscriptionId),
    status,
    occurredAt: stringOrNull(body.dateCreated ?? body.occurredAt),
  };
}
