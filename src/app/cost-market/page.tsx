import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import tableStyles from '@/components/ui/table.module.css';

export default async function CostMarketPage() {
  const [batches, marketSources, totalProducts, latestSnapshot] = await Promise.all([
    prisma.costImportBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        sourceDocument: true,
        rawRows: { select: { extractionStatus: true } },
        costSnapshot: true,
        sourcePriceSnapshot: true,
      },
    }),
    prisma.marketSource.findMany({ orderBy: { name: 'asc' } }),
    prisma.product.count({ where: { active: true } }),
    prisma.costSnapshot.findFirst({ orderBy: { publishedAt: 'desc' }, include: { lines: true } }),
  ]);

  const connectedSources = marketSources.filter((m) => m.status === 'CONNECTED').length;
  const knownCost = latestSnapshot?.lines.length ?? 0;

  return (
    <>
      <PageHeader title="รับทุนประจำสัปดาห์ & ราคาตลาด" subtitle="ความพร้อมของข้อมูลต้นทุนและตลาดก่อนเข้ารอบตั้งราคา" />

      <div className="own">
        <div className="oi">
          <em>สินค้าใช้งาน</em>
          <b>{totalProducts}</b>
          <span>Product Master</span>
        </div>
        <div className="oi">
          <em>ทุนที่รู้</em>
          <b>{knownCost}</b>
          <span>จาก Cost Snapshot ล่าสุด</span>
        </div>
        <div className="oi">
          <em>แหล่งข้อมูลตลาด</em>
          <b>{connectedSources}/{marketSources.length}</b>
          <span>เชื่อมต่อแล้ว</span>
        </div>
      </div>

      <Card title="Market (คู่แข่ง)">
        {marketSources.length === 0 ? (
          <EmptyState
            title="Market source: NOT CONNECTED"
            description="ยังไม่มีการเชื่อมต่อข้อมูลราคาคู่แข่งที่ยืนยันแล้ว ระบบจะไม่สร้างตัวเลขสมมติ — Pricing ยังทำงานได้ด้วยต้นทุนและกฎมาร์จิ้น"
          />
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>แหล่งข้อมูล</th>
                  <th>ประเภท</th>
                  <th>สถานะ</th>
                  <th>ลองล่าสุด</th>
                  <th>สำเร็จล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {marketSources.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td>{m.kind}</td>
                    <td>
                      <StatusPill tone={m.status === 'CONNECTED' ? 'success' : m.status === 'DEGRADED' ? 'warning' : m.status === 'BLOCKED' ? 'danger' : 'neutral'}>
                        {m.status}
                      </StatusPill>
                    </td>
                    <td>{m.lastAttemptAt?.toLocaleString('th-TH') ?? '—'}</td>
                    <td>{m.lastSuccessAt?.toLocaleString('th-TH') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title="Cost Import Batches">
        {batches.length === 0 ? (
          <EmptyState title="ยังไม่มีการนำเข้าข้อมูลต้นทุน" description="นำเข้าไฟล์ต้นทุนจากโรงงานเพื่อเริ่มต้น" />
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>เอกสารต้นทาง</th>
                  <th>สถานะ</th>
                  <th className={tableStyles.numeric}>จำนวนแถว</th>
                  <th className={tableStyles.numeric}>รอตรวจสอบ</th>
                  <th>Cost Snapshot</th>
                  <th>Source Price Snapshot</th>
                  <th>นำเข้าเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const needsReview = b.rawRows.filter((r) => r.extractionStatus === 'NEEDS_SOURCE_REVIEW').length;
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.sourceDocument.filename}</td>
                      <td>
                        <StatusPill tone={b.status === 'PUBLISHED' ? 'success' : b.status === 'REJECTED' ? 'danger' : 'neutral'}>
                          {b.status}
                        </StatusPill>
                      </td>
                      <td className={tableStyles.numeric}>{b.rawRows.length}</td>
                      <td className={tableStyles.numeric}>
                        {needsReview > 0 ? <StatusPill tone="warning">{needsReview}</StatusPill> : '0'}
                      </td>
                      <td>{b.costSnapshot ? <StatusPill tone="success">เผยแพร่แล้ว</StatusPill> : '—'}</td>
                      <td>{b.sourcePriceSnapshot ? <StatusPill tone="success">เผยแพร่แล้ว</StatusPill> : '—'}</td>
                      <td>{b.createdAt.toLocaleDateString('th-TH')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
