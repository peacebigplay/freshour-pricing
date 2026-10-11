import { describe, expect, it } from 'vitest';
import { suggestPricingGoals } from '@/lib/domain/pricingGoals';

describe('suggestPricingGoals', () => {
  const base = {
    currentCost: 100,
    previousApprovedPrice: 118,
    effectiveTargetPctValue: 20,
  };

  it('always returns HOLD, TARGET, and PROTECT goals', () => {
    const goals = suggestPricingGoals(base, 12).map((g) => g.goal);
    expect(goals).toContain('HOLD');
    expect(goals).toContain('TARGET');
    expect(goals).toContain('PROTECT');
  });

  it('only returns COMPETITIVE when a market reference exists', () => {
    const withoutMarket = suggestPricingGoals(base, 12);
    expect(withoutMarket.some((g) => g.goal === 'COMPETITIVE')).toBe(false);

    const withMarket = suggestPricingGoals({ ...base, marketReferencePrice: 130 }, 12);
    expect(withMarket.some((g) => g.goal === 'COMPETITIVE')).toBe(true);
  });

  it('TARGET suggestion lands at (or above, due to rounding) the effective target margin', () => {
    const goals = suggestPricingGoals(base, 12);
    const target = goals.find((g) => g.goal === 'TARGET')!;
    expect(target.resultingMarginPct).toBeGreaterThanOrEqual(20);
  });

  it('PROTECT suggestion yields a higher margin than TARGET', () => {
    const goals = suggestPricingGoals(base, 12);
    const target = goals.find((g) => g.goal === 'TARGET')!;
    const protect = goals.find((g) => g.goal === 'PROTECT')!;
    expect(protect.resultingMarginPct).toBeGreaterThan(target.resultingMarginPct);
  });

  it('never suggests a COMPETITIVE price below the global floor guard', () => {
    const goals = suggestPricingGoals({ ...base, marketReferencePrice: 90 }, 12);
    const competitive = goals.find((g) => g.goal === 'COMPETITIVE')!;
    expect(competitive.belowFloor).toBe(false);
  });

  it('flags belowFloor when the previous approved price (HOLD) has drifted under the floor', () => {
    const goals = suggestPricingGoals({ ...base, previousApprovedPrice: 105 }, 12);
    const hold = goals.find((g) => g.goal === 'HOLD')!;
    // margin at 105 selling / 100 cost = 4.76% < 12% floor
    expect(hold.belowFloor).toBe(true);
  });
});
