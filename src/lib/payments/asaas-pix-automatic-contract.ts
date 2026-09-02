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

function recordOrNull(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeAuthorizationStatus(value: unknown): AsaasPixAutomaticAuthorizationStatus | null {
  const raw = stringOrNull(value)?.toUpperCase() ?? null;
  if (raw === "CREATED") return "PENDING";
  return raw && AUTHORIZATION_STATES.has(raw as AsaasPixAutomaticAuthorizationStatus)
    ? raw as AsaasPixAutomaticAuthorizationStatus
    : null;
}

export function parseAsaasPixAutomaticWebhook(input: unknown): AsaasPixAutomaticWebhookEvent {
  const body = recordOrNull(input);
  if (!body) throw new Error("ASAAS_PIX_AUTOMATIC_INVALID_PAYLOAD");

  const authorization = recordOrNull(body.authorization);
  const subscription = recordOrNull(body.subscription);
  const instruction = recordOrNull(body.paymentInstruction);
  const instructionAuthorization = recordOrNull(instruction?.authorization);

  const id = stringOrNull(body.id);
  const event = stringOrNull(body.event);
  if (!id || !event) throw new Error("ASAAS_PIX_AUTOMATIC_EVENT_ID_REQUIRED");

  const isAuthorizationEvent = event.startsWith("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_");

  return {
    id,
    event,
    authorizationId: stringOrNull(
      authorization?.id ?? instructionAuthorization?.id ?? body.authorizationId,
    ),
    subscriptionId: stringOrNull(subscription?.id ?? body.subscriptionId),
    status: isAuthorizationEvent
      ? normalizeAuthorizationStatus(authorization?.status ?? body.status)
      : null,
    occurredAt: stringOrNull(body.dateCreated ?? body.occurredAt),
  };
}
