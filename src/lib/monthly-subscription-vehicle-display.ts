export type MonthlySubscriptionVehicleLink = {
  id: string;
  vehicle_id: string;
  valid_until: string | null;
};

export type MonthlySubscriptionVehicle = {
  id: string;
  normalized_plate: string;
};

/**
 * Produces the CEO-facing vehicle label from the subscription links already
 * authorized for the current unit. A dangling active link is deliberately not
 * presented as an ordinary "no vehicle" state.
 */
export function monthlySubscriptionVehicleDisplay(
  links: MonthlySubscriptionVehicleLink[],
  vehicles: Map<string, MonthlySubscriptionVehicle>,
) {
  const activeLinks = links.filter((link) => !link.valid_until);
  if (!activeLinks.length) return "Sem veículo";

  const plates = activeLinks
    .map((link) => vehicles.get(link.vehicle_id)?.normalized_plate)
    .filter((plate): plate is string => Boolean(plate));

  if (plates.length !== activeLinks.length) return "Vínculo de veículo inconsistente";
  return plates.join(", ");
}
