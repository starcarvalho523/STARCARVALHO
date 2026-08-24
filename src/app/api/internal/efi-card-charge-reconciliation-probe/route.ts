import { NextResponse } from "next/server";
import { resolveEfiCreditCardConfig } from "@/lib/payments/efi-credit-card-config";

export const dynamic = "force-dynamic";

const PAYMENT_ID = "0c8d2277-42e5-401b-9194-1aa9b35bd6e2";
const TARGET_TOTAL = 500;
const TARGET_TIME = Date.parse("2026-08-24T02:50:17.000Z");

function safeRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    .map((row) => {
      const payment = row.payment && typeof row.payment === "object" && !Array.isArray(row.payment)
        ? row.payment as Record<string, unknown>
        : {};
      const id = row.id ?? row.charge_id;
      const createdAt = typeof row.created_at === "string" ? row.created_at : null;
      const createdMs = createdAt ? Date.parse(createdAt) : Number.NaN;
      const total = typeof row.total === "number" ? row.total : typeof row.value === "number" ? row.value : null;
      const method = typeof payment.payment_method === "string"
        ? payment.payment_method
        : typeof payment.method === "string"
          ? payment.method
          : typeof row.payment_method === "string"
            ? row.payment_method
            : null;
      const customId = typeof row.custom_id === "string" ? row.custom_id : null;
      return {
        chargeIdPresent: typeof id === "number" || typeof id === "string",
        chargeId: typeof id === "number" || typeof id === "string" ? String(id) : null,
        status: typeof row.status === "string" ? row.status : null,
        value: total,
        customIdMatch: customId === PAYMENT_ID,
        createdAt,
        paymentMethod: method,
        candidate: total === TARGET_TOTAL && method === "credit_card" && Number.isFinite(createdMs) && Math.abs(createdMs - TARGET_TIME) <= 15 * 60 * 1000,
      };
    });
}

async function listCharges(baseUrl: string, token: string, chargeType: string, customId?: string) {
  const params = new URLSearchParams({
    charge_type: chargeType,
    begin_date: "2026-08-24",
    end_date: "2026-08-24",
    limit: "100",
    page: "1",
  });
  if (customId) params.set("custom_id", customId);

  const response = await fetch(`${baseUrl}/v1/charges?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { data?: unknown } | null;
  return { status: response.status, rows: safeRows(payload?.data) };
}

export async function GET() {
  try {
    const config = resolveEfiCreditCardConfig();
    const authorization = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    const authResponse = await fetch(`${config.baseUrl}/v1/authorize`, {
      method: "POST",
      headers: {
        authorization: `Basic ${authorization}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
      cache: "no-store",
    });
    const authPayload = await authResponse.json().catch(() => null) as { access_token?: unknown } | null;
    if (!authResponse.ok || typeof authPayload?.access_token !== "string" || !authPayload.access_token) {
      return NextResponse.json({ oauth: "FAIL", oauthStatus: authResponse.status, listStatus: null, queryValid: false, customIdCount: null, windowCount: null, chargeType: null, matches: [] });
    }

    const candidates = ["one_step", "credit_card", "charge"];
    let selected: string | null = null;
    let specific: { status: number; rows: ReturnType<typeof safeRows> } | null = null;
    for (const chargeType of candidates) {
      const result = await listCharges(config.baseUrl, authPayload.access_token, chargeType, PAYMENT_ID);
      if (result.status === 200) {
        selected = chargeType;
        specific = result;
        break;
      }
      if (result.status !== 400 && result.status !== 422) {
        selected = chargeType;
        specific = result;
        break;
      }
    }

    if (!specific || specific.status !== 200) {
      return NextResponse.json({ oauth: "PASS", oauthStatus: authResponse.status, listStatus: specific?.status ?? null, queryValid: false, customIdCount: null, windowCount: null, chargeType: selected, matches: [] });
    }

    const broad = specific.rows.length === 0 && selected
      ? await listCharges(config.baseUrl, authPayload.access_token, selected)
      : null;
    const broadCandidates = broad?.rows.filter((row) => row.candidate) ?? [];
    const matches = specific.rows.length > 0 ? specific.rows : broadCandidates;

    return NextResponse.json({
      oauth: "PASS",
      oauthStatus: authResponse.status,
      listStatus: specific.status,
      queryValid: true,
      customIdCount: specific.rows.length,
      windowCount: broad ? broadCandidates.length : null,
      chargeType: selected,
      matches: matches.map(({ candidate: _candidate, ...row }) => row),
    });
  } catch (error) {
    return NextResponse.json({ oauth: "FAIL", oauthStatus: null, listStatus: null, queryValid: false, customIdCount: null, windowCount: null, chargeType: null, matches: [], code: error instanceof Error ? error.message : "UNKNOWN" });
  }
}
