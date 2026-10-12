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
    { label: 'Cost', who: 'Pricing', where: '/cost-market', value: costPublished, caption: 'Cost Snapshots เผยแพร่แล้ว' },
    { label: 'Market', who: 'Pricing', where: '/cost-market', value: marketConnected, caption: 'แหล่งข้อมูลตลาดที่เชื่อมต่อ' },
    { label: 'Central Pricing', who: 'Pricing', where: '/pricing/central', value: centralApproved, total: centralTotal, caption: 'รายการที่อนุมัติแล้ว' },
    { label: 'Customer Pricing', who: 'Pricing', where: '/customers', value: customerApproved, total: customerTotal, caption: 'ชีทที่อนุมัติแล้ว' },
    { label: 'Quote', who: 'Sales', where: '/sales', value: quotesSent, caption: 'ใบเสนอราคาที่ส่งแล้ว' },
    { label: 'Customer Response', who: 'ลูกค้า', where: '/sales', value: responded, caption: 'ลูกค้าตอบกลับแล้ว' },
    { label: 'Negotiation', who: 'Sales + Pricing', where: '/pricing/requests', value: negotiating, caption: 'กรณีเจรจาทั้งหมด' },
    { label: 'Closed Deal', who: 'Sales', where: '/sales', value: closedDeals, caption: 'ดีลที่ปิดแล้ว' },
    { label: 'Invoice', who: 'Admin', where: '/admin/invoices', value: postedInvoices, caption: 'ใบแจ้งหนี้ POSTED' },
    { label: 'Executive', who: 'Executive', where: '/exec', value: execDecisions, caption: 'รายการตัดสินใจของผู้บริหาร' },
  ];
}

export default async function ProcessPage() {
  const stages = await getStageCounts();
  const hasAnyData = stages.some((s) => s.value > 0);

  return (
    <>
      <PageHeader title="เส้นทางราคา" subtitle="ขั้นตอนงานตั้งแต่ต้นทุนจนถึงผู้บริหาร — สีบอกว่าเดินได้/ค้าง/ตัน" />

      {!hasAnyData ? (
        <EmptyState title="ยังไม่มีข้อมูลในกระบวนการ" />
      ) : (
        <>
          <div className="tape" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))` }}>
            {stages.map((s) => (
              <a key={s.label} className={`tp${s.value === 0 ? ' watch' : ''}`} href={s.where}>
                <span className="no">{s.label}</span>
                <span className="nm">
                  {s.value}
                  {s.total != null ? `/${s.total}` : ''}
                </span>
              </a>
            ))}
          </div>

          {stages.map((s, i) => (
            <div key={s.label} className={`stn ${s.value === 0 ? 'watch' : 'ok'}`}>
              <div className="sh">
                <div className="sno">{i + 1}</div>
                <div className="st">
                  <h3>{s.label}</h3>
                  <div className="wh">ใครทำ · {s.who}</div>
                </div>
                <div className="sr">
                  <a className="btn" href={s.where}>
                    เปิดหน้านี้ →
                  </a>
                </div>
              </div>
              <div className="sb">
                <div className="sf">
                  <div className="ff">
                    <em>{s.caption}</em>
                    <b>
                      {s.value}
                      {s.total != null && <small> /{s.total}</small>}
                    </b>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
