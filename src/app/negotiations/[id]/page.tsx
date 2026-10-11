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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <Card title="ราคาที่อนุมัติเดิม">
          <p style={{ fontSize: 22, fontWeight: 700 }}>{negotiationCase.originalApprovedPrice.toLocaleString('th-TH')}</p>
        </Card>
        <Card title="ราคาที่ลูกค้าขอ">
          <p style={{ fontSize: 22, fontWeight: 700 }}>{negotiationCase.requestedPrice.toLocaleString('th-TH')}</p>
        </Card>
        <Card title="ต้นทุนสูงสุดที่ยอมรับได้จากซัพพลายเออร์">
          <p style={{ fontSize: 22, fontWeight: 700 }}>
            {negotiationCase.supplierMaxCostTarget?.toLocaleString('th-TH', { maximumFractionDigits: 1 }) ?? '—'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>คำนวณจากราคาที่ลูกค้าขอ ที่เป้ามาร์จิ้นปัจจุบัน</p>
        </Card>
      </div>

      {negotiationCase.quoteResponse.reason && (
        <Card title="เหตุผลจากลูกค้า">
          <p style={{ fontSize: 13 }}>{negotiationCase.quoteResponse.reason}</p>
        </Card>
      )}

      <div style={{ height: 20 }} />

      <Card title="ประวัติการเจรจา">
        {negotiationCase.events.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>ยังไม่มีกิจกรรม</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {negotiationCase.events.map((e) => (
              <div key={e.id} style={{ fontSize: 12.5, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                <b>{e.actor?.name ?? 'ระบบ'}</b> · {e.eventType} · {e.createdAt.toLocaleString('th-TH')}
              </div>
            ))}
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
