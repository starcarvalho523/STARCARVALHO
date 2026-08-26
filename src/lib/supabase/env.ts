const PRODUCTION_VERCEL_HOST = "starcarvalho.vercel.app";
const EFI_CARD_QA_PREVIEW_BRANCH = "feat/efi-credit-card-sandbox";
const EFI_CARD_PRODUCTION_BRANCH = "main";
const QA_SUPABASE_URL = "https://hqdaqijgloeiqrljulqx.supabase.co";
// Supabase publishable keys are intentionally public client credentials; RLS remains the security boundary.
const QA_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VjQXDvN3oA0F1PHQKmzLkA_8GFzFT45";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error("Variável de ambiente obrigatória ausente: " + name);
  return value;
}

function normalizeHostname(hostname?: string | null) {
  return (hostname ?? "").trim().toLowerCase().split(":")[0];
}

export function isVercelPreviewHost(hostname?: string | null) {
  const host = normalizeHostname(hostname);
  return host.endsWith(".vercel.app") && host !== PRODUCTION_VERCEL_HOST;
}

export function isEfiCardQaPreviewRuntime(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return (
    environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_GIT_COMMIT_REF === EFI_CARD_QA_PREVIEW_BRANCH
  );
}

/**
 * Production card runtime gate. This is deliberately not wired into the active
 * payment routes yet. A future rollout must satisfy all three conditions and
 * separately pass provider configuration + database capability checks.
 */
export function isEfiCardProductionRuntimeEnabled(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return (
    environment.VERCEL_ENV === "production" &&
    environment.VERCEL_GIT_COMMIT_REF === EFI_CARD_PRODUCTION_BRANCH &&
    environment.EFI_CARD_PRODUCTION_ENABLED === "true"
  );
}

export function getServerSupabaseEnvironment() {
  if (isEfiCardQaPreviewRuntime()) {
    return {
      url: QA_SUPABASE_URL,
      publishableKey: QA_SUPABASE_PUBLISHABLE_KEY,
      environment: "qa" as const,
    };
  }

  return getSupabaseEnvironment();
}

export function getSupabaseEnvironment(hostname?: string | null) {
  if (isVercelPreviewHost(hostname)) {
    return {
      url: QA_SUPABASE_URL,
      publishableKey: QA_SUPABASE_PUBLISHABLE_KEY,
      environment: "qa" as const,
    };
  }

  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    environment: "configured" as const,
  };
}
