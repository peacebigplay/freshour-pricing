'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const DecisionSchema = z.object({
  negotiationCaseId: z.string(),
  finalPrice: z.coerce.number().positive(),
  comment: z.string().max(1000).optional(),
});

export async function decideNegotiation(
  decision: 'APPROVED' | 'REJECTED',
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole(['PRICING']);
  const parsed = DecisionSchema.safeParse({
    negotiationCaseId: formData.get('negotiationCaseId'),
    finalPrice: formData.get('finalPrice'),
    comment: formData.get('comment') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };
  const { negotiationCaseId, finalPrice, comment } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const negotiationCase = await tx.negotiationCase.update({
      where: { id: negotiationCaseId },
      data: { status: decision, finalPrice, closedAt: new Date() },
    });

    await tx.negotiationEvent.create({
      data: {
        negotiationCaseId,
        actorUserId: user.id,
        eventType: decision === 'APPROVED' ? 'approve' : 'reject',
        payload: { finalPrice, comment: comment ?? null },
      },
    });

    if (decision === 'APPROVED') {
      // Create a new quote revision carrying the negotiated price forward.
      const response = await tx.quoteResponse.findUniqueOrThrow({
        where: { id: negotiationCase.quoteResponseId },
        include: { quoteRevision: { include: { quote: true } }, quoteLine: true },
      });
      const nextRevisionNumber = response.quoteRevision.revision + 1;
      const newRevision = await tx.quoteRevision.create({
        data: { quoteId: response.quoteRevision.quoteId, revision: nextRevisionNumber, note: 'Negotiated revision' },
      });

      const previousLines = await tx.quoteLine.findMany({ where: { quoteRevisionId: response.quoteRevision.id } });
      for (const line of previousLines) {
        await tx.quoteLine.create({
          data: {
            quoteRevisionId: newRevision.id,
            productId: line.productId,
            customerPriceLineId: line.customerPriceLineId,
            unit: line.unit,
            offeredPrice: line.id === response.quoteLineId ? finalPrice : line.offeredPrice,
          },
        });
      }

      await tx.quote.update({ where: { id: response.quoteRevision.quoteId }, data: { status: 'SENT' } });
    }

    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entityType: 'NegotiationCase',
        entityId: negotiationCaseId,
        action: `negotiation_${decision.toLowerCase()}`,
        after: { finalPrice },
      },
    });
  });

  revalidatePath(`/negotiations/${negotiationCaseId}`);
  revalidatePath('/sales');
  return { ok: true };
}

export async function approveNegotiation(prev: ActionResult, formData: FormData) {
  return decideNegotiation('APPROVED', prev, formData);
}

export async function rejectNegotiation(prev: ActionResult, formData: FormData) {
  return decideNegotiation('REJECTED', prev, formData);
}
