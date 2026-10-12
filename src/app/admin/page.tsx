import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { can, type Action, type Role } from '@/lib/domain/rbac';

const ROLES: Role[] = ['PRICING', 'SALES', 'ADMIN', 'EXECUTIVE'];
const ACTION_LABEL: Record<Action, string> = {
  view_executive_dashboard: 'ดู Executive Dashboard',
  record_executive_decision: 'บันทึกการตัดสินใจผู้บริหาร',
  edit_factory_cost: 'แก้ต้นทุนจากโรงงาน',
  publish_selling_price: 'เผยแพร่ราคาขาย',
  approve_central_price: 'อนุมัติ Central Price',
  approve_customer_price: 'อนุมัติ Customer Price',
  manage_margin_guard: 'จัดการ Margin Guard',
  generate_quotation: 'สร้าง/ส่งใบเสนอราคา',
  close_deal: 'ปิดดีล',
  manage_users: 'จัดการผู้ใช้งาน',
  manage_integrations: 'จัดการการเชื่อมต่อระบบ',
  import_financial_fallback: 'นำเข้าข้อมูลการเงิน (CSV fallback)',
};
const ACTIONS = Object.keys(ACTION_LABEL) as Action[];

export default async function AdminHomePage() {
  const [userCount, integrationConfigs, pendingReview, openExceptions] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.integrationConfig.findMany(),
    prisma.productMappingQueue.count({ where: { status: 'UNRESOLVED' } }),
    prisma.reconciliationException.count({ where: { resolved: false } }),
  ]);

  return (
    <>
      <PageHeader title="Admin & System Integrity" subtitle="ผู้ใช้งาน การเชื่อมต่อระบบ และความถูกต้องของข้อมูล" />

      <div className="pbnote">
        <b>Production rule:</b> Connector ที่ยังต่อไม่ได้ต้องขึ้น BLOCKED ชัดเจน ห้ามแกล้งทำเป็น Connected
      </div>

      <div className="prodgrid">
        <div className="card">
          <h3>
            Integration Readiness <span className="sub">External boundary</span>
          </h3>
          {integrationConfigs.map((c) => (
            <div className="intcard" key={c.id}>
              <div className="ih">
                <b>{c.displayName}</b>
                <span className={`stbadge ${c.status === 'CONNECTED' ? 'ok' : c.status === 'DEGRADED' ? 'warn' : c.status === 'BLOCKED' ? 'bad' : 'info'}`}>
                  {c.status}
                </span>
              </div>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
            <Link href="/admin/users" style={{ textDecoration: 'none' }}>
              <Card title="Users">
                <p style={{ fontSize: 24, fontWeight: 700 }}>{userCount}</p>
                <p className="hint">ผู้ใช้งานที่เปิดใช้งานอยู่</p>
              </Card>
            </Link>
            <Link href="/product-master" style={{ textDecoration: 'none' }}>
              <Card title="Mapping Queue">
                <p style={{ fontSize: 24, fontWeight: 700 }}>{pendingReview}</p>
                <p className="hint">รอจับคู่สินค้า</p>
              </Card>
            </Link>
            <Link href="/admin/invoices" style={{ textDecoration: 'none' }}>
              <Card title="Financial Import">
                <p style={{ fontSize: 24, fontWeight: 700 }}>{openExceptions}</p>
                <p className="hint">ข้อยกเว้นที่ยังไม่แก้ไข</p>
              </Card>
            </Link>
          </div>
        </div>

        <div className="card">
          <h3>Role Permission</h3>
          <p className="hint">อ่านตรงจาก src/lib/domain/rbac.ts — ไม่ใช่ตารางคงที่ ถ้าโค้ดเปลี่ยน ตารางนี้เปลี่ยนตาม</p>
          <table className="rbac">
            <thead>
              <tr>
                <th>Capability</th>
                {ROLES.map((r) => (
                  <th key={r}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map((a) => (
                <tr key={a}>
                  <td>{ACTION_LABEL[a]}</td>
                  {ROLES.map((r) => (
                    <td key={r} className={can(r, a) ? 'yes' : 'no'}>
                      {can(r, a) ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
