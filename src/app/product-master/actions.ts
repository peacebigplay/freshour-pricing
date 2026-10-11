'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';

const ResolveSchema = z.object({
  queueId: z.string(),
  productId: z.string(),
});

export interface ResolveResult {
  ok: boolean;
  error?: string;
}

export async function resolveMapping(_prev: ResolveResult, formData: FormData): Promise<ResolveResult> {
  const user = await requireRole(['PRICING', 'ADMIN']);
  const parsed = ResolveSchema.safeParse({
    queueId: formData.get('queueId'),
    productId: formData.get('productId'),
  });
  if (!parsed.success || !parsed.data.productId) return { ok: false, error: 'กรุณาเลือกสินค้า' };

  const { queueId, productId } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const entry = await tx.productMappingQueue.update({
      where: { id: queueId },
      data: {
        status: 'RESOLVED',
        resolvedProductId: productId,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entityType: 'ProductMappingQueue',
        entityId: entry.id,
        action: 'resolve_mapping',
        after: { productId },
      },
    });
  });

  revalidatePath('/product-master');
  return { ok: true };
}
