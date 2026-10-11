import { describe, expect, it } from 'vitest';
import { supplierMaxCost } from '@/lib/domain/negotiation';

describe('supplierMaxCost', () => {
  it('computes the max supplier cost that still clears target margin', () => {
    // 120 * (1 - 0.20) = 96
    expect(supplierMaxCost(120, 20)).toBeCloseTo(96, 10);
  });

  it('a lower proposed selling price lowers the max acceptable supplier cost', () => {
    const higher = supplierMaxCost(150, 20);
    const lower = supplierMaxCost(100, 20);
    expect(lower).toBeLessThan(higher);
  });

  it('throws for an invalid (>=100%) target margin', () => {
    expect(() => supplierMaxCost(100, 100)).toThrow();
  });
});
