import { prisma } from '@/lib/db';

export async function getSalesDashboard(ownerUserId: string) {
  const [statusCounts, myQuotes, openNegotiations] = await Promise.all([
    prisma.quote.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.quote.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { customer: true },
    }),
    prisma.negotiationCase.findMany({
      where: { status: 'OPEN' },
      include: { customer: true, product: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

  return { counts, myQuotes, openNegotiations };
}

export async function getApprovedCustomerSheetsReadyToSend() {
  return prisma.customerPriceSheet.findMany({
    where: { status: 'APPROVED' },
    include: { customer: true, pricingRound: true, lines: true, handoffs: true },
    orderBy: { createdAt: 'desc' },
  });
}
