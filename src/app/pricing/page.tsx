import Link from 'next/link';
import { getPricingReadiness } from '@/lib/queries/pricing';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { AlertCard } from '@/components/ui/AlertCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import sharedStyles from '@/components/ui/shared.module.css';

export default async function PricingHomePage() {
  const r = await getPricingReadiness();

  if (!r.round) {
    return (
      <>
        <PageHeader title="Pricing" subtitle="ภาพรวมรอบตั้งราคา" />
        <EmptyState
          title="ยังไม่มีรอบตั้งราคาที่เปิดอยู่"
          description="สร้างรอบตั้งราคาใหม่จาก Cost Snapshot ที่เผยแพร่แล้ว เพื่อเริ่มต้นตั้งราคากลาง"
        />
      </>
    );
  }

  const centralPct = r.centralLinesTotal ? Math.round((r.centralLinesApproved / r.centralLinesTotal) * 100) : 0;
  const customerPct = r.customerSheetsTotal ? Math.round((r.customerSheetsApproved / r.customerSheetsTotal) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Pricing"
        subtitle={`รอบ ${r.round.label} · Cost Snapshot เผยแพร่ ${r.round.costSnapshot.publishedAt.toLocaleDateString('th-TH')}`}
        actions={
          <Link href="/pricing/central" className={sharedStyles.primaryButton}>
            ไปที่ Central Pricing
          </Link>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard label="สินค้าใช้งาน" value={String(r.totalProducts)} caption="Product Master" />
        <KpiCard
          label="รอการจับคู่สินค้า"
          value={String(r.unresolvedMappings)}
          deltaTone={r.unresolvedMappings > 0 ? 'down' : 'neutral'}
          caption="Mapping Queue"
        />
        <KpiCard label="Central Pricing เสร็จแล้ว" value={`${centralPct}%`} caption={`${r.centralLinesApproved}/${r.centralLinesTotal} รายการ`} />
        <KpiCard label="Customer Pricing เสร็จแล้ว" value={`${customerPct}%`} caption={`${r.customerSheetsApproved}/${r.customerSheetsTotal} ชีท`} />
      </div>

      {r.unresolvedMappings > 0 && (
        <div style={{ marginBottom: 16 }}>
          <AlertCard
            tone="warning"
            title={`มีสินค้า ${r.unresolvedMappings} รายการรอจับคู่กับ Product Master`}
            description="สินค้าที่ยังไม่ได้จับคู่จะบล็อกการเผยแพร่ราคา — ต้องตรวจสอบก่อน"
            action={
              <Link href="/product-master" className={sharedStyles.ghostButton}>
                ไปที่ Mapping Queue
              </Link>
            }
          />
        </div>
      )}

      {r.centralLinesException > 0 && (
        <div style={{ marginBottom: 16 }}>
          <AlertCard
            tone="danger"
            title={`มีข้อยกเว้นในรอบนี้ ${r.centralLinesException} รายการ`}
            description="ราคาต่ำกว่าเป้าหมายหรือต้นทุนเปลี่ยนแปลงผิดปกติ ต้องตรวจสอบก่อนอนุมัติ"
            action={
              <Link href="/pricing/central?filter=exception" className={sharedStyles.ghostButton}>
                ดูรายการ
              </Link>
            }
          />
        </div>
      )}

      <Card title="สถานะข้อมูลตลาด (Market)">
        <StatusPill tone={r.marketStatus === 'CONNECTED' ? 'success' : 'neutral'}>
          {r.marketStatus === 'CONNECTED' ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}
        </StatusPill>
        <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
          Pricing ยังทำงานได้ด้วยต้นทุนปัจจุบัน ราคาอ้างอิงจากแหล่งข้อมูล และกฎมาร์จิ้น แม้ไม่มีข้อมูลตลาดจริง
        </p>
      </Card>
    </>
  );
}
