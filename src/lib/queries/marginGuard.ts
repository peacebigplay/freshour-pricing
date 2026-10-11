import { prisma } from '@/lib/db';
import { DEFAULT_GLOBAL_FLOOR_PCT, effectiveTargetPct, isBelowFloor, marginPct } from '@/lib/domain/margin';
import { computeCustomerGrade, type ContractLineState, type CustomerGrade } from '@/lib/domain/customerGrade';
import { getLatestOpenPricingRound } from './pricing';

export interface MarginGuardLine {
  id: string; // CustomerPriceLine id
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  category: string;
  lockedPrice: number;
  currentCost: number;
  marginPct: number;
  targetPct: number;
  state: ContractLineState;
  verified: boolean;
  version: number;
}

export interface MarginGuardCustomer {
  id: string;
  name: string;
  code: string;
  lineCount: number;
  avgMarginPct: number;
  belowTargetCount: number;
  lossCount: number;
  verifiedCount: number;
  grade: CustomerGrade;
}

export interface MarginGuardData {
  lines: MarginGuardLine[];
  customers: MarginGuardCustomer[];
  totals: { lines: number; belowTarget: number; loss: number };
}

function lineState(marginValue: number, targetPctValue: number): ContractLineState {
  if (marginValue < 0) return 'loss';
  if (marginValue < targetPctValue) return 'thin';
  return 'ok';
}

export async function getMarginGuardData(): Promise<MarginGuardData | null> {
  const round = await getLatestOpenPricingRound();
  if (!round) return null;

  const [customerLines, marginPolicy] = await Promise.all([
    prisma.customerPriceLine.findMany({
      where: {
        customerPriceSheet: { pricingRoundId: round.id },
        approvedPrice: { not: null },
      },
      include: {
        product: { include: { marginOverride: true } },
        customerPriceSheet: { include: { customer: true } },
      },
    }),
    prisma.pricingRound
      .findUniqueOrThrow({ where: { id: round.id } })
      .marginPolicyVersion({ include: { categoryRules: true } }),
  ]);

  const globalFloorPct = marginPolicy?.globalFloorPct ?? DEFAULT_GLOBAL_FLOOR_PCT;
  const categoryTargetByCategory = new Map((marginPolicy?.categoryRules ?? []).map((r) => [r.category, r.targetPct]));

  const costSnapshotLines = await prisma.costSnapshotLine.findMany({
    where: { costSnapshot: { pricingRounds: { some: { id: round.id } } } },
  });
  const costByProduct = new Map(costSnapshotLines.map((l) => [l.productId, l.currentCost]));

  const lines: MarginGuardLine[] = customerLines.map((line) => {
    const currentCost = costByProduct.get(line.productId) ?? 0;
    const lockedPrice = line.approvedPrice as number;
    const categoryTarget = categoryTargetByCategory.get(line.product.category) ?? globalFloorPct;
    const targetPctValue = effectiveTargetPct({
      globalFloorPct,
      categoryTargetPct: categoryTarget,
      skuOverridePct: line.product.marginOverride?.targetPct,
    });
    const margin = lockedPrice > 0 ? marginPct(lockedPrice, currentCost) : 0;

    return {
      id: line.id,
      customerId: line.customerPriceSheet.customerId,
      customerName: line.customerPriceSheet.customer.name,
      productId: line.productId,
      productName: line.product.canonicalName,
      category: line.product.category,
      lockedPrice,
      currentCost,
      marginPct: margin,
      targetPct: targetPctValue,
      state: lineState(margin, targetPctValue),
      verified: line.status === 'APPROVED',
      version: line.version,
    };
  });

  const byCustomer = new Map<string, MarginGuardLine[]>();
  for (const line of lines) {
    const arr = byCustomer.get(line.customerId) ?? [];
    arr.push(line);
    byCustomer.set(line.customerId, arr);
  }

  const customers: MarginGuardCustomer[] = Array.from(byCustomer.entries()).map(([customerId, customerLinesForId]) => {
    const avgMarginPct = customerLinesForId.reduce((sum, l) => sum + l.marginPct, 0) / customerLinesForId.length;
    return {
      id: customerId,
      name: customerLinesForId[0]!.customerName,
      code: '',
      lineCount: customerLinesForId.length,
      avgMarginPct,
      belowTargetCount: customerLinesForId.filter((l) => l.state !== 'ok').length,
      lossCount: customerLinesForId.filter((l) => l.state === 'loss').length,
      verifiedCount: customerLinesForId.filter((l) => l.verified).length,
      grade: computeCustomerGrade(customerLinesForId.map((l) => l.state)),
    };
  });

  const codes = await prisma.customer.findMany({ where: { id: { in: customers.map((c) => c.id) } }, select: { id: true, code: true } });
  const codeById = new Map(codes.map((c) => [c.id, c.code]));
  for (const c of customers) c.code = codeById.get(c.id) ?? '';

  return {
    lines: lines.sort((a, b) => a.marginPct - b.marginPct),
    customers: customers.sort((a, b) => a.avgMarginPct - b.avgMarginPct),
    totals: {
      lines: lines.length,
      belowTarget: lines.filter((l) => l.state !== 'ok').length,
      loss: lines.filter((l) => l.state === 'loss').length,
    },
  };
}

export function suggestedRaisePrice(currentCost: number, targetPctValue: number): number {
  return Math.ceil(currentCost / (1 - targetPctValue / 100));
}

export { isBelowFloor };
