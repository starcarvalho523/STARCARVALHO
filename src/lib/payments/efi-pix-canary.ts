import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEfiPixProductionRuntimeEnabled } from "@/lib/supabase/env";

export async function isEfiPixProductionCanaryForActor(
  sessionId: string,
  actorId: string,
): Promise<boolean> {
  if (!isEfiPixProductionRuntimeEnabled()) return false;
  if (!sessionId || !actorId) return false;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "is_efi_pix_production_canary_for_actor",
    { target_session: sessionId, target_actor: actorId },
  );

  if (error) return false;
  return data === true;
}
