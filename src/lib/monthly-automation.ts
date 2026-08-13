export type MonthlyAutomationResult = {
  processed: number;
  created: number;
  existing: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
};

export function monthlyReminder(dueDate: string, graceUntil: string, today: Date) {
  const civil = (value: string) => { const [year, month, day] = value.split("-").map(Number); return Date.UTC(year, month - 1, day); };
  const day = civil(dueDate);
  const grace = civil(graceUntil);
  const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = (day - current) / 86_400_000;
  if (current > grace) return "Inadimplente";
  if (current > day) return `Vencida — em carência até ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${graceUntil}T12:00:00`))}`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  if (days === 3 || days === 7) return `Vence em ${days} dias`;
  return null;
}
