import Link from 'next/link';
import { listCustomersOverview } from '@/lib/queries/customers';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';

export default async function CustomersPage() {
  const customers = await listCustomersOverview();

  return (
    <>
      <PageHeader title="Customers" subtitle="ภาพรวมราคาต่อลูกค้าในรอบปัจจุบัน" />

      {customers.length === 0 ? (
        <EmptyState title="ยังไม่มีข้อมูลลูกค้า" description="เพิ่มลูกค้าได้ที่ Admin" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {customers.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} style={{ textDecoration: 'none' }}>
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{c.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.code}{c.channel ? ` · ${c.channel}` : ''}</p>
                  </div>
                  {c.sheetStatus === 'APPROVED' ? (
                    <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
                  ) : c.sheetStatus ? (
                    <StatusPill tone="neutral">รอตรวจสอบ</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">ยังไม่มีชีท</StatusPill>
                  )}
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {c.lineCount} รายการ{c.exceptionCount > 0 ? ` · ${c.exceptionCount} ข้อยกเว้น` : ''}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
