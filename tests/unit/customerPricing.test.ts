import { describe, expect, it } from 'vitest';
import { suggestCustomerPrice } from '@/lib/domain/customerPricing';

describe('suggestCustomerPrice', () => {
  it('defaults to the central price when the customer has no margin condition', () => {
    expect(suggestCustomerPrice({ centralPrice: 150, currentCost: 100 })).toBe(150);
  });

  it('keeps the central price when it already clears the contracted minimum margin', () => {
    // cost 100, min margin 20% => floor price = ceil(100/0.8) = 125; central 150 already clears it
    expect(suggestCustomerPrice({ centralPrice: 150, currentCost: 100, minMarginPct: 20 })).toBe(150);
  });

  it('raises the suggestion to the margin floor when the central price would violate it', () => {
    // cost 100, min margin 30% => floor price = ceil(100/0.7) = 143; central 120 would violate it
    expect(suggestCustomerPrice({ centralPrice: 120, currentCost: 100, minMarginPct: 30 })).toBe(143);
  });
});
