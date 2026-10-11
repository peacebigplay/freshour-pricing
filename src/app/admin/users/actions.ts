'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';
import { hashPassword } from '@/lib/auth/password';
import { randomBytes } from 'node:crypto';

export interface ActionResult {
  ok: boolean;
  error?: string;
  temporaryPassword?: string;
}

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['EXECUTIVE', 'PRICING', 'SALES', 'ADMIN']),
});

export async function createUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireRole(['ADMIN']);
  const parsed = CreateUserSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { ok: false, error: 'กรุณากรอกข้อมูลให้ถูกต้อง' };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (existing) return { ok: false, error: 'มีอีเมลนี้อยู่ในระบบแล้ว' };

  const temporaryPassword = randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      passwordHash,
    },
  });

  await prisma.auditEvent.create({
    data: { actorUserId: admin.id, entityType: 'User', entityId: parsed.data.email, action: 'create_user' },
  });

  revalidatePath('/admin/users');
  return { ok: true, temporaryPassword };
}
