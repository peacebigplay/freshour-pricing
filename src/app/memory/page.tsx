import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

const ACTION_LABEL: Record<string, string> = {
  login: 'เข้าสู่ระบบ',
  approve: 'อนุมัติราคา',
  resolve_mapping: 'จับคู่สินค้า',
  send_quote: 'ส่งใบเสนอราคา',
  close_deal_and_handoff: 'ปิดดีล',
  negotiation_approved: 'อนุมัติการเจรจา',
  negotiation_rejected: 'ปฏิเสธการเจรจา',
  create_user: 'สร้างผู้ใช้งาน',
  csv_fallback_import: 'นำเข้า Invoice (CSV)',
  post_invoice: 'POST ใบแจ้งหนี้',
  resolve_exception: 'แก้ไขข้อยกเว้น',
};

export default async function MemoryPage() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: { actor: true },
  });

  return (
    <>
      <PageHeader title="Memory" subtitle="ประวัติเหตุการณ์และการตัดสินใจทั้งหมดในระบบ" />

      <Card title="Audit Trail">
        {events.length === 0 ? (
          <EmptyState title="ยังไม่มีประวัติกิจกรรม" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {events.map((e) => (
              <div key={e.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 140 }}>{e.createdAt.toLocaleString('th-TH')}</span>
                <span style={{ minWidth: 120, fontWeight: 600 }}>{e.actor?.name ?? 'ระบบ'}</span>
                <span>{ACTION_LABEL[e.action] ?? e.action}</span>
                <span style={{ color: 'var(--text-muted)' }}>{e.entityType} #{e.entityId.slice(0, 8)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
