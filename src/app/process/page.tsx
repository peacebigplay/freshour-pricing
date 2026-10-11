import { prisma } from '@/lib/db';
import { getLatestOpenPricingRound } from '@/lib/queries/pricing';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

async function getStageCounts() {
  const round = await getLatestOpenPricingRound();

  const [costPublished, marketConnected, centralTotal, centralApproved, customerTotal, customerApproved,
    quotesSent, responded, negotiating, closedDeals, postedInvoices, execDecisions] = await Promise.all([
    prisma.costSnapshot.count(),
    prisma.marketSource.count({ where: { status: 'CONNECTED' } }),
    round ? prisma.centralPriceLine.count({ where: { pricingRoundId: round.id } }) : 0,
    round ? prisma.centralPriceLine.count({ where: { pricingRoundId: round.id, status: 'APPROVED' } }) : 0,
    round ? prisma.customerPriceSheet.count({ where: { pricingRoundId: round.id } }) : 0,
    round ? prisma.customerPriceSheet.count({ where: { pricingRoundId: round.id, status: 'APPROVED' } }) : 0,
    prisma.quote.count({ where: { status: { in: ['SENT', 'CUSTOMER_RESPONDED', 'NEGOTIATING', 'ACCEPTED', 'CLOSED'] } } }),
    prisma.quote.count({ where: { status: { in: ['CUSTOMER_RESPONDED', 'NEGOTIATING', 'ACCEPTED', 'CLOSED'] } } }),
    prisma.negotiationCase.count(),
    prisma.closedDeal.count(),
    prisma.invoice.count({ where: { status: 'POSTED' } }),
    prisma.executiveDecision.count(),
  ]);

  return [
    { label: 'Cost', value: costPublished, caption: 'Cost Snapshots เผยแพร่แล้ว' },
    { label: 'Market', value: marketConnected, caption: 'แหล่งข้อมูลตลาดที่เชื่อมต่อ' },
    { label: 'Central Pricing', value: centralApproved, total: centralTotal, caption: 'รายการที่อนุมัติแล้ว' },
    { label: 'Customer Pricing', value: customerApproved, total: customerTotal, caption: 'ชีทที่อนุมัติแล้ว' },
    { label: 'Sales', value: quotesSent, caption: 'ใบเสนอราคาที่ส่งแล้ว' },
    { label: 'Quote', value: quotesSent, caption: 'ใบเสนอราคาทั้งหมด' },
    { label: 'Customer Response', value: responded, caption: 'ลูกค้าตอบกลับแล้ว' },
    { label: 'Negotiation', value: negotiating, caption: 'กรณีเจรจาทั้งหมด' },
    { label: 'Closed Deal', value: closedDeals, caption: 'ดีลที่ปิดแล้ว' },
    { label: 'Invoice', value: postedInvoices, caption: 'ใบแจ้งหนี้ POSTED' },
    { label: 'Executive', value: execDecisions, caption: 'รายการตัดสินใจของผู้บริหาร' },
  ];
}

export default async function ProcessPage() {
  const stages = await getStageCounts();
  const hasAnyData = stages.some((s) => s.value > 0);

  return (
    <>
      <PageHeader title="Process" subtitle="ขั้นตอนงานตั้งแต่ต้นทุนจนถึงผู้บริหาร" />

      {!hasAnyData ? (
        <EmptyState title="ยังไม่มีข้อมูลในกระบวนการ" />
      ) : (
        <div style={{ display: 'flex', overflowX: 'auto', gap: 0, paddingBottom: 10 }}>
          {stages.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  minWidth: 150,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  padding: 16,
                  boxShadow: 'var(--shadow-soft)',
                }}
              >
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</p>
                <p style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                  {s.value}
                  {s.total != null && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/{s.total}</span>}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.caption}</p>
              </div>
              {i < stages.length - 1 && <div style={{ width: 20, height: 2, background: 'var(--border)' }} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
