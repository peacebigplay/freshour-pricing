'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';
import { suggestCustomerPrice } from '@/lib/domain/customerPricing';

export interface ActionResult {
  ok: boolean;
  error?: string;
  createdSheets?: number;
  createdLines?: number;
}

const GenerateSchema = z.object({ pricingRoundId: z.string() });

/**
 * Creates any missing CustomerPriceSheet/CustomerPriceLine rows for active
 * customers in this round. Never touches a sheet or line that already
 * exists, so it is safe to re-run after adding a new customer mid-round or
 * after Central Pricing approvals change — it only fills gaps.
 */
export async function generateCustomerSheets(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['PRICING']);
  const parsed = GenerateSchema.safeParse({ pricingRoundId: formData.get('pricingRoundId') });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };
  const { pricingRoundId } = parsed.data;

  const [customers, centralLines, conditions, costLines] = await Promise.all([
    prisma.customer.findMany({ where: { active: true } }),
    prisma.centralPriceLine.findMany({ where: { pricingRoundId }, include: { product: true } }),
    prisma.customerProductCondition.findMany(),
    prisma.costSnapshotLine.findMany({ where: { costSnapshot: { pricingRounds: { some: { id: pricingRoundId } } } } }),
  ]);

  const costByProduct = new Map(costLines.map((l) => [l.productId, l.currentCost]));
  const conditionByKey = new Map(conditions.map((c) => [`${c.customerId}:${c.productId}`, c]));

  const existingSheets = await prisma.customerPriceSheet.findMany({ where: { pricingRoundId } });
  const sheetByCustomer = new Map(existingSheets.map((s) => [s.customerId, s]));

  const missingCustomers = customers.filter((c) => !sheetByCustomer.has(c.id));
  if (missingCustomers.length > 0) {
    await prisma.customerPriceSheet.createMany({
      data: missingCustomers.map((c) => ({ pricingRoundId, customerId: c.id, status: 'SUGGESTED' as const })),
    });
    const refreshed = await prisma.customerPriceSheet.findMany({
      where: { pricingRoundId, customerId: { in: missingCustomers.map((c) => c.id) } },
    });
    for (const s of refreshed) sheetByCustomer.set(s.customerId, s);
  }
  const createdSheets = missingCustomers.length;

  const sheetIds = customers.map((c) => sheetByCustomer.get(c.id)!.id);
  const existingLines = await prisma.customerPriceLine.findMany({
    where: { customerPriceSheetId: { in: sheetIds } },
    select: { customerPriceSheetId: true, productId: true },
  });
  const existingLineKeys = new Set(existingLines.map((l) => `${l.customerPriceSheetId}:${l.productId}`));

  const newLines: {
    customerPriceSheetId: string;
    centralPriceLineId: string;
    productId: string;
    suggestedPrice: number;
    status: 'SUGGESTED';
  }[] = [];

  for (const customer of customers) {
    const sheet = sheetByCustomer.get(customer.id)!;
    for (const centralLine of centralLines) {
      if (existingLineKeys.has(`${sheet.id}:${centralLine.productId}`)) continue;

      const centralPrice = centralLine.approvedPrice ?? centralLine.suggestedPrice;
      const condition = conditionByKey.get(`${customer.id}:${centralLine.productId}`);
      const currentCost = costByProduct.get(centralLine.productId) ?? 0;
      const suggestedPrice = suggestCustomerPrice({
        centralPrice,
        currentCost,
        minMarginPct: condition?.minMarginPct,
      });

      newLines.push({
        customerPriceSheetId: sheet.id,
        centralPriceLineId: centralLine.id,
        productId: centralLine.productId,
        suggestedPrice,
        status: 'SUGGESTED',
      });
    }
  }

  if (newLines.length > 0) {
    await prisma.customerPriceLine.createMany({ data: newLines });
  }
  const createdLines = newLines.length;

  await prisma.auditEvent.create({
    data: {
      actorUserId: user.id,
      entityType: 'PricingRound',
      entityId: pricingRoundId,
      action: 'generate_customer_sheets',
      after: { createdSheets, createdLines },
    },
  });

  revalidatePath('/pricing');
  revalidatePath('/customers');
  return { ok: true, createdSheets, createdLines };
}
