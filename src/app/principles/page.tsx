import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

export default async function PrinciplesPage() {
  const policy = await prisma.marginPolicyVersion.findFirst({
    where: { effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
    include: { categoryRules: true, skuOverrides: { include: { product: true } } },
  });

  if (!policy) {
    return (
      <>
        <PageHeader title="Principles" />
        <EmptyState title="ยังไม่มี Margin Policy ที่ใช้งานอยู่" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Principles" subtitle={`หลักการตั้งราคาที่ใช้งานจริง · Margin Policy v${policy.version}`} />

      <Card title="1. มาร์จิ้นขั้นต่ำทั่วทั้งบริษัท (Global Floor)">
        <p style={{ fontSize: 14 }}>
          ทุกสินค้าต้องมีมาร์จิ้นไม่ต่ำกว่า <b>{policy.globalFloorPct}%</b> ไม่ว่าจะเป็นสินค้าหมวดใดหรือเงื่อนไขลูกค้าแบบใด
        </p>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="2. เป้ามาร์จิ้นตามหมวดสินค้า">
        <ul style={{ paddingLeft: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {policy.categoryRules.map((r) => (
            <li key={r.id}>
              หมวด <b>{r.category}</b> — เป้ามาร์จิ้น {r.targetPct}%
            </li>
          ))}
        </ul>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="3. กฎรวม: Effective Target">
        <p style={{ fontSize: 14, fontFamily: 'monospace', background: 'var(--surface-soft)', padding: 10, borderRadius: 8 }}>
          effective_target_pct = max(global_floor_pct, resolved_category_target_pct)
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
          ถ้ามีการตั้งเป้าเฉพาะ SKU (override) จะใช้ค่านั้นแทนเป้าหมวด ก่อนเทียบกับมาร์จิ้นขั้นต่ำ
        </p>
      </Card>

      <div style={{ height: 16 }} />

      <Card title={`4. ข้อยกเว้นเฉพาะ SKU (${policy.skuOverrides.length})`}>
        {policy.skuOverrides.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>ไม่มีข้อยกเว้นในขณะนี้</p>
        ) : (
          <ul style={{ paddingLeft: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {policy.skuOverrides.map((o) => (
              <li key={o.id}>
                {o.product.canonicalName} — เป้า {o.targetPct}% {o.reason ? `(${o.reason})` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card title="5. ราคาป้องกันมาร์จิ้น (Margin Guard Price)">
        <p style={{ fontSize: 14, fontFamily: 'monospace', background: 'var(--surface-soft)', padding: 10, borderRadius: 8 }}>
          margin_guard_price = ceil(current_cost / (1 - effective_target_pct / 100))
        </p>
      </Card>
    </>
  );
}
