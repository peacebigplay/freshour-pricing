import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import tableStyles from '@/components/ui/table.module.css';

export default async function MarginGuardPage() {
  const policy = await prisma.marginPolicyVersion.findFirst({
    where: { effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
    include: {
      categoryRules: true,
      skuOverrides: { include: { product: true } },
    },
  });

  if (!policy) {
    return (
      <>
        <PageHeader title="Margin Guard" />
        <EmptyState title="ยังไม่มี Margin Policy ที่ใช้งานอยู่" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Margin Guard" subtitle={`Margin Policy v${policy.version} · มีผลตั้งแต่ ${policy.effectiveFrom.toLocaleDateString('th-TH')}`} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title="Global Floor">
          <p style={{ fontSize: 28, fontWeight: 700 }}>{policy.globalFloorPct}%</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>มาร์จิ้นขั้นต่ำที่ยอมรับได้ทุกสินค้า</p>
        </Card>
        <Card title="หมวดสินค้า → เป้ามาร์จิ้น">
          <table style={{ width: '100%', fontSize: 13 }}>
            <tbody>
              {policy.categoryRules.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: '4px 0' }}>{r.category}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600 }}>{r.targetPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title={`SKU Override (${policy.skuOverrides.length})`}>
        {policy.skuOverrides.length === 0 ? (
          <EmptyState title="ยังไม่มีการตั้งเป้ามาร์จิ้นเฉพาะ SKU" />
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th className={tableStyles.numeric}>เป้ามาร์จิ้น</th>
                  <th>เหตุผล</th>
                </tr>
              </thead>
              <tbody>
                {policy.skuOverrides.map((o) => (
                  <tr key={o.id}>
                    <td>{o.product.canonicalName}</td>
                    <td className={tableStyles.numeric}>
                      <StatusPill tone={o.targetPct < policy.globalFloorPct ? 'warning' : 'primary'}>{o.targetPct}%</StatusPill>
                    </td>
                    <td>{o.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
