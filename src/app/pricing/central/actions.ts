'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';

const ApproveSchema = z.object({
  lineId: z.string(),
  approvedPrice: z.coerce.number().positive(),
  expectedVersion: z.coerce.number().int(),
});

export interface ApproveResult {
  ok: boolean;
  error?: string;
}

export async function approveCentralPriceLine(_prev: ApproveResult, formData: FormData): Promise<ApproveResult> {
  const user = await requireRole(['PRICING']);
  const parsed = ApproveSchema.safeParse({
    lineId: formData.get('lineId'),
    approvedPrice: formData.get('approvedPrice'),
    expectedVersion: formData.get('expectedVersion'),
  });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  const { lineId, approvedPrice, expectedVersion } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.centralPriceLine.findUniqueOrThrow({ where: { id: lineId } });
      if (current.version !== expectedVersion) {
        throw new Error('STALE_VERSION');
      }
      await tx.centralPriceLine.update({
        where: { id: lineId },
        data: {
          approvedPrice,
          status: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          entityType: 'CentralPriceLine',
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

  revalidatePath('/pricing/central');
  return { ok: true };
}
