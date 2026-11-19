export interface InspectionNote {
  readonly id: string;
  readonly area: string;
  readonly text: string;
}

export interface ChecklistItem {
  readonly noteId: string;
  readonly requirement: string;
  readonly severity: "high" | "medium" | "low";
}

export interface EquipmentRecord {
  readonly id: string;
  readonly name: string;
  readonly history: string;
}

export const INSPECTION_NOTES: readonly InspectionNote[] = [
  { id: "n-pump", area: "Basement", text: "Water leakage observed near the basement pump." },
  { id: "n-exit", area: "Stair B", text: "Emergency exit B partially obstructed." },
  { id: "n-hvac", area: "Roof", text: "Ventilation unit HVAC-03 producing unusual noise." },
  { id: "n-light", area: "Floor 2", text: "Corridor lighting on floor 2 is not working." },
  { id: "n-paint", area: "Reception", text: "Minor paint damage in the reception area." },
  { id: "n-ext", area: "Lobby", text: "Fire extinguisher inspection date overdue." },
  {
    id: "n-cab",
    area: "Electrical room",
    text: "Electrical cabinet temperature above the documented operating range.",
  },
];

export const MAINTENANCE_CHECKLIST: readonly ChecklistItem[] = [
  { noteId: "n-pump", requirement: "Basement pump area stays dry.", severity: "high" },
  { noteId: "n-exit", requirement: "Emergency exits stay clear.", severity: "high" },
  {
    noteId: "n-ext",
    requirement: "Fire extinguishers are within their inspection date.",
    severity: "high",
  },
  {
    noteId: "n-cab",
    requirement: "Electrical cabinets stay inside the documented temperature range.",
    severity: "high",
  },
  {
    noteId: "n-hvac",
    requirement: "Ventilation units run without new mechanical noise.",
    severity: "medium",
  },
  {
    noteId: "n-light",
    requirement: "Corridor lighting on occupied floors works.",
    severity: "medium",
  },
  {
    noteId: "n-paint",
    requirement: "Reception finishes are scheduled with routine upkeep.",
    severity: "low",
  },
];

export const EQUIPMENT_HISTORY: readonly EquipmentRecord[] = [
  { id: "PUMP-B1", name: "Basement pump", history: "Seal replaced on 14 Aug 2026." },
  { id: "EXIT-B", name: "Emergency exit B", history: "Checked clear on 1 Sep 2026." },
  {
    id: "HVAC-03",
    name: "Ventilation unit HVAC-03",
    history: "Filter replaced on 20 Jun 2026. No noise was recorded then.",
  },
  { id: "LIGHT-F2", name: "Floor 2 corridor lights", history: "Lamps replaced on 11 Jan 2026." },
  {
    id: "EXT-1",
    name: "Lobby fire extinguisher",
    history: "Last inspection 1 Oct 2025. The record says the interval is annual.",
  },
  {
    id: "CAB-E2",
    name: "Electrical cabinet",
    history:
      "Documented operating range tops out at 40 C. Last logged reading was 36 C on 2 Jul 2026.",
  },
];

export const SUGGESTED_PROMPT =
  "Review today's inspection notes, identify priority maintenance issues, and create a report.";
