// Customer Price Sheet generation — Freshour Master Prompt v2, Section 15.
// Pure function, no DB access, so it stays unit-testable.

/**
 * A customer's suggested price starts at the Central Price. If that
 * customer has a contracted minimum margin on this SKU
 * (`CustomerProductCondition.minMarginPct`), the suggestion never drops
 * below the price that protects that floor against today's cost.
 */
export function suggestCustomerPrice(params: {
  centralPrice: number;
  currentCost: number;
  minMarginPct?: number | null;
}): number {
  if (params.minMarginPct == null) return params.centralPrice;
  const floorPrice = Math.ceil(params.currentCost / (1 - params.minMarginPct / 100));
  return Math.max(params.centralPrice, floorPrice);
}
