'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const NoteSchema = z.object({ decisionId: z.string(), note: z.string().min(1).max(2000) });

export async function recordDecisionNote(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['EXECUTIVE']);
  const parsed = NoteSchema.safeParse({ decisionId: formData.get('decisionId'), note: formData.get('note') });
  if (!parsed.success) return { ok: false, error: 'กรุณากรอกบันทึก' };

  await prisma.executiveDecision.update({
    where: { id: parsed.data.decisionId },
    data: { decisionNote: parsed.data.note, status: 'ASSIGNED', ownerId: user.id },
  });

  revalidatePath('/exec');
  return { ok: true };
}

const ResolveSchema = z.object({ decisionId: z.string() });

export async function resolveDecision(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole(['EXECUTIVE']);
  const parsed = ResolveSchema.safeParse({ decisionId: formData.get('decisionId') });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  await prisma.executiveDecision.update({
    where: { id: parsed.data.decisionId },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

  revalidatePath('/exec');
  return { ok: true };
}
