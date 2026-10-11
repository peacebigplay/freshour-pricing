import { prisma } from '@/lib/db';
import { effectiveTargetPct, marginGuardPrice, marginPct, DEFAULT_GLOBAL_FLOOR_PCT } from '@/lib/domain/margin';
import { suggestPricingGoals, type PricingGoalSuggestion } from '@/lib/domain/pricingGoals';

export async function getLatestOpenPricingRound() {
  return prisma.pricingRound.findFirst({
    where: { status: { in: ['OPEN', 'CENTRAL_APPROVED'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      costSnapshot: true,
      marginPolicyVersion: { include: { categoryRules: true } },
    },
  });
}

export interface PricingReadiness {
  round: Awaited<ReturnType<typeof getLatestOpenPricingRound>>;
  totalProducts: number;
  unresolvedMappings: number;
  centralLinesTotal: number;
  centralLinesApproved: number;
  centralLinesException: number;
  customerSheetsTotal: number;
  customerSheetsApproved: number;
  activeCustomers: number;
  marketStatus: string;
}

export async function getPricingReadiness(): Promise<PricingReadiness> {
  const round = await getLatestOpenPricingRound();

  const [totalProducts, unresolvedMappings, activeCustomers] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.productMappingQueue.count({ where: { status: 'UNRESOLVED' } }),
    prisma.customer.count({ where: { active: true } }),
  ]);

  if (!round) {
    return {
      round: null,
      totalProducts,
      unresolvedMappings,
      centralLinesTotal: 0,
      centralLinesApproved: 0,
      centralLinesException: 0,
      customerSheetsTotal: 0,
      customerSheetsApproved: 0,
      activeCustomers,
      marketStatus: 'NOT_CONNECTED',
    };
  }

  const [centralLinesTotal, centralLinesApproved, centralLinesException, customerSheetsTotal, customerSheetsApproved, marketSource] =
    await Promise.all([
      prisma.centralPriceLine.count({ where: { pricingRoundId: round.id } }),
      prisma.centralPriceLine.count({ where: { pricingRoundId: round.id, status: 'APPROVED' } }),
      prisma.centralPriceLine.count({ where: { pricingRoundId: round.id, isException: true } }),
      prisma.customerPriceSheet.count({ where: { pricingRoundId: round.id } }),
      prisma.customerPriceSheet.count({ where: { pricingRoundId: round.id, status: 'APPROVED' } }),
      prisma.marketSource.findFirst({ orderBy: { lastAttemptAt: 'desc' } }),
    ]);

  return {
    round,
    totalProducts,
    unresolvedMappings,
    centralLinesTotal,
    centralLinesApproved,
    centralLinesException,
    customerSheetsTotal,
    customerSheetsApproved,
    activeCustomers,
    marketStatus: marketSource?.status ?? 'NOT_CONFIGURED',
  };
}

export interface CentralPriceRow {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  category: string;
  previousCost: number | null;
  currentCost: number;
  costDelta: number | null;
  effectiveTargetPctValue: number;
  globalFloorPct: number;
  guardPrice: number;
  previousApprovedPrice: number | null;
  suggestedPrice: number;
  approvedPrice: number | null;
  resultingMarginPct: number | null;
  status: string;
  isException: boolean;
  exceptionReason: string | null;
  version: number;
  goals: PricingGoalSuggestion[];
}

export async function getCentralPriceLines(pricingRoundId: string): Promise<CentralPriceRow[]> {
  const [lines, marginPolicy] = await Promise.all([
    prisma.centralPriceLine.findMany({
      where: { pricingRoundId },
      include: {
        product: { include: { marginOverride: true } },
      },
      orderBy: { product: { canonicalName: 'asc' } },
    }),
    prisma.pricingRound
      .findUniqueOrThrow({ where: { id: pricingRoundId } })
      .marginPolicyVersion({ include: { categoryRules: true } }),
  ]);

  const globalFloorPct = marginPolicy?.globalFloorPct ?? DEFAULT_GLOBAL_FLOOR_PCT;
  const categoryTargetByCategory = new Map(
    (marginPolicy?.categoryRules ?? []).map((r) => [r.category, r.targetPct]),
  );

  const costSnapshotLines = await prisma.costSnapshotLine.findMany({
    where: {
      costSnapshot: { pricingRounds: { some: { id: pricingRoundId } } },
    },
  });
  const costByProduct = new Map(costSnapshotLines.map((l) => [l.productId, l]));

  return lines.map((line) => {
    const cost = costByProduct.get(line.productId);
    const categoryTarget = categoryTargetByCategory.get(line.product.category) ?? globalFloorPct;
    const target = effectiveTargetPct({
      globalFloorPct,
      categoryTargetPct: categoryTarget,
      skuOverridePct: line.product.marginOverride?.targetPct,
    });
    const currentCost = cost?.currentCost ?? 0;
    const price = line.approvedPrice ?? line.suggestedPrice;

    // "Competitive" goal needs a real verified market reference price per
    // SKU; no live Market Snapshot line-level data exists yet in this build
    // (see docs/BUSINESS_RULES.md — market is NOT_CONNECTED by design), so
    // it's correctly omitted rather than fabricated. Hold/Target/Protect
    // are always computable from cost + margin policy alone.
    const goals = currentCost > 0
      ? suggestPricingGoals(
          { currentCost, previousApprovedPrice: line.previousApprovedPrice, effectiveTargetPctValue: target, marketReferencePrice: null },
          globalFloorPct,
        )
      : [];

    return {
      id: line.id,
      productId: line.productId,
      productName: line.product.canonicalName,
      unit: line.product.defaultUnit,
      category: line.product.category,
      previousCost: cost?.previousCost ?? null,
      currentCost,
      costDelta: cost?.costDelta ?? null,
      effectiveTargetPctValue: target,
      globalFloorPct,
      guardPrice: currentCost > 0 ? marginGuardPrice(currentCost, target) : 0,
      previousApprovedPrice: line.previousApprovedPrice,
      suggestedPrice: line.suggestedPrice,
      approvedPrice: line.approvedPrice,
      resultingMarginPct: price > 0 && currentCost >= 0 ? marginPct(price, currentCost) : null,
      status: line.status,
      isException: line.isException,
      exceptionReason: line.exceptionReason,
      version: line.version,
      goals,
    };
  });
}
