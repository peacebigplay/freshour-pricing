import { prisma } from '@/lib/db';
import { getLatestOpenPricingRound } from '@/lib/queries/pricing';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

export default async function SummaryPage() {
  const round = await getLatestOpenPricingRound();

  if (!round) {
    return (
      <>
        <PageHeader title="สรุปภาพรวม" subtitle="อยู่ตรงไหน แล้วไปไหนต่อ" />
        <EmptyState title="ยังไม่มีรอบตั้งราคาที่เปิดอยู่" description="นำเข้า Cost Snapshot เพื่อเริ่มต้นรอบใหม่" />
      </>
    );
  }

  const [unresolvedMappings, centralTotal, centralApproved, centralException, customerTotal, customerApproved, openNegotiations, pendingHandoffs] =
    await Promise.all([
      prisma.productMappingQueue.count({ where: { status: 'UNRESOLVED' } }),
      prisma.centralPriceLine.count({ where: { pricingRoundId: round.id } }),
      prisma.centralPriceLine.count({ where: { pricingRoundId: round.id, status: 'APPROVED' } }),
      prisma.centralPriceLine.count({ where: { pricingRoundId: round.id, isException: true } }),
      prisma.customerPriceSheet.count({ where: { pricingRoundId: round.id } }),
      prisma.customerPriceSheet.count({ where: { pricingRoundId: round.id, status: 'APPROVED' } }),
      prisma.negotiationCase.count({ where: { status: 'OPEN' } }),
      prisma.pricingSalesHandoff.count({ where: { acknowledgedAt: null } }),
    ]);

  const blocked: string[] = [];
  if (unresolvedMappings > 0) blocked.push(`สินค้า ${unresolvedMappings} รายการรอจับคู่ — บล็อกการเผยแพร่ราคาที่เกี่ยวข้อง`);
  if (centralException > 0) blocked.push(`Central Pricing มีข้อยกเว้น ${centralException} รายการรอการตัดสินใจ`);
  if (openNegotiations > 0) blocked.push(`มีการเจรจาที่เปิดอยู่ ${openNegotiations} รายการรอ Pricing อนุมัติ`);

  let nextStep = 'ไม่มีขั้นตอนที่ต้องดำเนินการทันที';
  let nextHref = '/pricing';
  if (unresolvedMappings > 0) {
    nextStep = 'ไปที่ Product Master เพื่อจับคู่สินค้าที่ค้างอยู่';
    nextHref = '/product-master';
  } else if (centralTotal > centralApproved) {
    nextStep = `อนุมัติ Central Pricing ที่เหลือ ${centralTotal - centralApproved} รายการ`;
    nextHref = '/pricing/central';
  } else if (customerTotal > customerApproved) {
    nextStep = `อนุมัติ Customer Pricing ที่เหลือ ${customerTotal - customerApproved} ชีท`;
    nextHref = '/customers';
  } else if (pendingHandoffs > 0) {
    nextStep = `ส่งมอบราคาที่อนุมัติแล้ว ${pendingHandoffs} ชีทให้ฝ่ายขาย`;
    nextHref = '/sales';
  } else if (openNegotiations > 0) {
    nextStep = 'ตัดสินใจการเจรจาที่เปิดอยู่';
    nextHref = '/pricing/requests';
  }

  return (
    <>
      <PageHeader title="อยู่ตรงไหน แล้วไปไหนต่อ" subtitle={`รอบ ${round.label} · สถานะ ${round.status} · ทุกตัวเลขคิดใหม่ทุกครั้งที่เปิดหน้า`} />

      <div className="road">
        <div className="rd">
          <div className="lb">เริ่มจาก</div>
          <div className="big">{round.label}</div>
          <p>เปิดรอบจาก Cost Snapshot</p>
        </div>
        <div className="ar">→</div>
        <div className="rd">
          <div className="lb">ตอนนี้</div>
          <div className="big">
            {centralApproved}
            <span>/{centralTotal}</span>
          </div>
          <div className="hd2">Central Pricing อนุมัติแล้ว</div>
          <p>
            Customer Pricing {customerApproved}/{customerTotal} ชีท
          </p>
        </div>
        <div className="ar">→</div>
        <div className="rd next">
          <div className="lb">ไปไหนต่อ</div>
          <div className="act">{nextStep}</div>
          <a className="gobtn" href={nextHref}>
            ไปที่หน้านี้ →
          </a>
        </div>
      </div>

      <div style={{ height: 6 }} />

      <Card title="ด่านก่อนประกาศ" action={<span className="sub">{blocked.length === 0 ? 'ผ่านครบ' : `ยังติด ${blocked.length}`}</span>}>
        {blocked.length === 0 ? (
          <p className="hint">ผ่านด่านครบ พร้อมประกาศ</p>
        ) : (
          <div className="auto">
            {blocked.map((b, i) => (
              <div className="ac off" key={i}>
                <div className="st">
                  <i />
                  ยังประกาศไม่ได้
                </div>
                <span>{b}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
