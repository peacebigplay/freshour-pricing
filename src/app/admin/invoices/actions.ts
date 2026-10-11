'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/currentUser';
import { lineGrossProfit } from '@/lib/domain/invoiceFinancials';

export interface ActionResult {
  ok: boolean;
  error?: string;
  summary?: string;
}

interface ParsedCsvRow {
  invoiceNumber: string;
  customerCode: string;
  productAlias: string;
  quantity: number;
  unit: string;
  netSales: number;
  recognizedCost: number | null;
  invoiceDate: string;
}

function parseCsv(text: string): ParsedCsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  const [header, ...rows] = lines;
  if (!header) throw new Error('Empty CSV input');
  const cols = header.split(',').map((c) => c.trim());
  const required = ['invoiceNumber', 'customerCode', 'productAlias', 'quantity', 'unit', 'netSales', 'recognizedCost', 'invoiceDate'];
  for (const r of required) {
    if (!cols.includes(r)) throw new Error(`Missing required CSV column: ${r}`);
  }
  return rows
    .filter((r) => r.trim().length > 0)
    .map((row) => {
      const values = row.split(',').map((v) => v.trim());
      const get = (name: string) => values[cols.indexOf(name)] ?? '';
      const recognizedCostRaw = get('recognizedCost');
      return {
        invoiceNumber: get('invoiceNumber'),
        customerCode: get('customerCode'),
        productAlias: get('productAlias'),
        quantity: Number(get('quantity')),
        unit: get('unit'),
        netSales: Number(get('netSales')),
        recognizedCost: recognizedCostRaw === '' ? null : Number(recognizedCostRaw),
        invoiceDate: get('invoiceDate'),
      };
    });
}

const UploadSchema = z.object({ csv: z.string().min(1) });

export async function uploadInvoiceCsv(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireRole(['ADMIN']);
  const parsed = UploadSchema.safeParse({ csv: formData.get('csv') });
  if (!parsed.success) return { ok: false, error: 'กรุณาวางข้อมูล CSV' };

  let rows: ParsedCsvRow[];
  try {
    rows = parseCsv(parsed.data.csv);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'รูปแบบ CSV ไม่ถูกต้อง' };
  }
  if (rows.length === 0) return { ok: false, error: 'ไม่พบข้อมูลในไฟล์' };

  const batch = await prisma.invoiceImportBatch.create({ data: { source: 'csv_fallback' } });

  let staged = 0;
  let exceptions = 0;

  for (const row of rows) {
    const rawRow = await prisma.invoiceRawRow.create({
      data: { importBatchId: batch.id, rawPayload: row as unknown as object },
    });

    const existingInvoice = await prisma.invoice.findUnique({ where: { invoiceNumber: row.invoiceNumber } });
    if (existingInvoice) {
      await prisma.reconciliationException.create({
        data: { invoiceId: existingInvoice.id, kind: 'duplicate', detail: `Invoice ${row.invoiceNumber} already staged/posted` },
      });
      exceptions += 1;
      continue;
    }

    const customer = await prisma.customer.findUnique({ where: { code: row.customerCode } });
    const product = await prisma.product.findFirst({
      where: { OR: [{ canonicalName: row.productAlias }, { aliases: { some: { alias: row.productAlias } } }] },
    });

    if (!customer || !product) {
      const detail = !customer
        ? `Unmatched customer code: ${row.customerCode}`
        : `Unmatched product alias: ${row.productAlias}`;
      await prisma.reconciliationException.create({
        data: { kind: !customer ? 'unmatched_customer' : 'unmatched_product', detail },
      });
      await prisma.invoiceRawRow.update({ where: { id: rawRow.id }, data: { matchedCustomerId: customer?.id, matchedProductId: product?.id } });
      exceptions += 1;
      continue;
    }

    const invoice = await prisma.invoice.create({
      data: {
        importBatchId: batch.id,
        customerId: customer.id,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: new Date(row.invoiceDate),
        status: 'STAGED',
      },
    });

    const recognizedCost = row.recognizedCost;
    await prisma.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        productId: product.id,
        quantity: row.quantity,
        unit: row.unit,
        netSales: row.netSales,
        recognizedCost,
        grossProfit: lineGrossProfit({ netSales: row.netSales, recognizedCost }),
      },
    });

    await prisma.invoiceRawRow.update({
      where: { id: rawRow.id },
      data: { matchedCustomerId: customer.id, matchedProductId: product.id },
    });

    staged += 1;
  }

  await prisma.auditEvent.create({
    data: { actorUserId: admin.id, entityType: 'InvoiceImportBatch', entityId: batch.id, action: 'csv_fallback_import', after: { staged, exceptions } },
  });

  revalidatePath('/admin/invoices');
  return { ok: true, summary: `นำเข้าแล้ว ${staged} ใบแจ้งหนี้ · ${exceptions} ข้อยกเว้นต้องตรวจสอบ` };
}

const PostSchema = z.object({ invoiceId: z.string() });

export async function postInvoice(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireRole(['ADMIN']);
  const parsed = PostSchema.safeParse({ invoiceId: formData.get('invoiceId') });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  const openExceptions = await prisma.reconciliationException.count({
    where: { invoiceId: parsed.data.invoiceId, resolved: false },
  });
  if (openExceptions > 0) {
    return { ok: false, error: 'มีข้อยกเว้นที่ยังไม่แก้ไข ไม่สามารถ POST ได้' };
  }

  await prisma.invoice.update({ where: { id: parsed.data.invoiceId }, data: { status: 'POSTED', postedAt: new Date() } });
  await prisma.auditEvent.create({
    data: { actorUserId: admin.id, entityType: 'Invoice', entityId: parsed.data.invoiceId, action: 'post_invoice' },
  });

  revalidatePath('/admin/invoices');
  revalidatePath('/exec');
  return { ok: true };
}

const ResolveExceptionSchema = z.object({ exceptionId: z.string() });

export async function resolveException(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireRole(['ADMIN']);
  const parsed = ResolveExceptionSchema.safeParse({ exceptionId: formData.get('exceptionId') });
  if (!parsed.success) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };

  await prisma.reconciliationException.update({ where: { id: parsed.data.exceptionId }, data: { resolved: true } });
  await prisma.auditEvent.create({
    data: { actorUserId: admin.id, entityType: 'ReconciliationException', entityId: parsed.data.exceptionId, action: 'resolve_exception' },
  });

  revalidatePath('/admin/invoices');
  return { ok: true };
}
