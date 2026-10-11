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

// ──────────────────────────────────────────────────────────────────
// Cash / AR — Section "เงินวันนี้" (money today) in the Executive ref
// ──────────────────────────────────────────────────────────────────

export interface CashAndAr {
  totalInvoiced: number;
  totalCollected: number;
  outstanding: number;
  overdue: number;
  invoiceCount: number;
  agingBuckets: { label: string; amount: number; state: 'ok' | 'warn' | 'bad' }[];
}

export async function getCashAndAr(): Promise<CashAndAr> {
  const invoices = await prisma.invoice.findMany({
    where: { status: 'POSTED' },
    include: { lines: true, payments: true },
  });

  const now = new Date();
  let totalInvoiced = 0;
  let totalCollected = 0;
  let overdue = 0;
  const buckets = { notDue: 0, d1_7: 0, d8_30: 0, d30plus: 0 };

  for (const inv of invoices) {
    const invoiceTotal = inv.lines.reduce((s, l) => s + l.netSales, 0);
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    const balance = invoiceTotal - paid;
    totalInvoiced += invoiceTotal;
    totalCollected += paid;

    if (balance > 0) {
      const daysOverdue = Math.floor((now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000));
      if (daysOverdue <= 0) buckets.notDue += balance;
      else if (daysOverdue <= 7) buckets.d1_7 += balance;
      else if (daysOverdue <= 30) buckets.d8_30 += balance;
      else buckets.d30plus += balance;
      if (daysOverdue > 0) overdue += balance;
    }
  }

  return {
    totalInvoiced,
    totalCollected,
    outstanding: totalInvoiced - totalCollected,
    overdue,
    invoiceCount: invoices.length,
    agingBuckets: [
      { label: 'ยังไม่ถึงกำหนด', amount: buckets.notDue, state: 'ok' },
      { label: '1–7 วัน', amount: buckets.d1_7, state: 'warn' },
      { label: '8–30 วัน', amount: buckets.d8_30, state: 'warn' },
      { label: '>30 วัน', amount: buckets.d30plus, state: 'bad' },
    ],
  };
}

// ──────────────────────────────────────────────────────────────────
// Prospect pipeline
// ──────────────────────────────────────────────────────────────────

const PROSPECT_STALE_DAYS = 14;

export async function getProspectHealth() {
  const prospects = await prisma.prospect.findMany({
    where: { status: 'ACTIVE' },
    include: { owner: true },
    orderBy: { lastContactAt: 'asc' },
  });

  const now = Date.now();
  const withAge = prospects.map((p) => ({
    ...p,
    daysSinceContact: Math.floor((now - p.lastContactAt.getTime()) / (24 * 60 * 60 * 1000)),
  }));

  const pipeline = prospects.reduce((s, p) => s + p.potentialValue, 0);
  const atRisk = withAge.filter((p) => p.daysSinceContact >= PROSPECT_STALE_DAYS);

  const [wonCount, lostCount] = await Promise.all([
    prisma.prospect.count({ where: { status: 'WON' } }),
    prisma.prospect.count({ where: { status: 'LOST' } }),
  ]);

  return {
    active: prospects.length,
    pipeline,
    atRisk,
    won: wonCount,
    lost: lostCount,
    all: withAge,
  };
}

// ──────────────────────────────────────────────────────────────────
// Delivery / Carrier performance
// ──────────────────────────────────────────────────────────────────

