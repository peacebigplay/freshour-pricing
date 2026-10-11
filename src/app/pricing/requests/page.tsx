import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import tableStyles from '@/components/ui/table.module.css';
import { DecideForm } from './DecideForm';

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
}

export default async function PriceRequestsPage() {
  const requests = await prisma.priceRequest.findMany({
    include: { customer: true, product: true, requestedBy: true, decidedBy: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const open = requests.filter((r) => r.status === 'OPEN');
  const decided = requests.filter((r) => r.status !== 'OPEN');

  return (
    <>
      <PageHeader title="คำขอปรับราคา" subtitle={`เปิดอยู่ ${open.length} คำขอ · ตัดสินใจแล้ว ${decided.length} คำขอ`} />

      {open.length === 0 ? (
        <EmptyState title="ไม่มีคำขอปรับราคาที่เปิดอยู่" />
      ) : (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>สินค้า</th>
                <th className={tableStyles.numeric}>ราคาเดิม</th>
                <th className={tableStyles.numeric}>ทุนปัจจุบัน</th>
                <th className={tableStyles.numeric}>เป้ามาร์จิ้น</th>
                <th>เหตุผล</th>
                <th>ขอโดย</th>
                <th>ตัดสินใจ</th>
              </tr>
            </thead>
            <tbody>
              {open.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.customer.name}</td>
                  <td>{r.product.canonicalName}</td>
                  <td className={tableStyles.numeric}>{fmt(r.originalPrice)}</td>
                  <td className={tableStyles.numeric}>{fmt(r.currentCost)}</td>
                  <td className={tableStyles.numeric}>{r.targetPct.toFixed(1)}%</td>
                  <td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{r.reason ?? '—'}</td>
                  <td>{r.requestedBy.name}</td>
                  <td>
                    <DecideForm requestId={r.id} suggestedPrice={r.requestedPrice} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ height: 20 }} />

      {decided.length > 0 && (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>สินค้า</th>
                <th className={tableStyles.numeric}>ราคาที่อนุมัติ</th>
                <th>สถานะ</th>
                <th>ตัดสินใจโดย</th>
              </tr>
            </thead>
            <tbody>
              {decided.slice(0, 30).map((r) => (
                <tr key={r.id}>
                  <td>{r.customer.name}</td>
                  <td>{r.product.canonicalName}</td>
                  <td className={tableStyles.numeric}>{r.finalPrice != null ? fmt(r.finalPrice) : '—'}</td>
                  <td>
                    {r.status === 'APPROVED' ? (
                      <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
                    ) : (
                      <StatusPill tone="danger">ปฏิเสธ</StatusPill>
                    )}
                  </td>
                  <td>{r.decidedBy?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
