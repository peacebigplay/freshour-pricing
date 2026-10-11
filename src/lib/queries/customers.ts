import { prisma } from '@/lib/db';
import { marginPct } from '@/lib/domain/margin';
import { getLatestOpenPricingRound } from './pricing';

export async function listCustomersOverview() {
  const round = await getLatestOpenPricingRound();
  const customers = await prisma.customer.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  });

  if (!round) return customers.map((c) => ({ ...c, sheetStatus: null as string | null, lineCount: 0, exceptionCount: 0 }));

  const sheets = await prisma.customerPriceSheet.findMany({
    where: { pricingRoundId: round.id },
    include: { lines: true },
  });
  const sheetByCustomer = new Map(sheets.map((s) => [s.customerId, s]));

  return customers.map((c) => {
    const sheet = sheetByCustomer.get(c.id);
    return {
      ...c,
      sheetStatus: sheet?.status ?? null,
      lineCount: sheet?.lines.length ?? 0,
      exceptionCount: sheet?.lines.filter((l) => l.isException).length ?? 0,
    };
  });
}

export interface CustomerPriceRow {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  centralPrice: number;
  previousCustomerPrice: number | null;
  currentCost: number;
  suggestedPrice: number;
  approvedPrice: number | null;
  resultingMarginPct: number | null;
  status: string;
  isException: boolean;
  version: number;
}

export async function getCustomerPriceSheet(customerId: string, pricingRoundId: string) {
  const sheet = await prisma.customerPriceSheet.findUnique({
    where: { pricingRoundId_customerId: { pricingRoundId, customerId } },
    include: {
      customer: true,
      lines: {
        include: { product: true, centralPriceLine: true },
        orderBy: { product: { canonicalName: 'asc' } },
      },
    },
  });
  if (!sheet) return null;

  const costLines = await prisma.costSnapshotLine.findMany({
    where: { costSnapshot: { pricingRounds: { some: { id: pricingRoundId } } } },
  });
  const costByProduct = new Map(costLines.map((l) => [l.productId, l.currentCost]));

  const rows: CustomerPriceRow[] = sheet.lines.map((line) => {
    const currentCost = costByProduct.get(line.productId) ?? 0;
    const price = line.approvedPrice ?? line.suggestedPrice;
    return {
      id: line.id,
      productId: line.productId,
      productName: line.product.canonicalName,
      unit: line.product.defaultUnit,
      centralPrice: line.centralPriceLine.approvedPrice ?? line.centralPriceLine.suggestedPrice,
      previousCustomerPrice: line.previousCustomerPrice,
      currentCost,
      suggestedPrice: line.suggestedPrice,
      approvedPrice: line.approvedPrice,
      resultingMarginPct: price > 0 ? marginPct(price, currentCost) : null,
      status: line.status,
      isException: line.isException,
      version: line.version,
    };
  });

  return { sheet, rows };
}
