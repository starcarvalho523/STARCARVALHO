import { timingSafeEqual } from "node:crypto";

export function isEfiPixProbeAuthorized(authorization: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const expectedToken = env.EFI_PIX_PROBE_TOKEN;
  if (!expectedToken || !authorization?.startsWith("Bearer ")) return false;
  const received = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
