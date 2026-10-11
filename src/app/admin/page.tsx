import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';

export default async function AdminHomePage() {
  const [userCount, integrationConfigs, pendingReview, openExceptions] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.integrationConfig.findMany(),
    prisma.productMappingQueue.count({ where: { status: 'UNRESOLVED' } }),
    prisma.reconciliationException.count({ where: { resolved: false } }),
  ]);

  return (
    <>
      <PageHeader title="Admin" subtitle="ผู้ใช้งาน การเชื่อมต่อระบบ และความถูกต้องของข้อมูล" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <Link href="/admin/users" style={{ textDecoration: 'none' }}>
          <Card title="Users">
            <p style={{ fontSize: 24, fontWeight: 700 }}>{userCount}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>ผู้ใช้งานที่เปิดใช้งานอยู่</p>
          </Card>
        </Link>

        <Link href="/admin/integrations" style={{ textDecoration: 'none' }}>
          <Card title="Integrations">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {integrationConfigs.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span>{c.displayName}</span>
                  <StatusPill tone={c.status === 'CONNECTED' ? 'success' : 'neutral'}>{c.status}</StatusPill>
                </div>
              ))}
            </div>
          </Card>
        </Link>

        <Link href="/product-master" style={{ textDecoration: 'none' }}>
          <Card title="Mapping Queue">
            <p style={{ fontSize: 24, fontWeight: 700 }}>{pendingReview}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>รอจับคู่สินค้า</p>
          </Card>
        </Link>

        <Link href="/admin/invoices" style={{ textDecoration: 'none' }}>
          <Card title="Financial Import">
            <p style={{ fontSize: 24, fontWeight: 700 }}>{openExceptions}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>ข้อยกเว้นการกระทบยอดที่ยังไม่แก้ไข</p>
          </Card>
        </Link>
      </div>
    </>
  );
}
