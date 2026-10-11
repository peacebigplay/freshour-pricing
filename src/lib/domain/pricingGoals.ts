// Pricing Goal alternatives — Freshour Master Prompt v2, Section 15.
// Produces suggested-price alternatives a Pricing user can choose between.
// All suggestions are explainable: every output carries the inputs that
// produced it so the UI can render "source cost -> margin rule -> suggested price".

import { effectiveTargetPct, marginGuardPrice, marginPct } from './margin';

export type PricingGoal = 'COMPETITIVE' | 'HOLD' | 'TARGET' | 'PROTECT';

export interface PricingGoalInput {
  currentCost: number;
  previousApprovedPrice: number | null;
  effectiveTargetPctValue: number;
  /** Lowest known competitor reference price, if a verified Market Snapshot exists. */
  marketReferencePrice?: number | null;
}

export interface PricingGoalSuggestion {
  goal: PricingGoal;
  suggestedPrice: number;
  resultingMarginPct: number;
  belowFloor: boolean;
  rationale: string;
}

export function suggestPricingGoals(
  input: PricingGoalInput,
  globalFloorPct: number,
): PricingGoalSuggestion[] {
  const guard = marginGuardPrice(input.currentCost, input.effectiveTargetPctValue);
  const suggestions: PricingGoalSuggestion[] = [];

  // HOLD: keep the previously approved price if it still clears the floor guard.
  const holdPrice = input.previousApprovedPrice ?? guard;
  suggestions.push(buildSuggestion('HOLD', holdPrice, input.currentCost, globalFloorPct,
    'Keep the previously approved price.'));

  // TARGET: price that lands exactly on the effective target margin.
  suggestions.push(buildSuggestion('TARGET', guard, input.currentCost, globalFloorPct,
    `Price for the effective target margin (${input.effectiveTargetPctValue.toFixed(1)}%).`));

  // PROTECT: add a buffer above target to protect margin against future cost moves.
  const protectPrice = Math.ceil(guard * 1.03);
  suggestions.push(buildSuggestion('PROTECT', protectPrice, input.currentCost, globalFloorPct,
    'Target margin plus a 3% buffer against near-term cost movement.'));

  // COMPETITIVE: match market reference when available, never below the floor guard.
  if (input.marketReferencePrice != null) {
    const floorGuard = marginGuardPrice(input.currentCost, globalFloorPct);
    const competitivePrice = Math.max(input.marketReferencePrice, floorGuard);
    suggestions.push(buildSuggestion('COMPETITIVE', competitivePrice, input.currentCost, globalFloorPct,
      'Match verified market reference, floored at the global minimum margin.'));
  }

  return suggestions;
}

function buildSuggestion(
  goal: PricingGoal,
  price: number,
  currentCost: number,
  globalFloorPct: number,
  rationale: string,
): PricingGoalSuggestion {
  const resulting = marginPct(price, currentCost);
  return {
    goal,
    suggestedPrice: price,
    resultingMarginPct: resulting,
    belowFloor: resulting < globalFloorPct,
    rationale,
  };
}

export { effectiveTargetPct };
