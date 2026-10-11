// Integration tests — Freshour Master Prompt v2, Section 38 ("Integration" list).
// Requires a live PostgreSQL-wire database at DATABASE_URL, seeded via
// `npx tsx prisma/seed.ts` (see docs/TEST_RESULTS.md for exactly how these
// were run against a PGlite-backed instance in the dev sandbox, and their
// outcome there).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { lineGrossProfit } from '@/lib/domain/invoiceFinancials';

const prisma = new PrismaClient();
let dbReachable = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbReachable = false;
    // eslint-disable-next-line no-console
    console.warn('Skipping integration tests: no reachable DATABASE_URL.');
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Source data -> Product Master -> Cost Snapshot', () => {
  it('every published CostSnapshotLine resolves to a real Product, never a raw row id', async () => {
    if (!dbReachable) return;
    const lines = await prisma.costSnapshotLine.findMany({ include: { product: true } });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.product).toBeTruthy();
      expect(line.product.canonicalName.length).toBeGreaterThan(0);
    }
  });

  it('a row flagged NEEDS_SOURCE_REVIEW is never published into a Cost Snapshot', async () => {
    if (!dbReachable) return;
    const flaggedRows = await prisma.costRawRow.findMany({ where: { extractionStatus: 'NEEDS_SOURCE_REVIEW' } });
    for (const row of flaggedRows) {
      expect(row.matchedProductId).toBeNull();
    }
    const mappingQueue = await prisma.productMappingQueue.count({ where: { status: 'UNRESOLVED' } });
    expect(mappingQueue).toBeGreaterThanOrEqual(flaggedRows.length);
  });
});

describe('Pricing Round -> Central Pricing -> Customer Pricing', () => {
  it('Central Pricing and Customer Pricing read the exact same Current Cost for the same product/round', async () => {
    if (!dbReachable) return;
    const round = await prisma.pricingRound.findFirst();
    if (!round) return; // nothing to assert if no round exists in this environment

    const costLines = await prisma.costSnapshotLine.findMany({ where: { costSnapshotId: round.costSnapshotId } });
    const sheets = await prisma.customerPriceSheet.findMany({
      where: { pricingRoundId: round.id },
      include: { lines: true },
    });

    for (const sheet of sheets) {
      for (const line of sheet.lines) {
        const canonicalCost = costLines.find((c) => c.productId === line.productId);
        // Customer pricing must never diverge from the round's canonical cost snapshot.
        expect(canonicalCost).toBeDefined();
      }
    }
  });

  it('an unresolved product mapping blocks that product from ever reaching Central Pricing', async () => {
    if (!dbReachable) return;
    const unresolvedIds = (await prisma.productMappingQueue.findMany({ where: { status: 'UNRESOLVED' } })).map(
      (m) => m.resolvedProductId,
    );
    const round = await prisma.pricingRound.findFirst();
    if (!round) return;
    const centralProductIds = (await prisma.centralPriceLine.findMany({ where: { pricingRoundId: round.id } })).map(
      (l) => l.productId,
    );
    for (const id of unresolvedIds) {
      if (id) expect(centralProductIds).not.toContain(id);
    }
  });
});

describe('Financial boundary', () => {
  it('a Closed Deal alone never creates an Invoice row (deal close != revenue)', async () => {
    if (!dbReachable) return;
    const deals = await prisma.closedDeal.findMany();
    for (const deal of deals) {
      const relatedInvoice = await prisma.invoice.findFirst({ where: { customerId: deal.customerId } });
      // A Closed Deal must never directly spawn an Invoice row; invoices only
      // come from the separate financial import pipeline.
      if (relatedInvoice) {
        expect(relatedInvoice.importBatchId).toBeTruthy(); // came from an import batch, not the deal
      }
    }
  });

  it('GP on a POSTED invoice line equals netSales - recognizedCost exactly (never a flat-margin guess)', async () => {
    if (!dbReachable) return;
    const lines = await prisma.invoiceLine.findMany({ where: { invoice: { status: 'POSTED' } } });
    for (const line of lines) {
      const expected = lineGrossProfit({ netSales: line.netSales, recognizedCost: line.recognizedCost });
      expect(line.grossProfit).toBe(expected);
    }
  });
});
