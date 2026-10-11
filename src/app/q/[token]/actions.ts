'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/auth/session';
import { supplierMaxCost } from '@/lib/domain/negotiation';
import { effectiveTargetPct, DEFAULT_GLOBAL_FLOOR_PCT } from '@/lib/domain/margin';

const RESPONSE_RATE_LIMIT_PER_HOUR = 30;

const ResponseSchema = z.object({
  token: z.string(),
  quoteLineId: z.string(),
  action: z.enum(['ACCEPT', 'NEGOTIATE']),
  requestedPrice: z.coerce.number().positive().optional(),
  reason: z.string().max(500).optional(),
});

export interface PublicActionResult {
  ok: boolean;
  error?: string;
}

export async function respondToQuoteLine(_prev: PublicActionResult, formData: FormData): Promise<PublicActionResult> {
  const parsed = ResponseSchema.safeParse({
    token: formData.get('token'),
    quoteLineId: formData.get('quoteLineId'),
    action: formData.get('action'),
    requestedPrice: formData.get('requestedPrice') || undefined,
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };
  const { token, quoteLineId, action, requestedPrice, reason } = parsed.data;

  const publicToken = await prisma.publicQuoteToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { quote: { include: { revisions: { orderBy: { revision: 'desc' }, take: 1 } } } },
  });

  if (!publicToken || publicToken.revokedAt || publicToken.expiresAt < new Date()) {
    return { ok: false, error: 'ลิงก์นี้หมดอายุหรือถูกยกเลิกแล้ว' };
  }

  const recentCount = await prisma.quoteResponse.count({
    where: { publicTokenId: publicToken.id, submittedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recentCount >= RESPONSE_RATE_LIMIT_PER_HOUR) {
    return { ok: false, error: 'มีการตอบกลับบ่อยเกินไป กรุณาลองใหม่ภายหลัง' };
  }

  const latestRevision = publicToken.quote.revisions[0];
  if (!latestRevision) return { ok: false, error: 'ไม่พบใบเสนอราคา' };

  const line = await prisma.quoteLine.findFirst({
    where: { id: quoteLineId, quoteRevisionId: latestRevision.id },
    include: { product: { include: { marginOverride: true } }, customerPriceLine: true },
  });
  if (!line) return { ok: false, error: 'ไม่พบรายการสินค้านี้' };

  if (action === 'NEGOTIATE' && (requestedPrice == null || requestedPrice <= 0)) {
    return { ok: false, error: 'กรุณาระบุราคาที่ต้องการเจรจา' };
  }

  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  await prisma.$transaction(async (tx) => {
    const response = await tx.quoteResponse.create({
      data: {
        quoteRevisionId: latestRevision.id,
        quoteLineId: line.id,
        publicTokenId: publicToken.id,
        action,
        requestedPrice: action === 'NEGOTIATE' ? requestedPrice : null,
        reason: reason ?? null,
        ipAddress: ip,
      },
    });

    await tx.publicQuoteToken.update({ where: { id: publicToken.id }, data: { lastUsedAt: new Date() } });

    if (action === 'NEGOTIATE') {
      const policy = await tx.marginPolicyVersion.findFirst({ where: { effectiveTo: null } });
      const target = effectiveTargetPct({
        globalFloorPct: policy?.globalFloorPct ?? DEFAULT_GLOBAL_FLOOR_PCT,
        categoryTargetPct: policy?.globalFloorPct ?? DEFAULT_GLOBAL_FLOOR_PCT,
        skuOverridePct: line.product.marginOverride?.targetPct,
      });

      await tx.negotiationCase.create({
        data: {
          customerId: publicToken.quote.customerId,
          productId: line.productId,
          quoteResponseId: response.id,
          originalApprovedPrice: line.offeredPrice,
          requestedPrice: requestedPrice!,
          supplierMaxCostTarget: supplierMaxCost(requestedPrice!, target),
        },
      });

      await tx.quote.update({ where: { id: publicToken.quote.id }, data: { status: 'NEGOTIATING' } });
    } else {
      // Only mark the quote fully ACCEPTED once every line has an ACCEPT response.
      const allLines = await tx.quoteLine.count({ where: { quoteRevisionId: latestRevision.id } });
      const acceptedLines = await tx.quoteResponse.count({
        where: { quoteRevisionId: latestRevision.id, action: 'ACCEPT' },
      });
      await tx.quote.update({
        where: { id: publicToken.quote.id },
        data: { status: acceptedLines + 1 >= allLines ? 'ACCEPTED' : 'CUSTOMER_RESPONDED' },
      });
    }
  });

  revalidatePath(`/q/${token}`);
  return { ok: true };
}
