import "server-only";

export function daysAgoIso(days: number, now = new Date()) {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() - Math.max(0, days));
  return result.toISOString();
}

export function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
