import { Bike, CarFront } from "lucide-react";

export function VehicleTypeIcon({
  vehicleType,
  className,
}: {
  vehicleType: string;
  className?: string;
}) {
  const Icon = vehicleType === "MOTORCYCLE" ? Bike : CarFront;
  return <Icon className={className} aria-hidden="true" />;
}
