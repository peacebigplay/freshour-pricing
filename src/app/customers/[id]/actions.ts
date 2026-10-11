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

const ApproveLineSchema = z.object({
  lineId: z.string(),
  approvedPrice: z.coerce.number().positive(),
  expectedVersion: z.coerce.number().int(),
  currentCost: z.coerce.number().min(0),
});

export async function approveCustomerPriceLine(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['PRICING']);
  const parsed = ApproveLineSchema.safeParse({
    lineId: formData.get('lineId'),
    approvedPrice: formData.get('approvedPrice'),
    expectedVersion: formData.get('expectedVersion'),
    currentCost: formData.get('currentCost'),
  });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };
  const { lineId, approvedPrice, expectedVersion, currentCost } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.customerPriceLine.findUniqueOrThrow({ where: { id: lineId } });
      if (current.version !== expectedVersion) throw new Error('STALE_VERSION');

      await tx.customerPriceLine.update({
        where: { id: lineId },
        data: {
          approvedPrice,
          resultingMarginPct: currentCost > 0 ? marginPct(approvedPrice, currentCost) : null,
          status: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entityType: 'CustomerPriceLine',
          entityId: lineId,
          action: 'approve',
          before: { approvedPrice: current.approvedPrice, status: current.status },
          after: { approvedPrice, status: 'APPROVED' },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'STALE_VERSION') {
      return { ok: false, error: 'ราคานี้ถูกแก้ไขโดยคนอื่นไปแล้ว กรุณารีเฟรชหน้าก่อนอนุมัติซ้ำ' };
    }
    return { ok: false, error: 'เกิดข้อผิดพลาด ไม่สามารถอนุมัติได้' };
  }

  revalidatePath(`/customers/${formData.get('customerId')}`);
  revalidatePath('/customers');
  return { ok: true };
}

const ApproveSheetSchema = z.object({ sheetId: z.string() });

/**
 * Finalizes the sheet for Sales: any line still SUGGESTED is confirmed at
 * its current approved/suggested price, then the sheet itself is marked
 * APPROVED so it appears in Sales' "ready to send" list.
 */
export async function approveCustomerPriceSheet(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['PRICING']);
  const parsed = ApproveSheetSchema.safeParse({ sheetId: formData.get('sheetId') });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };
  const { sheetId } = parsed.data;

  const lines = await prisma.customerPriceLine.findMany({ where: { customerPriceSheetId: sheetId } });
  const pending = lines.filter((l) => l.status !== 'APPROVED');

  await prisma.$transaction([
    ...pending.map((line) =>
      prisma.customerPriceLine.update({
        where: { id: line.id },
        data: {
          approvedPrice: line.approvedPrice ?? line.suggestedPrice,
          status: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      }),
    ),
    prisma.customerPriceSheet.update({ where: { id: sheetId }, data: { status: 'APPROVED' } }),
    prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        entityType: 'CustomerPriceSheet',
        entityId: sheetId,
        action: 'approve_sheet',
        after: { confirmedLines: pending.length },
      },
    }),
  ]);

  revalidatePath('/customers');
  revalidatePath('/sales');
  return { ok: true };
}
