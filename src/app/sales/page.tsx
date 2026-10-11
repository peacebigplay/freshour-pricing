import Link from 'next/link';
import { requireUser } from '@/lib/auth/currentUser';
import { getSalesDashboard, getApprovedCustomerSheetsReadyToSend } from '@/lib/queries/sales';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SendQuoteButton } from './SendQuoteButton';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'ฉบับร่าง',
  SENT: 'ส่งแล้ว รอลูกค้า',
  CUSTOMER_RESPONDED: 'ลูกค้าตอบกลับ',
  NEGOTIATING: 'กำลังเจรจา',
  ACCEPTED: 'ลูกค้ายอมรับ',
  CLOSED: 'ปิดดีลแล้ว',
  EXPIRED: 'หมดอายุ',
};

export default async function SalesDashboardPage() {
  const user = await requireUser();
  const [{ counts, myQuotes, openNegotiations }, readyToSend] = await Promise.all([
    getSalesDashboard(user.id),
    getApprovedCustomerSheetsReadyToSend(),
  ]);

  return (
    <>
      <PageHeader title="Sales" subtitle="คิวงานวันนี้ — ใครต้องติดต่อหรือดำเนินการต่อ" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <KpiCard key={key} label={label} value={String(counts[key] ?? 0)} />
        ))}
      </div>

      <Card title={`พร้อมส่งราคาให้ลูกค้า (${readyToSend.length})`}>
        {readyToSend.length === 0 ? (
          <EmptyState title="ยังไม่มีชีทราคาที่อนุมัติแล้วรอส่ง" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {readyToSend.map((sheet) => (
              <div key={sheet.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{sheet.customer.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    รอบ {sheet.pricingRound.label} · {sheet.lines.length} รายการ
                    {sheet.handoffs.length > 0 ? ' · ส่งมอบจาก Pricing แล้ว' : ' · ยังไม่ส่งมอบจาก Pricing'}
                  </p>
                </div>
                <SendQuoteButton customerPriceSheetId={sheet.id} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title={`การเจรจาที่เปิดอยู่ (${openNegotiations.length})`}>
        {openNegotiations.length === 0 ? (
          <EmptyState title="ไม่มีการเจรจาที่ต้องติดตาม" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openNegotiations.map((n) => (
              <Link key={n.id} href={`/negotiations/${n.id}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                <span>{n.customer.name} · {n.product.canonicalName}</span>
                <StatusPill tone="warning">รอ Pricing ตัดสินใจ</StatusPill>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title="ใบเสนอราคาของฉัน">
        {myQuotes.length === 0 ? (
          <EmptyState title="ยังไม่มีใบเสนอราคา" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myQuotes.map((q) => (
              <Link key={q.id} href={`/sales/quotes/${q.id}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                <span>{q.customer.name}</span>
                <StatusPill tone="neutral">{STATUS_LABEL[q.status] ?? q.status}</StatusPill>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
