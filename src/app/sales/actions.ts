'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';
import { generateOpaqueToken, hashToken } from '@/lib/auth/session';

const QUOTE_TOKEN_TTL_DAYS = 14;

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface SendQuoteResult extends ActionResult {
  quoteId?: string;
  publicUrl?: string;
}

export async function sendQuoteFromCustomerSheet(_prev: SendQuoteResult, formData: FormData): Promise<SendQuoteResult> {
  const user = await requireRole(['SALES']);
  const customerPriceSheetId = String(formData.get('customerPriceSheetId') ?? '');
  if (!customerPriceSheetId) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  const sheet = await prisma.customerPriceSheet.findUnique({
    where: { id: customerPriceSheetId },
    include: { lines: { include: { product: true } } },
  });
  if (!sheet || sheet.status !== 'APPROVED') {
    return { ok: false, error: 'ชีทราคานี้ยังไม่ได้รับการอนุมัติจาก Pricing' };
  }

  const approvedLines = sheet.lines.filter((l) => l.approvedPrice != null);
  if (approvedLines.length === 0) {
    return { ok: false, error: 'ไม่มีรายการที่อนุมัติราคาแล้ว' };
  }

  let quoteId = '';
  let rawToken = '';
  await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.create({
      data: { customerId: sheet.customerId, ownerUserId: user.id, status: 'SENT' },
    });
    quoteId = quote.id;

    const revision = await tx.quoteRevision.create({
      data: { quoteId: quote.id, revision: 1 },
    });

    for (const line of approvedLines) {
      await tx.quoteLine.create({
        data: {
          quoteRevisionId: revision.id,
          productId: line.productId,
          customerPriceLineId: line.id,
          offeredPrice: line.approvedPrice!,
          unit: line.product.defaultUnit,
        },
      });
    }

    rawToken = generateOpaqueToken();
    await tx.publicQuoteToken.create({
      data: {
        quoteId: quote.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + QUOTE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.pricingSalesHandoff.updateMany({
      where: { customerPriceSheetId: sheet.id, acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entityType: 'Quote',
        entityId: quote.id,
        action: 'send_quote',
        after: { tokenPreview: rawToken.slice(0, 6) + '…' },
      },
    });
  });

  revalidatePath('/sales');
  const base = process.env.APP_BASE_URL ?? '';
  return { ok: true, quoteId, publicUrl: `${base}/q/${rawToken}` };
}

const CloseDealSchema = z.object({ quoteId: z.string() });

export async function closeDealAndHandoff(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['SALES']);
  const parsed = CloseDealSchema.safeParse({ quoteId: formData.get('quoteId') });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  const quote = await prisma.quote.findUnique({
    where: { id: parsed.data.quoteId },
    include: { revisions: { orderBy: { revision: 'desc' }, take: 1, include: { lines: true } } },
  });
  if (!quote || quote.status !== 'ACCEPTED') {
    return { ok: false, error: 'ต้องรอให้ลูกค้ายอมรับก่อนจึงปิดดีลได้' };
  }
  const latestRevision = quote.revisions[0];
  if (!latestRevision) return { ok: false, error: 'ไม่พบรายการใบเสนอราคา' };

  await prisma.$transaction(async (tx) => {
    const deal = await tx.closedDeal.create({
      data: { quoteId: quote.id, customerId: quote.customerId, ownerUserId: user.id },
    });

    for (const line of latestRevision.lines) {
      await tx.closedDealLine.create({
        data: {
          closedDealId: deal.id,
          quoteLineId: line.id,
          productId: line.productId,
          frozenPrice: line.offeredPrice,
          unit: line.unit,
        },
      });
    }

    await tx.financialHandoff.create({ data: { closedDealId: deal.id } });
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'CLOSED' } });

    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entityType: 'ClosedDeal',
        entityId: deal.id,
        action: 'close_deal_and_handoff',
      },
    });
  });

  revalidatePath(`/sales/quotes/${quote.id}`);
  revalidatePath('/sales');
  return { ok: true };
}