export async function getDeliveryHealth() {
  const deliveries = await prisma.delivery.findMany({
    include: { carrier: true, customer: true },
    orderBy: { promisedAt: 'desc' },
    take: 200,
  });

  const total = deliveries.length;
  const onTimeCount = deliveries.filter((d) => d.actualAt && (d.delayMinutes ?? 0) <= 15).length;
  const delayed = deliveries.filter((d) => (d.delayMinutes ?? 0) > 15);
  const score = total > 0 ? Math.round((onTimeCount / total) * 100) : null;

  const byCarrier = new Map<string, { name: string; deliveries: typeof deliveries }>();
  for (const d of deliveries) {
    const bucket = byCarrier.get(d.carrierId) ?? { name: d.carrier.name, deliveries: [] };
    bucket.deliveries.push(d);
    byCarrier.set(d.carrierId, bucket);
  }

  const carriers = Array.from(byCarrier.entries()).map(([id, b]) => {
    const jobs = b.deliveries.length;
    const onTime = b.deliveries.filter((d) => d.actualAt && (d.delayMinutes ?? 0) <= 15).length;
    const carrierDelayed = b.deliveries.filter((d) => (d.delayMinutes ?? 0) > 15).length;
    return {
      id,
      name: b.name,
      jobs,
      onTimePct: jobs > 0 ? Math.round((onTime / jobs) * 100) : 0,
      delayed: carrierDelayed,
      score: jobs > 0 ? Math.round((onTime / jobs) * 100) : 0,
    };
  });

  return { total, score, onTimeCount, delayed, carriers };
}

// ──────────────────────────────────────────────────────────────────
// Customer issues (sales-logged, Executive read-only)
// ──────────────────────────────────────────────────────────────────

export async function getCustomerIssuesSummary() {
  const issues = await prisma.customerIssue.findMany({
    include: { customer: true, carrier: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const open = issues.filter((i) => i.status === 'OPEN');
  const byType = new Map<string, number>();
  const byCustomer = new Map<string, number>();
  for (const i of issues) {
    byType.set(i.type, (byType.get(i.type) ?? 0) + 1);
    byCustomer.set(i.customer.name, (byCustomer.get(i.customer.name) ?? 0) + 1);
  }

  return {
    total: issues.length,
    open: open.length,
    repeatCustomers: Array.from(byCustomer.values()).filter((n) => n > 1).length,
    byType: Array.from(byType.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    byCustomer: Array.from(byCustomer.entries()).map(([customer, count]) => ({ customer, count })).sort((a, b) => b.count - a.count).slice(0, 7),
    recent: issues.slice(0, 10),
  };
}

// ──────────────────────────────────────────────────────────────────
// Actual YTD performance (posted invoices only — never Quote totals)
// ──────────────────────────────────────────────────────────────────

export async function getActualYtdPerformance() {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const lines = await prisma.invoiceLine.findMany({
    where: { invoice: { status: 'POSTED', invoiceDate: { gte: yearStart } } },
    include: { invoice: true, product: true },
  });

  const ytdRevenue = lines.reduce((s, l) => s + l.netSales, 0);
  const ytdGp = lines.reduce((s, l) => s + (l.grossProfit ?? 0), 0);
  const ytdMarginPct = ytdRevenue > 0 ? (ytdGp / ytdRevenue) * 100 : null;

  const byMonth = new Map<number, number>();
  for (const l of lines) {
    const m = l.invoice.invoiceDate.getMonth();
    byMonth.set(m, (byMonth.get(m) ?? 0) + l.netSales);
  }
  const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const currentMonth = new Date().getMonth();
  const months = Array.from({ length: currentMonth + 1 }, (_, m) => ({
    label: monthLabels[m]!,
    value: byMonth.get(m) ?? 0,
  }));

  const bySku = new Map<string, { name: string; revenue: number; gp: number; qty: number }>();
  for (const l of lines) {
    if (!l.productId) continue;
    const bucket = bySku.get(l.productId) ?? { name: l.product?.canonicalName ?? 'ไม่ทราบสินค้า', revenue: 0, gp: 0, qty: 0 };
    bucket.revenue += l.netSales;
    bucket.gp += l.grossProfit ?? 0;
    bucket.qty += l.quantity;
    bySku.set(l.productId, bucket);
  }
  const topSku = Array.from(bySku.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return { ytdRevenue, ytdGp, ytdMarginPct, months, topSku, lineCount: lines.length };
}
