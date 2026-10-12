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
        <PageHeader title="Margin Guard & Category Mapping" />
        <EmptyState title="ยังไม่มี Margin Policy ที่ใช้งานอยู่" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Margin Guard & Category Mapping"
        subtitle={`Global Margin Floor ${policy.globalFloorPct}% ทุก SKU · ถ้า Target ของหมวดสูงกว่า ให้ใช้ค่าที่สูงกว่า`}
      />

      <div className="row c2">
        <div className="card" style={{ background: 'var(--ink)', color: '#fff' }}>
          <span style={{ fontSize: 10, letterSpacing: '0.1em', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>GLOBAL HARD FLOOR</span>
          <div style={{ fontFamily: 'var(--fn)', fontSize: 38, fontWeight: 700, marginTop: 4 }}>{policy.globalFloorPct}%</div>
          <p style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 4 }}>ไม่มี SKU ใดที่ระบบแนะนำต่ำกว่านี้</p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, fontSize: 10.5, color: '#C7DAFE' }}>
            <span>SKU Master</span>
            <span>→</span>
            <span>Category Rule</span>
            <span>→</span>
            <span>Effective Target</span>
            <span>→</span>
            <span>Pricing</span>
          </div>
        </div>
        <Card title="Source of truth">
          <p className="hint">
            Production เก็บ <b style={{ fontFamily: 'var(--fn)' }}>category_key</b> บน SKU Master โดยตรง · Keyword rule ใช้เป็น fallback ตอน SKU ใหม่ยังไม่ถูกจัดกลุ่ม
          </p>
          <div className="warn2">
            <b>Effective Target = max({policy.globalFloorPct}%, Category Target)</b>
            <br />
            จึงไม่มีกรณี Target ของหมวดต่ำกว่า {policy.globalFloorPct}% แล้วทำให้ราคาแนะนำต่ำกว่า Global Floor
          </div>
        </Card>
      </div>

      <div style={{ height: 14 }} />

      <Card title="Category Mapping Rules">
        <p className="hint">หมวดสินค้าทั้งหมดที่ Pricing ใช้ตัดสิน Target Margin — Floor ขั้นต่ำยังคุมอยู่เสมอ</p>
        <div className="tw2">
          <div className="sc">
            <table className="g" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th>หมวด</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {policy.categoryRules.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.category}</td>
                    <td>
                      <span className="pill2 b">{Math.max(policy.globalFloorPct, r.targetPct)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

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
