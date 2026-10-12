import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
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

      <div className={`todoalert${open.length > 1 ? ' stack' : ''}`}>
        <div className="nah">
          <span style={{ fontSize: 18 }}>💬</span>
          <b>ลูกค้าต่อรองกลับ · ต้องทำราคาใหม่</b>
          <span className="ncount">{open.length} เรื่อง</span>
        </div>
        {open.length === 0 ? (
          <EmptyState title="ไม่มีคำขอปรับราคาที่เปิดอยู่" />
        ) : (
          <div className="reqs">
            {open.map((r) => (
              <div className="rq" key={r.id}>
                <div className="rqb">
                  <b>{r.customer.name}</b>
                  <span>{r.product.canonicalName}</span>
                  <em>
                    ลูกค้าขอ <b>{fmt(r.requestedPrice)} ฿</b> · ราคาเดิม {fmt(r.originalPrice)} ฿ · ทุน {fmt(r.currentCost)} ฿ · Target {r.targetPct.toFixed(1)}%
                  </em>
                  {r.reason && <i>&ldquo;{r.reason}&rdquo;</i>}
                  <div style={{ fontSize: 10.5, color: 'var(--tx-3)', marginTop: 4 }}>ขอโดย {r.requestedBy.name}</div>
                </div>
                <div className="rqa">
                  <DecideForm requestId={r.id} suggestedPrice={r.requestedPrice} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div className="row">
          <div className="card">
            <h3>
              ตัดสินใจแล้ว <span className="sub">{decided.length} รายการ</span>
            </h3>
            <div className="tw2">
              <div className="sc">
                <table className="g">
                  <thead>
                    <tr>
                      <th>ลูกค้า</th>
                      <th>สินค้า</th>
                      <th>ราคาที่อนุมัติ</th>
                      <th>สถานะ</th>
                      <th>ตัดสินใจโดย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decided.slice(0, 30).map((r) => (
                      <tr key={r.id}>
                        <td>{r.customer.name}</td>
                        <td>{r.product.canonicalName}</td>
                        <td>{r.finalPrice != null ? fmt(r.finalPrice) : '—'}</td>
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
