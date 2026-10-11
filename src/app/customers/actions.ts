'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const CreateCustomerSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).toUpperCase(),
  channel: z.string().optional(),
});

export async function createCustomer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['SALES', 'PRICING']);
  const parsed = CreateCustomerSchema.safeParse({
    name: formData.get('name'),
    code: formData.get('code'),
    channel: formData.get('channel') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'กรุณากรอกชื่อร้านและรหัสลูกค้า' };

  const existing = await prisma.customer.findUnique({ where: { code: parsed.data.code } });
  if (existing) return { ok: false, error: `รหัสลูกค้า ${parsed.data.code} มีอยู่แล้ว` };

  const customer = await prisma.customer.create({ data: parsed.data });
  await prisma.auditEvent.create({
    data: { actorUserId: user.id, entityType: 'Customer', entityId: customer.id, action: 'create_customer', after: parsed.data },
  });

  revalidatePath('/customers');
  revalidatePath('/sales');
  return { ok: true };
}

const RequestPriceChangeSchema = z.object({
  customerId: z.string(),
  productId: z.string(),
  requestedPrice: z.coerce.number().positive(),
  originalPrice: z.coerce.number().min(0),
  currentCost: z.coerce.number().min(0),
  targetPct: z.coerce.number(),
  reason: z.string().optional(),
});

export async function requestPriceChange(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole(['SALES', 'PRICING']);
  const parsed = RequestPriceChangeSchema.safeParse({
    customerId: formData.get('customerId'),
    productId: formData.get('productId'),
    requestedPrice: formData.get('requestedPrice'),
    originalPrice: formData.get('originalPrice'),
    currentCost: formData.get('currentCost'),
    targetPct: formData.get('targetPct'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  const existingOpen = await prisma.priceRequest.findFirst({
    where: { customerId: parsed.data.customerId, productId: parsed.data.productId, status: 'OPEN' },
  });
  if (existingOpen) return { ok: false, error: 'มีคำขอปรับราคาที่เปิดอยู่สำหรับรายการนี้แล้ว' };

  await prisma.priceRequest.create({
    data: { ...parsed.data, requestedById: user.id },
  });
  await prisma.auditEvent.create({
    data: {
      actorUserId: user.id,
      entityType: 'PriceRequest',
      entityId: parsed.data.customerId,
      action: 'request_price_change',
      after: parsed.data,
    },
  });

  revalidatePath('/customers');
  revalidatePath('/pricing/requests');
  return { ok: true };
}
