import { CarFront } from "lucide-react";

function MotorcycleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="5" cy="17" r="2.5" />
      <circle cx="19" cy="17" r="2.5" />
      <path d="M7.5 17h3.2l2.3-5h3.8" />
      <path d="M10.7 17 8.5 12H6" />
      <path d="M13 12h2.8l1.7 2.2" />
      <path d="m16.7 9 1.4 3" />
      <path d="M14.8 9h3.6" />
    </svg>
  );
}

export function VehicleTypeIcon({
  vehicleType,
  className,
}: {
  vehicleType: string;
  className?: string;
}) {
  if (vehicleType === "MOTORCYCLE") return <MotorcycleIcon className={className} />;
  return <CarFront className={className} aria-hidden="true" />;
}

export function VehicleGroupIcon({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-[2px] overflow-visible ${className ?? "size-5"}`}
      aria-hidden="true"
    >
      <span className="inline-flex h-full w-full scale-[1.32] items-center justify-center gap-[2px]">
        <CarFront className="h-[92%] w-[44%] shrink-0" />
        <span className="h-[88%] w-[1.5px] shrink-0 rounded-full bg-current opacity-50" />
        <MotorcycleIcon className="h-[92%] w-[44%] shrink-0" />
      </span>
    </span>
  );
}
