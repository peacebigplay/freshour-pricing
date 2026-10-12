import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { DecisionForm } from './DecisionForm';

export default async function NegotiationCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const negotiationCase = await prisma.negotiationCase.findUnique({
    where: { id },
    include: {
      customer: true,
      product: { include: { marginOverride: true } },
      events: { include: { actor: true }, orderBy: { createdAt: 'asc' } },
      quoteResponse: true,
    },
  });
  if (!negotiationCase) notFound();

  return (
    <>
      <PageHeader
        title={`เจรจาราคา · ${negotiationCase.customer.name} · ${negotiationCase.product.canonicalName}`}
        actions={<StatusPill tone={negotiationCase.status === 'OPEN' ? 'warning' : negotiationCase.status === 'APPROVED' ? 'success' : 'danger'}>{negotiationCase.status}</StatusPill>}
      />

      <div className="kpi">
        <div className="k">
          <div className="kt">
            <span className="ic">💰</span>
          </div>
          <div className="lb">ราคาที่อนุมัติเดิม</div>
          <div className="v">{negotiationCase.originalApprovedPrice.toLocaleString('th-TH')}</div>
        </div>
        <div className="k lead">
          <div className="kt">
            <span className="ic">🙋</span>
            <span className="pill">ลูกค้าขอ</span>
          </div>
          <div className="lb">ราคาที่ลูกค้าขอ</div>
          <div className="v">{negotiationCase.requestedPrice.toLocaleString('th-TH')}</div>
        </div>
        <div className="k">
          <div className="kt">
            <span className="ic">🏭</span>
          </div>
          <div className="lb">ทุนสูงสุดที่รับได้จากซัพพลายเออร์</div>
          <div className="v">{negotiationCase.supplierMaxCostTarget?.toLocaleString('th-TH', { maximumFractionDigits: 1 }) ?? '—'}</div>
          <div className="c">คำนวณจากราคาที่ลูกค้าขอ ที่เป้ามาร์จิ้นปัจจุบัน</div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {negotiationCase.quoteResponse.reason && (
        <Card title="เหตุผลจากลูกค้า">
          <p style={{ fontSize: 13 }}>{negotiationCase.quoteResponse.reason}</p>
        </Card>
      )}

      <div style={{ height: 20 }} />

      <Card title="ประวัติการเจรจา">
        {negotiationCase.events.length === 0 ? (
          <p className="hint">ยังไม่มีกิจกรรม</p>
        ) : (
          <div className="tw2">
            <div className="sc">
              <table className="g">
                <thead>
                  <tr>
                    <th>ผู้ดำเนินการ</th>
                    <th>เหตุการณ์</th>
                    <th>เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {negotiationCase.events.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.actor?.name ?? 'ระบบ'}</td>
                      <td>{e.eventType}</td>
                      <td>{e.createdAt.toLocaleString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {negotiationCase.status === 'OPEN' && user.role === 'PRICING' && (
        <div style={{ marginTop: 20 }}>
          <DecisionForm negotiationCaseId={negotiationCase.id} defaultPrice={negotiationCase.requestedPrice} />
        </div>
      )}
    </>
  );
}
