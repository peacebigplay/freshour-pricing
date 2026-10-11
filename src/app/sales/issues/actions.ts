'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';
import { CUSTOMER_ISSUE_TYPES } from '@/lib/queries/issues';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const LogIssueSchema = z.object({
  customerId: z.string(),
  type: z.enum(CUSTOMER_ISSUE_TYPES),
  severity: z.enum(['LOW', 'MID', 'HIGH']),
  detail: z.string().min(1),
});

export async function logCustomerIssue(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['SALES']);
  const parsed = LogIssueSchema.safeParse({
    customerId: formData.get('customerId'),
    type: formData.get('type'),
    severity: formData.get('severity'),
    detail: formData.get('detail'),
  });
  if (!parsed.success) return { ok: false, error: 'กรุณากรอกข้อมูลให้ครบถ้วน' };

  await prisma.customerIssue.create({
    data: { ...parsed.data, reportedById: user.id },
  });

  await prisma.auditEvent.create({
    data: { actorUserId: user.id, entityType: 'CustomerIssue', entityId: parsed.data.customerId, action: 'log_customer_issue' },
  });

  revalidatePath('/sales/issues');
  revalidatePath('/exec');
  return { ok: true };
}

const CloseIssueSchema = z.object({ issueId: z.string() });

export async function closeCustomerIssue(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['SALES']);
  const parsed = CloseIssueSchema.safeParse({ issueId: formData.get('issueId') });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  await prisma.customerIssue.update({
    where: { id: parsed.data.issueId },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
  await prisma.auditEvent.create({
    data: { actorUserId: user.id, entityType: 'CustomerIssue', entityId: parsed.data.issueId, action: 'close_customer_issue' },
  });

  revalidatePath('/sales/issues');
  return { ok: true };
}
