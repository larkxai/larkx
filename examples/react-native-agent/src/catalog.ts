export const ROOM = {
  name: "Living room",
  lengthM: 6,
  widthM: 4,
  windows: 2,
  notes: "North light. Existing oak floor stays.",
} as const;

export const BUDGET = {
  currency: "USD",
  remaining: 2000,
} as const;

export const FURNITURE = [
  { name: "Linen sofa", price: 900, tags: ["sofa", "seating"] },
  { name: "Oak coffee table", price: 240, tags: ["table", "oak"] },
  { name: "Linen curtains", price: 120, tags: ["window", "linen"] },
  { name: "Floor lamp", price: 85, tags: ["light", "lamp"] },
  { name: "Wool rug", price: 310, tags: ["rug", "floor"] },
] as const;

export const REQUEST = "Create a renovation plan for my living room with a $2,000 budget.";

export function searchCatalog(query: string): { name: string; price: number }[] {
  const needle = query.trim().toLowerCase();
  return FURNITURE.filter((item) => {
    if (needle.length === 0) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(needle) || item.tags.some((tag) => tag.includes(needle))
    );
  }).map((item) => ({ name: item.name, price: item.price }));
}
