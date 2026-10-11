// Repeatable PDF/CSV source import pipeline — Freshour Master Prompt v2, Section 32.
// Reads the extracted staging JSON (data/imports/*.source.json), registers a
// SourceDocument + CostImportBatch, stages raw rows, matches/creates
// products, and publishes an initial Cost Snapshot + Source Price Snapshot.
//
// Run with: npx tsx prisma/importSourceData.ts <path-to-source.json>

import { readFileSync } from 'node:fs';
import { PrismaClient, type MarginCategory } from '@prisma/client';
import { cleanCanonicalName, normalizeNumericCell } from '../src/lib/domain/pdfNormalize';

interface SourceRow {
  source_document: string;
  source_page: number;
  source_row_no: number;
  row_type: 'product' | 'section_header';
  source_table: 'main' | 'frozen_section';
  source_name: string;
  canonical_name: string;
  specification?: string | null;
  pack_quantity?: number | null;
  unit?: string | null;
  previous_cost?: number | null;
  current_cost?: number | null;
  cost_delta?: number | null;
  previous_cost_period: string;
  current_cost_period: string;
  source_price_reference: {
    retail_ari?: number | null;
    wholesale_2kg?: number | null;
    wholesale_5kg_or_4kg?: number | null;
    wholesale_10kg?: number | null;
    customer_price?: number | null;
  };
  catalog_segment: string;
  extraction_status: 'OK' | 'NEEDS_SOURCE_REVIEW';
  review_notes?: string | null;
}

// Category defaults are a *placeholder* classification only — the PDF does
// not define margin categories (Section 14). ADMIN/PRICING should refine
// these through Product Master once real category policy is agreed.
function guessCategory(name: string): MarginCategory {
  if (/เครื่องใน|ตับ|ไส้|กระเพาะ|ปอด|หัวใจ|ม้าม/.test(name)) return 'OFFAL';
  if (/สันนอก|สันใน|สามชั้น|คอหมู|โครง/.test(name)) return 'POPULAR';
  return 'OTHER';
}

