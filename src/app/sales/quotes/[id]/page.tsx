import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { Card } from '@/components/ui/Card';
import { CloseDealButton } from './CloseDealButton';

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      owner: true,
      publicTokens: true,
      revisions: {
        orderBy: { revision: 'desc' },
        include: { lines: { include: { product: true } }, responses: true },
      },
      closedDeal: { include: { financialHandoff: true } },
    },
  });
  if (!quote) notFound();

  const latest = quote.revisions[0];
  const activeToken = quote.publicTokens.find((t) => !t.revokedAt && t.expiresAt > new Date());

  return (
    <>
      <PageHeader
        title={`ใบเสนอราคา · ${quote.customer.name}`}
        subtitle={`เจ้าของ: ${quote.owner.name} · รีวิชัน ${latest?.revision ?? 1}`}
        actions={<StatusPill tone={quote.status === 'ACCEPTED' ? 'success' : quote.status === 'NEGOTIATING' ? 'warning' : 'neutral'}>{quote.status}</StatusPill>}
      />

      <Card title="ลิงก์สำหรับลูกค้า">
        {activeToken ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            ลิงก์ใช้งานอยู่ หมดอายุ {activeToken.expiresAt.toLocaleDateString('th-TH')} — ลิงก์แบบเต็มถูกส่งให้ลูกค้าแล้วตอนสร้างใบเสนอราคา (แสดงครั้งเดียวเพื่อความปลอดภัย)
          </p>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>ไม่มีลิงก์ที่ใช้งานอยู่</p>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title="รายการสินค้า">
        <div className="tw2">
          <div className="sc">
            <table className="g">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>หน่วย</th>
                  <th>ราคาที่เสนอ</th>
                </tr>
              </thead>
              <tbody>
                {latest?.lines.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.product.canonicalName}</td>
                    <td>{l.unit}</td>
                    <td>{l.offeredPrice.toLocaleString('th-TH')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {quote.status === 'ACCEPTED' && !quote.closedDeal && (
        <div style={{ marginTop: 20 }}>
          <CloseDealButton quoteId={quote.id} />
        </div>
      )}

      {quote.closedDeal && (
        <div style={{ marginTop: 20 }}>
          <Card title="Closed Deal">
            <p style={{ fontSize: 13 }}>
              ปิดดีลแล้วเมื่อ {quote.closedDeal.closedAt.toLocaleString('th-TH')} ·{' '}
              <StatusPill tone={quote.closedDeal.financialHandoff?.status === 'RECONCILED' ? 'success' : 'neutral'}>
                Financial Handoff: {quote.closedDeal.financialHandoff?.status ?? 'PENDING'}
              </StatusPill>
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
              การปิดดีลยังไม่ถือเป็นยอดขายจริง — ต้องรอใบแจ้งหนี้ (Invoice) ที่ POSTED แล้วเท่านั้นจึงจะนับเป็น Actual Revenue
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
