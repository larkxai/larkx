export interface CatalogRow {
  readonly component: string;
  readonly model: string;
  readonly supplier: string;
  readonly part: string;
  readonly estimatedPrice: number;
  readonly simulated: true;
}

/** Fictional catalog. Every row is simulated supplier data. */
export const SIMULATED_CATALOG: readonly CatalogRow[] = [
  {
    component: "mechanical seal",
    model: "P-104",
    supplier: "Example Industrial Supply",
    part: "MS-240",
    estimatedPrice: 240,
    simulated: true,
  },
  {
    component: "bearing",
    model: "P-104",
    supplier: "Example Industrial Supply",
    part: "BR-18",
    estimatedPrice: 86,
    simulated: true,
  },
];

export function searchCatalog(request: string): CatalogRow | undefined {
  const text = request.toLowerCase();
  return SIMULATED_CATALOG.find(
    (row) => text.includes(row.component) && text.includes(row.model.toLowerCase()),
  );
}