export async function importSourceData(prisma: PrismaClient, filePath: string) {
  const rows: SourceRow[] = JSON.parse(readFileSync(filePath, 'utf-8'));
  const productRows = rows.filter((r) => r.row_type === 'product');
  console.log(`Loaded ${rows.length} rows (${productRows.length} products) from ${filePath}`);

  const sourceDocument = await prisma.sourceDocument.create({
    data: {
      filename: rows[0]?.source_document ?? 'unknown.pdf',
      documentType: 'pdf_cost_price_sheet',
      storagePath: filePath,
      sourcePeriodLabel: '01-07/10/69',
      effectivePeriodStart: new Date('2026-10-01'),
      effectivePeriodEnd: new Date('2026-10-07'),
    },
  });

  const batch = await prisma.costImportBatch.create({
    data: { sourceDocumentId: sourceDocument.id, status: 'STAGED' },
  });

  let staged = 0;
  let needsReview = 0;

  for (const row of productRows) {
    let previousCost: number | null = null;
    let currentCost: number | null = null;
    let costDelta: number | null = null;
    try {
      previousCost = normalizeNumericCell(row.previous_cost ?? null);
      currentCost = normalizeNumericCell(row.current_cost ?? null);
      costDelta = normalizeNumericCell(row.cost_delta ?? null);
    } catch {
      // leave as null; extraction_status already flags review rows
    }

    await prisma.costRawRow.create({
      data: {
        importBatchId: batch.id,
        sourcePage: row.source_page,
        sourceRowNo: row.source_row_no,
        sourceTable: row.source_table,
        rowType: row.row_type,
        sourceName: row.source_name,
        canonicalName: cleanCanonicalName(row.canonical_name ?? row.source_name),
        specification: row.specification ?? null,
        packQuantity: row.pack_quantity ?? null,
        unit: row.unit ?? null,
        previousCost,
        currentCost,
        costDelta,
        retailAri: row.source_price_reference?.retail_ari ?? null,
        wholesale2kg: row.source_price_reference?.wholesale_2kg ?? null,
        wholesale5kgOr4kg: row.source_price_reference?.wholesale_5kg_or_4kg ?? null,
        wholesale10kg: row.source_price_reference?.wholesale_10kg ?? null,
        customerPrice: row.source_price_reference?.customer_price ?? null,
        catalogSegment: row.catalog_segment,
        extractionStatus: row.extraction_status,
        reviewNotes: row.review_notes ?? null,
        rawPayload: row as unknown as object,
      },
    });
    staged += 1;
    if (row.extraction_status === 'NEEDS_SOURCE_REVIEW') needsReview += 1;
  }

  await prisma.costImportBatch.update({ where: { id: batch.id }, data: { status: 'VALIDATED' } });
  console.log(`Staged ${staged} raw rows (${needsReview} flagged NEEDS_SOURCE_REVIEW).`);

  // Product matching: exact canonical_name match creates/reuses a Product.
  // Anything ambiguous (NEEDS_SOURCE_REVIEW) is routed to the mapping queue
  // instead of being auto-matched, per Section 11.
  const rawRows = await prisma.costRawRow.findMany({ where: { importBatchId: batch.id, rowType: 'product' } });
  const productIdByRawRowId = new Map<string, string>();

  for (const raw of rawRows) {
    if (raw.extractionStatus === 'NEEDS_SOURCE_REVIEW') {
      await prisma.productMappingQueue.create({
        data: {
          sourceRowRef: raw.id,
          sourceName: raw.sourceName,
          specification: raw.specification,
          unit: raw.unit,
          status: 'UNRESOLVED',
        },
      });
      continue;
    }

    let product = await prisma.product.findFirst({
      where: { aliases: { some: { alias: raw.canonicalName, source: 'pdf_import' } } },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          canonicalName: raw.canonicalName,
          defaultUnit: raw.unit ?? 'กก.',
          category: guessCategory(raw.canonicalName),
          catalogSegment: raw.catalogSegment,
          dataOrigin: 'REAL_SOURCE',
        },
      });
      const aliasNames = Array.from(new Set([raw.sourceName, raw.canonicalName]));
      for (const alias of aliasNames) {
        await prisma.productAlias.create({ data: { productId: product.id, alias, source: 'pdf_import' } });
      }
    }

    productIdByRawRowId.set(raw.id, product.id);
    await prisma.costRawRow.update({ where: { id: raw.id }, data: { matchedProductId: product.id } });
  }

  // Publish Cost Snapshot (only rows that resolved to a product).
  const costSnapshot = await prisma.costSnapshot.create({
    data: {
      importBatchId: batch.id,
      effectivePeriodStart: sourceDocument.effectivePeriodStart,
      effectivePeriodEnd: sourceDocument.effectivePeriodEnd,
      dataOrigin: 'REAL_SOURCE',
    },
  });

  const sourcePriceSnapshot = await prisma.sourcePriceSnapshot.create({
    data: { importBatchId: batch.id, dataOrigin: 'REAL_SOURCE' },
  });

  let published = 0;
  for (const raw of rawRows) {
    const productId = productIdByRawRowId.get(raw.id);
    if (!productId || raw.currentCost == null) continue;

    await prisma.costSnapshotLine.create({
      data: {
        costSnapshotId: costSnapshot.id,
        productId,
        previousCost: raw.previousCost,
        currentCost: raw.currentCost,
        costDelta: raw.costDelta,
        unit: raw.unit ?? 'กก.',
        sourceRowNo: raw.sourceRowNo,
        sourcePage: raw.sourcePage,
      },
    });

    await prisma.sourcePriceSnapshotLine.create({
      data: {
        sourcePriceSnapshotId: sourcePriceSnapshot.id,
        productId,
        retailAri: raw.retailAri,
        wholesale2kg: raw.wholesale2kg,
        wholesale5kgOr4kg: raw.wholesale5kgOr4kg,
        wholesale10kg: raw.wholesale10kg,
        customerPrice: raw.customerPrice,
        sourcePage: raw.sourcePage,
        sourceRowNo: raw.sourceRowNo,
      },
    });
    published += 1;
  }

  await prisma.costImportBatch.update({ where: { id: batch.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });

  console.log(`Published Cost Snapshot ${costSnapshot.id} and Source Price Snapshot ${sourcePriceSnapshot.id} with ${published} lines.`);
  console.log(`Unresolved mapping queue entries: ${await prisma.productMappingQueue.count({ where: { status: 'UNRESOLVED' } })}`);
}

// CLI entrypoint: `npx tsx prisma/importSourceData.ts <path-to-source.json>`
// (seed.ts instead calls importSourceData() directly, in-process, so it
// shares one PrismaClient connection rather than spawning a second one).
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx prisma/importSourceData.ts <path-to-source.json>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  importSourceData(prisma, filePath)
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
