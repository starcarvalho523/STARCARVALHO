import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEfiCardProductionRuntimeEnabled } from "@/lib/supabase/env";

export async function isEfiCardProductionCanaryForActor(
  sessionId: string,
  actorId: string,
): Promise<boolean> {
  if (!isEfiCardProductionRuntimeEnabled()) return false;
  if (!sessionId || !actorId) return false;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "is_efi_card_production_canary_for_actor",
    { target_session: sessionId, target_actor: actorId },
  );

  if (error) return false;
  return data === true;
}
