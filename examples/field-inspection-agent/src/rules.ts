export type Severity = "high" | "medium" | "low" | "unspecified";

export interface MaintenanceRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly severity: Exclude<Severity, "unspecified">;
  readonly label: string;
}

/** Local rubric shown to the classification stage. These are rules, not inspection notes. */
export const MAINTENANCE_RULES: readonly MaintenanceRule[] = [
  {
    id: "water",
    pattern: /water|leak|pump/i,
    severity: "high",
    label: "Water, leaks, and pumps are high.",
  },
  {
    id: "exit",
    pattern: /exit|obstruct|blocked/i,
    severity: "high",
    label: "Blocked or obstructed exits are high.",
  },
  {
    id: "fire",
    pattern: /extinguisher|fire/i,
    severity: "high",
    label: "Fire equipment problems are high.",
  },
  {
    id: "electrical",
    pattern: /electrical|cabinet|temperature/i,
    severity: "high",
    label: "Electrical and temperature problems are high.",
  },
  {
    id: "hvac",
    pattern: /hvac|noise|ventilation/i,
    severity: "medium",
    label: "Ventilation noise is medium.",
  },
  {
    id: "light",
    pattern: /light|lighting|lamp/i,
    severity: "medium",
    label: "Lighting failures are medium.",
  },
  {
    id: "finish",
    pattern: /paint|finish|cosmetic/i,
    severity: "low",
    label: "Paint and cosmetic damage are low.",
  },
];

export function ruleLines(): string {
  return MAINTENANCE_RULES.map((rule) => rule.label).join(" ");
}

/** Used by the scripted test model so it follows the same rubric as the prompt. */
export function severityFor(text: string): { severity: Severity; rule: string | null } {
  const match = MAINTENANCE_RULES.find((rule) => rule.pattern.test(text));
  if (!match) {
    return { severity: "unspecified", rule: null };
  }
  return { severity: match.severity, rule: match.label };
}
