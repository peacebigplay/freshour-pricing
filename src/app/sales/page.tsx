import Link from 'next/link';
import { requireUser } from '@/lib/auth/currentUser';
import { getSalesDashboard, getApprovedCustomerSheetsReadyToSend } from '@/lib/queries/sales';
import { listCustomerIssues } from '@/lib/queries/issues';
import { PageHeader } from '@/components/ui/PageHeader';
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
  const [{ counts, myQuotes, openNegotiations }, readyToSend, issues] = await Promise.all([
    getSalesDashboard(user.id),
    getApprovedCustomerSheetsReadyToSend(),
    listCustomerIssues(),
  ]);
  const openIssueCount = issues.filter((i) => i.status === 'OPEN').length;
  const urgent = (counts.NEGOTIATING ?? 0) + (counts.CUSTOMER_RESPONDED ?? 0);
  const waiting = counts.SENT ?? 0;
  const done = (counts.ACCEPTED ?? 0) + (counts.CLOSED ?? 0);

  return (
    <>
      <PageHeader
        title="Sales · ใบเสนอราคา & การต่อรอง"
        subtitle="คิวงานวันนี้ — ใครต้องติดต่อหรือดำเนินการต่อ"
        actions={
          <Link href="/sales/issues" style={{ textDecoration: 'none' }}>
            <StatusPill tone={openIssueCount > 0 ? 'warning' : 'neutral'}>
              ⚠ บันทึกปัญหาจากลูกค้า {openIssueCount > 0 ? `· เปิดอยู่ ${openIssueCount}` : ''}
            </StatusPill>
          </Link>
        }
      />

      <div className="sales-summary">
        <div className="ss urgent">
          <b>{urgent}</b>
          <span>ต้องจัดการก่อน</span>
          <em>ต่อรองกลับ / ใบที่มี exception</em>
        </div>
        <div className="ss ready">
          <b>{readyToSend.length}</b>
          <span>พร้อมส่ง Link</span>
          <em>ตรวจราคาเสร็จแล้ว</em>
        </div>
        <div className="ss wait">
          <b>{waiting}</b>
          <span>รอลูกค้าตอบ</span>
          <em>ส่ง Quotation Link แล้ว</em>
        </div>
        <div className="ss done">
          <b>{done}</b>
          <span>จบแล้ว</span>
          <em>ลูกค้ายืนยันครบ / ปิดการต่อรอง</em>
        </div>
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
