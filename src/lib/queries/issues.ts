import { prisma } from '@/lib/db';

export async function listCustomerIssues() {
  return prisma.customerIssue.findMany({
    include: { customer: true, carrier: true, reportedBy: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function listActiveCustomersBasic() {
  return prisma.customer.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export const CUSTOMER_ISSUE_TYPES = [
  'ส่งช้า',
  'คุณภาพสินค้า',
  'ปริมาณ/ขาดส่ง',
  'ราคา/ใบเสนอราคา',
  'เอกสาร/Invoice',
  'อื่นๆ',
] as const;
