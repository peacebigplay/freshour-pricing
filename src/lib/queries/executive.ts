import { prisma } from '@/lib/db';
import { grossProfitCoverage, sumPostedRevenue } from '@/lib/domain/invoiceFinancials';
import { marginPct } from '@/lib/domain/margin';

export async function getExecutiveFinancials() {
  const postedLines = await prisma.invoiceLine.findMany({
    where: { invoice: { status: 'POSTED' } },
  });

  const revenue = sumPostedRevenue(postedLines);
  const gp = grossProfitCoverage(postedLines);

  return { revenue, ...gp, postedLineCount: postedLines.length };
}

export async function getCategoryTargetVsActual() {
  const policy = await prisma.marginPolicyVersion.findFirst({
    where: { effectiveTo: null },
    include: { categoryRules: true },
  });
  if (!policy) return [];

  const lines = await prisma.invoiceLine.findMany({
    where: { invoice: { status: 'POSTED' }, recognizedCost: { not: null } },
    include: { product: true },
  });

  const byCategory = new Map<string, { netSales: number; cost: number }>();
  for (const line of lines) {
    const cat = line.product?.category ?? 'OTHER';
    const bucket = byCategory.get(cat) ?? { netSales: 0, cost: 0 };
    bucket.netSales += line.netSales;
    bucket.cost += line.recognizedCost ?? 0;
    byCategory.set(cat, bucket);
  }

  return policy.categoryRules.map((rule) => {
    const bucket = byCategory.get(rule.category);
    const actualMarginPct = bucket && bucket.netSales > 0 ? marginPct(bucket.netSales, bucket.cost) : null;
    return {
      category: rule.category,
      targetPct: rule.targetPct,
      actualMarginPct,
      netSales: bucket?.netSales ?? 0,
    };
  });
}

export async function getSalesPipelineCounts() {
  const counts = await prisma.quote.groupBy({ by: ['status'], _count: { _all: true } });
  return Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
}

export async function getClosedDealsAwaitingInvoice() {
  return prisma.closedDeal.count({
    where: { financialHandoff: { status: 'PENDING' } },
  });
}

export async function getDataHealth() {
  const [unresolvedMappings, marketSources, reconciliationExceptions, integrationConfigs] = await Promise.all([
    prisma.productMappingQueue.count({ where: { status: 'UNRESOLVED' } }),
    prisma.marketSource.findMany(),
    prisma.reconciliationException.count({ where: { resolved: false } }),
    prisma.integrationConfig.findMany(),
  ]);

  const marketConnected = marketSources.some((m) => m.status === 'CONNECTED');
  const failingIntegrations = integrationConfigs.filter((c) => c.status === 'BLOCKED' || c.status === 'DEGRADED');

  return {
    unresolvedMappings,
    marketConnected,
    reconciliationExceptions,
    failingIntegrations: failingIntegrations.length,
  };
}

export async function getAttentionQueue() {
  return prisma.executiveDecision.findMany({
    where: { status: { in: ['OPEN', 'ASSIGNED'] } },
    include: { owner: true },
    orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
    take: 20,
  });
}
