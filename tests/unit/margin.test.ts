import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY_TARGETS,
  DEFAULT_GLOBAL_FLOOR_PCT,
  effectiveTargetPct,
  isBelowFloor,
  isBelowTarget,
  marginGuardPrice,
  marginPct,
} from '@/lib/domain/margin';

describe('effectiveTargetPct', () => {
  it('uses the category target when it is above the global floor', () => {
    expect(
      effectiveTargetPct({
        globalFloorPct: DEFAULT_GLOBAL_FLOOR_PCT,
        categoryTargetPct: DEFAULT_CATEGORY_TARGETS.POPULAR,
      }),
    ).toBe(20);
  });

  it('falls back to the global floor when the category target is lower', () => {
    expect(
      effectiveTargetPct({
        globalFloorPct: 12,
        categoryTargetPct: 8, // hypothetical mis-configured category target
      }),
    ).toBe(12);
  });

  it('prefers a SKU override over the category target', () => {
    expect(
      effectiveTargetPct({
        globalFloorPct: 12,
        categoryTargetPct: DEFAULT_CATEGORY_TARGETS.COMPETITIVE,
        skuOverridePct: 18,
      }),
    ).toBe(18);
  });

  it('the global floor still wins even over a too-low SKU override', () => {
    expect(
      effectiveTargetPct({
        globalFloorPct: 12,
        categoryTargetPct: DEFAULT_CATEGORY_TARGETS.COMPETITIVE,
        skuOverridePct: 5,
      }),
    ).toBe(12);
  });

  it('matches every default category target from Section 14', () => {
    expect(DEFAULT_CATEGORY_TARGETS).toEqual({
      COMPETITIVE: 12,
      POPULAR: 20,
      OFFAL: 40,
      OTHER: 15,
    });
  });
});

describe('marginPct', () => {
  it('computes margin percentage from selling price and cost', () => {
    expect(marginPct(100, 80)).toBeCloseTo(20, 10);
  });

  it('throws for a non-positive selling price', () => {
    expect(() => marginPct(0, 10)).toThrow();
  });
});

describe('marginGuardPrice', () => {
  it('computes the ceiling guard price for a target margin', () => {
    // cost 100 at 20% target => 100 / 0.8 = 125
    expect(marginGuardPrice(100, 20)).toBe(125);
  });

  it('rounds up (never down) so the guard never under-protects margin', () => {
    // 100 / (1 - 0.12) = 113.636... -> ceil to 114
    expect(marginGuardPrice(100, 12)).toBe(114);
  });

  it('the guard price always yields a margin at or above target', () => {
    const cost = 83;
    const target = 23.5;
    const guard = marginGuardPrice(cost, target);
    expect(marginPct(guard, cost)).toBeGreaterThanOrEqual(target);
  });
});

describe('isBelowFloor / isBelowTarget', () => {
  it('flags a price below the global floor', () => {
    expect(isBelowFloor(100, 92, 12)).toBe(true); // margin = 8% < 12%
    expect(isBelowFloor(100, 85, 12)).toBe(false); // margin = 15% >= 12%
  });

  it('flags a price below the effective target', () => {
    expect(isBelowTarget(100, 85, 20)).toBe(true); // margin = 15% < 20%
    expect(isBelowTarget(100, 70, 20)).toBe(false); // margin = 30% >= 20%
  });
});
