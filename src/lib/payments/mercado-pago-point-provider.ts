import type { PointPaymentProvider, PointTerminalSnapshot } from "./payment-provider";

export class MercadoPagoPointProvider implements PointPaymentProvider {
  readonly name = "MERCADO_PAGO" as const;
  readonly capabilities = [
    { method: "DEBIT_CARD", channel: "POINT" },
    { method: "CREDIT_CARD", channel: "POINT" },
  ] as const;

  evaluateReadiness(terminals: readonly PointTerminalSnapshot[], integrationEnabled: boolean) {
    const terminalReady = terminals.some((terminal) =>
      terminal.enabled && terminal.status === "READY" && terminal.operatingMode === "PDV");
    if (!terminalReady) return { terminalReady: false, operational: false, reason: "AWAITING_TERMINAL" as const };
    if (!integrationEnabled) return { terminalReady: true, operational: false, reason: "INTEGRATION_DISABLED" as const };
    return { terminalReady: true, operational: true, reason: "READY" as const };
  }
}

