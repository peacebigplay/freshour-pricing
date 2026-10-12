import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import tableStyles from '@/components/ui/table.module.css';
import { ResolveMappingForm } from './ResolveMappingForm';

export default async function ProductMasterPage() {
  const [products, mappingQueue] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { aliases: true },
      orderBy: { canonicalName: 'asc' },
      take: 500,
    }),
    prisma.productMappingQueue.findMany({
      where: { status: 'UNRESOLVED' },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const candidateProducts = products.map((p) => ({ id: p.id, name: p.canonicalName }));

  return (
    <>
      <PageHeader title="Product Master & Mapping Queue" subtitle={`${products.length} สินค้าใช้งานอยู่ · ${mappingQueue.length} รอจับคู่`} />

      <div className="pbnote">
        <b>Production principle:</b> ห้ามใช้ชื่อสินค้าเป็น primary join — ทุกอย่างต้อง join ด้วย product_id
        <span className="env">SINGLE SOURCE OF TRUTH</span>
      </div>

      {mappingQueue.length > 0 && (
        <Card title={`Mapping Queue (${mappingQueue.length})`}>
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>ชื่อจากแหล่งข้อมูล</th>
                  <th>สเปก</th>
                  <th>หน่วย</th>
                  <th>จับคู่กับ</th>
                </tr>
              </thead>
              <tbody>
                {mappingQueue.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.sourceName}</td>
                    <td>{m.specification ?? '—'}</td>
                    <td>{m.unit ?? '—'}</td>
                    <td>
                      <ResolveMappingForm queueId={m.id} candidates={candidateProducts} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div style={{ height: 20 }} />

      <Card title="สินค้าทั้งหมด">
        {products.length === 0 ? (
          <EmptyState title="ยังไม่มีสินค้าในระบบ" description="นำเข้าข้อมูลจาก Cost & Market" />
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>ชื่อสินค้า</th>
                  <th>หน่วย</th>
                  <th>หมวด</th>
                  <th>กลุ่มสินค้า</th>
                  <th>ชื่อเดิม/นามแฝง</th>
                  <th>แหล่งข้อมูล</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.canonicalName}</td>
                    <td>{p.defaultUnit}</td>
                    <td>{p.category}</td>
                    <td>{p.catalogSegment}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {p.aliases.map((a) => a.alias).join(', ') || '—'}
                    </td>
                    <td>
                      <StatusPill tone={p.dataOrigin === 'REAL_SOURCE' ? 'primary' : 'neutral'}>
                        {p.dataOrigin === 'REAL_SOURCE' ? 'ข้อมูลจริง' : 'ทดสอบ'}
                      </StatusPill>
                    </td>
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
