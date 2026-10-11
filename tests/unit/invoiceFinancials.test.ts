import { describe, expect, it } from 'vitest';
import { grossProfitCoverage, lineGrossProfit, sumPostedRevenue } from '@/lib/domain/invoiceFinancials';

describe('lineGrossProfit', () => {
  it('computes net sales minus recognized cost', () => {
    expect(lineGrossProfit({ netSales: 500, recognizedCost: 380 })).toBe(120);
  });

  it('returns null (COST_PENDING) instead of guessing when cost is unresolved', () => {
    expect(lineGrossProfit({ netSales: 500, recognizedCost: null })).toBeNull();
  });
});

describe('sumPostedRevenue', () => {
  it('sums net sales across posted invoice lines only (caller filters by POSTED)', () => {
    expect(
      sumPostedRevenue([
        { netSales: 100, recognizedCost: 80 },
        { netSales: 200, recognizedCost: null },
      ]),
    ).toBe(300);
  });
});

describe('grossProfitCoverage', () => {
  it('reports coverage percentage and total GP excluding pending lines', () => {
    const result = grossProfitCoverage([
      { netSales: 100, recognizedCost: 80 }, // gp 20
      { netSales: 200, recognizedCost: 150 }, // gp 50
      { netSales: 50, recognizedCost: null }, // pending
    ]);
    expect(result.totalGp).toBe(70);
    expect(result.costPendingLineCount).toBe(1);
    expect(result.coveragePct).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('never falls back to invoice_total * fixed_margin_percent — a fully pending set has 0 GP, not a guess', () => {
    const result = grossProfitCoverage([{ netSales: 1000, recognizedCost: null }]);
    expect(result.totalGp).toBe(0);
    expect(result.costPendingLineCount).toBe(1);
    expect(result.coveragePct).toBe(0);
  });
});
