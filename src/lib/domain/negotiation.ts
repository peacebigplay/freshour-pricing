// Negotiation case logic — Freshour Master Prompt v2, Section 19.

/**
 * supplier_max_cost = proposed_selling_price * (1 - effective_target_pct / 100)
 * The highest cost Pricing could still accept from the supplier while holding
 * the effective target margin at the customer's proposed selling price.
 */
export function supplierMaxCost(proposedSellingPrice: number, effectiveTargetPctValue: number): number {
  if (effectiveTargetPctValue >= 100) {
    throw new Error('effectiveTargetPct must be < 100');
  }
  return proposedSellingPrice * (1 - effectiveTargetPctValue / 100);
}
