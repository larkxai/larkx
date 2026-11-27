/** Fictional plant data. Nothing here is a customer record or a safety certification. */

export const PUMP = {
  id: "pump-12",
  name: "Cooling water pump",
  model: "P-104",
  identifier: "pump-12",
  location: "Building C, mechanical room",
  spec: "Centrifugal pump, 15 horsepower, mechanical seal, 90-day filter interval.",
  limit: "Normal vibration is under 4 mm/s. Seal leakage is not normal above 60 psi.",
} as const;

export const INSPECTION_NOTES = [
  "Pump 12: vibration increased after the last night shift.",
  "Seal weeps when pressure is above 80 psi.",
  "Last filter change was 140 days ago. The interval is 90 days.",
] as const;

export const PREVIOUS_INSPECTIONS = [
  {
    id: "insp-2026-08",
    date: "2026-08-12",
    note: "Filter changed. Seal was dry at 50 psi.",
  },
] as const;

export const SIMULATED_REPORT =
  "Pump 12 needs a seal inspection and a filter change. Vibration is above the local limit. This is an illustrative recommendation, not verified industrial safety advice.";
