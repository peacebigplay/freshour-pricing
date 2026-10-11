import { notFound } from 'next/navigation';
import { getLatestOpenPricingRound } from '@/lib/queries/pricing';
import { getCustomerPriceSheet } from '@/lib/queries/customers';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import tableStyles from '@/components/ui/table.module.css';

function fmt(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const round = await getLatestOpenPricingRound();
  if (!round) {
    return (
      <>
        <PageHeader title="Customer Pricing" />
        <EmptyState title="ยังไม่มีรอบตั้งราคา" />
      </>
    );
  }

  const data = await getCustomerPriceSheet(id, round.id);
  if (!data) notFound();

  const { sheet, rows } = data;

  return (
    <>
      <PageHeader
        title={sheet.customer.name}
        subtitle={`${sheet.customer.code} · รอบ ${round.label}`}
        actions={
          sheet.status === 'APPROVED' ? (
            <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
          ) : (
            <StatusPill tone="neutral">รอตรวจสอบ</StatusPill>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีรายการราคาสำหรับลูกค้ารายนี้" />
      ) : (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>สินค้า</th>
                <th className={tableStyles.numeric}>Central Price</th>
                <th className={tableStyles.numeric}>ราคาลูกค้าเดิม</th>
                <th className={tableStyles.numeric}>ทุนปัจจุบัน</th>
                <th className={tableStyles.numeric}>ราคาแนะนำ</th>
                <th className={tableStyles.numeric}>ราคาอนุมัติ</th>
                <th className={tableStyles.numeric}>มาร์จิ้น</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>
                    {r.productName}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{r.unit}</div>
                  </td>
                  <td className={tableStyles.numeric}>{fmt(r.centralPrice)}</td>
                  <td className={tableStyles.numeric}>{fmt(r.previousCustomerPrice)}</td>
                  <td className={tableStyles.numeric}>{fmt(r.currentCost)}</td>
                  <td className={tableStyles.numeric}>{fmt(r.suggestedPrice)}</td>
                  <td className={tableStyles.numeric}>{fmt(r.approvedPrice)}</td>
                  <td className={tableStyles.numeric}>{r.resultingMarginPct == null ? '—' : `${r.resultingMarginPct.toFixed(1)}%`}</td>
                  <td>
                    {r.isException ? (
                      <StatusPill tone="danger">ข้อยกเว้น</StatusPill>
                    ) : r.status === 'APPROVED' ? (
                      <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">รอตรวจสอบ</StatusPill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
