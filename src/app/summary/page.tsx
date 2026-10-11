import { prisma } from '@/lib/db';
import { getLatestOpenPricingRound } from '@/lib/queries/pricing';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';

export default async function SummaryPage() {
  const round = await getLatestOpenPricingRound();

  if (!round) {
    return (
      <>
        <PageHeader title="Summary" subtitle="สถานะรอบงานปัจจุบัน" />
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
  if (unresolvedMappings > 0) nextStep = 'ไปที่ Product Master เพื่อจับคู่สินค้าที่ค้างอยู่';
  else if (centralTotal > centralApproved) nextStep = `อนุมัติ Central Pricing ที่เหลือ ${centralTotal - centralApproved} รายการ`;
  else if (customerTotal > customerApproved) nextStep = `อนุมัติ Customer Pricing ที่เหลือ ${customerTotal - customerApproved} ชีท`;
  else if (pendingHandoffs > 0) nextStep = `ส่งมอบราคาที่อนุมัติแล้ว ${pendingHandoffs} ชีทให้ฝ่ายขาย`;
  else if (openNegotiations > 0) nextStep = 'ตัดสินใจการเจรจาที่เปิดอยู่';

  return (
    <>
      <PageHeader title="Summary" subtitle={`รอบ ${round.label} · สถานะ ${round.status}`} />

      <Card title="เรากำลังอยู่ที่ไหนในรอบนี้">
        <StatusPill tone="primary">{round.status}</StatusPill>
        <p style={{ marginTop: 10, fontSize: 13 }}>
          Central Pricing: {centralApproved}/{centralTotal} อนุมัติแล้ว · Customer Pricing: {customerApproved}/{customerTotal} ชีท
        </p>
      </Card>

      <div style={{ height: 20 }} />

      <Card title="สิ่งที่ติดอยู่ (Blocked)">
        {blocked.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--success)' }}>ไม่มีสิ่งที่ติดอยู่ในตอนนี้</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {blocked.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title="ขั้นตอนถัดไปที่แนะนำ">
        <p style={{ fontSize: 14, fontWeight: 600 }}>{nextStep}</p>
      </Card>
    </>
  );
}
