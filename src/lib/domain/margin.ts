// Margin Policy business rules — Freshour Master Prompt v2, Section 14.
// Pure functions only. No DB access here so these stay unit-testable.

export type MarginCategory = 'COMPETITIVE' | 'POPULAR' | 'OFFAL' | 'OTHER';

export const DEFAULT_GLOBAL_FLOOR_PCT = 12;

export const DEFAULT_CATEGORY_TARGETS: Record<MarginCategory, number> = {
  COMPETITIVE: 12,
  POPULAR: 20,
  OFFAL: 40,
  OTHER: 15,
};

/**
 * effective_target_pct = max(global_floor_pct, resolved_category_target_pct)
 * A SKU-specific override (when present) replaces the category target before
 * this max is taken — the floor still always wins if the override is lower.
 */
export function effectiveTargetPct(params: {
  globalFloorPct: number;
  categoryTargetPct: number;
  skuOverridePct?: number | null;
}): number {
  const resolved = params.skuOverridePct ?? params.categoryTargetPct;
  return Math.max(params.globalFloorPct, resolved);
}

/**
 * margin_pct = ((selling_price - current_cost) / selling_price) * 100
 */
export function marginPct(sellingPrice: number, currentCost: number): number {
  if (sellingPrice <= 0) {
    throw new Error('sellingPrice must be > 0 to compute margin');
  }
  return ((sellingPrice - currentCost) / sellingPrice) * 100;
}

/**
 * margin_guard_price = ceil(current_cost / (1 - effective_target_pct / 100))
 */
export function marginGuardPrice(currentCost: number, effectiveTargetPctValue: number): number {
  if (effectiveTargetPctValue >= 100) {
    throw new Error('effectiveTargetPct must be < 100');
  }
  return Math.ceil(currentCost / (1 - effectiveTargetPctValue / 100));
}

export function isBelowFloor(sellingPrice: number, currentCost: number, globalFloorPct: number): boolean {
  return marginPct(sellingPrice, currentCost) < globalFloorPct;
}

export function isBelowTarget(
  sellingPrice: number,
  currentCost: number,
  effectiveTargetPctValue: number,
): boolean {
  return marginPct(sellingPrice, currentCost) < effectiveTargetPctValue;
}
