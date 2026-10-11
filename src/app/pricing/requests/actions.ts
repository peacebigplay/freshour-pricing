'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';
import { marginPct } from '@/lib/domain/margin';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const DecideSchema = z.object({
  requestId: z.string(),
  finalPrice: z.coerce.number().positive(),
});

export async function approvePriceRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['PRICING']);
  const parsed = DecideSchema.safeParse({
    requestId: formData.get('requestId'),
    finalPrice: formData.get('finalPrice'),
  });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  const { requestId, finalPrice } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const request = await tx.priceRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (request.status !== 'OPEN') throw new Error('ALREADY_DECIDED');

      const line = await tx.customerPriceLine.findFirst({
        where: { productId: request.productId, customerPriceSheet: { customerId: request.customerId } },
        orderBy: { updatedAt: 'desc' },
      });
      if (line) {
        await tx.customerPriceLine.update({
          where: { id: line.id },
          data: {
            approvedPrice: finalPrice,
            resultingMarginPct: marginPct(finalPrice, request.currentCost),
            status: 'APPROVED',
            approvedById: user.id,
            approvedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }

      await tx.priceRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', finalPrice, decidedById: user.id, decidedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entityType: 'PriceRequest',
          entityId: requestId,
          action: 'approve_price_request',
          after: { finalPrice },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_DECIDED') {
      return { ok: false, error: 'คำขอนี้ถูกตัดสินใจไปแล้ว' };
    }
    return { ok: false, error: 'เกิดข้อผิดพลาด ไม่สามารถอนุมัติได้' };
  }

  revalidatePath('/pricing/requests');
  revalidatePath('/customers');
  return { ok: true };
}

const RejectSchema = z.object({ requestId: z.string() });

export async function rejectPriceRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['PRICING']);
  const parsed = RejectSchema.safeParse({ requestId: formData.get('requestId') });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  const request = await prisma.priceRequest.findUnique({ where: { id: parsed.data.requestId } });
  if (!request || request.status !== 'OPEN') return { ok: false, error: 'คำขอนี้ถูกตัดสินใจไปแล้ว' };

  await prisma.priceRequest.update({
    where: { id: parsed.data.requestId },
    data: { status: 'REJECTED', decidedById: user.id, decidedAt: new Date() },
  });
  await prisma.auditEvent.create({
    data: { actorUserId: user.id, entityType: 'PriceRequest', entityId: parsed.data.requestId, action: 'reject_price_request' },
  });

  revalidatePath('/pricing/requests');
  return { ok: true };
}
