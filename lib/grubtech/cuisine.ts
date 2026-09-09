/**
 * GrubCenter's live API never sends a cuisine/category field for any order —
 * confirmed by inspecting the full raw payload from every one of its 3
 * endpoints (location-performance, order-details, cancelled-orders) — so
 * `Brand.cuisine` was silently staying null for every brand ingested via
 * live sync, leaving the Cuisine Cluster chart/table with nothing to group
 * by. Only a CSV import's real "Cuisine Cluster" column ever carries an
 * actual value; this is a same-business fallback for everything else,
 * matched by keyword against the brand name (this is a virtual-brand cloud
 * kitchen, so names are already descriptive: "Alfredo Pasta", "Pizza
 * District", "Grill & Protein bowls", etc.).
 */
const CUISINE_KEYWORDS: [RegExp, string][] = [
  [/pizza/i, "Pizza"],
  [/pasta/i, "Pasta & Italian"],
  [/burger/i, "Burgers"],
  [/manak|manou|manoo|mankou|fatayer|fateera|zaatar|furn|dukkan/i, "Manakeesh & Levantine"],
  [/healthy|grill|protein|muscle|\bfit\b|macro|vital|purely/i, "Healthy & Grill"],
  [/baker/i, "Bakery"],
];

export function inferCuisineFromBrandName(name: string): string {
  for (const [pattern, cuisine] of CUISINE_KEYWORDS) {
    if (pattern.test(name)) return cuisine;
  }
  return "Other";
}
