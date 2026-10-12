import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
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
  const [events, milestoneCount] = await Promise.all([
    prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 60, include: { actor: true } }),
    prisma.pricingRound.count({ where: { status: { in: ['CENTRAL_APPROVED', 'CUSTOMER_APPROVED', 'CLOSED'] } } }),
  ]);

  return (
    <>
      <PageHeader title="ความจำของระบบ" subtitle="ย้อนดูว่าเคยเกิดอะไรขึ้น ตัดสินอะไรไว้ และใครแก้อะไรไปบ้าง" />

      <div className="kpi">
        <div className="k lead">
          <div className="kt">
            <span className="ic">🏁</span>
            <span className="pill">รอบที่ประกาศแล้ว</span>
          </div>
          <div className="lb">หมุดหมายที่ผ่านมา</div>
          <div className="v">{milestoneCount}</div>
        </div>
        <div className="k">
          <div className="kt">
            <span className="ic">✍️</span>
          </div>
          <div className="lb">การแก้ไขล่าสุด</div>
          <div className="v">{events.length}</div>
          <div className="c">ทุกการแก้ถูกบันทึกว่าใครทำ เมื่อไร</div>
        </div>
      </div>

      <div className="row">
        <div className="card">
          <h3>
            ใครแก้อะไร <span className="sub">{events.length} รายการ</span>
          </h3>
          {events.length === 0 ? (
            <EmptyState title="ยังไม่มีประวัติกิจกรรม" />
          ) : (
            <div className="tw2">
              <div className="sc">
                <table className="g" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th>เมื่อไร</th>
                      <th>ใคร</th>
                      <th>ทำอะไร</th>
                      <th>รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td style={{ fontSize: 12 }}>{e.createdAt.toLocaleString('th-TH')}</td>
                        <td>{e.actor?.name ?? 'ระบบ'}</td>
                        <td>
                          <span className="pill2 n">{ACTION_LABEL[e.action] ?? e.action}</span>
                        </td>
                        <td style={{ whiteSpace: 'normal', textAlign: 'left', color: 'var(--tx-2)' }}>
                          {e.entityType} #{e.entityId.slice(0, 8)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
