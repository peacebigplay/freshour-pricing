import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/currentUser';
import { getLatestOpenPricingRound } from '@/lib/queries/pricing';
import { getCustomerPriceSheet } from '@/lib/queries/customers';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { ApproveCustomerPriceForm } from './ApproveCustomerPriceForm';
import { ApproveSheetButton } from './ApproveSheetButton';

function fmt(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, round] = await Promise.all([requireUser(), getLatestOpenPricingRound()]);
  const canApprove = user.role === 'PRICING';
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
  const approvedCount = rows.filter((r) => r.status === 'APPROVED').length;
  const exceptionCount = rows.filter((r) => r.isException).length;

  return (
    <>
      <PageHeader
        title={sheet.customer.name}
        subtitle={`${sheet.customer.code} · รอบ ${round.label}`}
        actions={
          sheet.status === 'APPROVED' ? (
            <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
          ) : canApprove && rows.length > 0 ? (
            <ApproveSheetButton sheetId={sheet.id} />
          ) : (
            <StatusPill tone="neutral">รอตรวจสอบ</StatusPill>
          )
        }
      />

      <div className="kpi">
        <div className="k">
          <div className="kt">
            <span className="ic">📦</span>
          </div>
          <div className="lb">สินค้าทั้งหมด</div>
          <div className="v">{rows.length}</div>
          <div className="c">รายการ</div>
        </div>
        <div className="k">
          <div className="kt">
            <span className="ic">✅</span>
          </div>
          <div className="lb">อนุมัติแล้ว</div>
          <div className="v" style={{ color: 'var(--green)' }}>
            {approvedCount}
          </div>
          <div className="c">จาก {rows.length} รายการ</div>
        </div>
        <div className="k">
          <div className="kt">
            <span className="ic">⚠️</span>
          </div>
          <div className="lb">ข้อยกเว้น</div>
          <div className="v" style={{ color: exceptionCount > 0 ? 'var(--red)' : undefined }}>
            {exceptionCount}
          </div>
          <div className="c">ต้องตรวจสอบ</div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีรายการราคาสำหรับลูกค้ารายนี้" />
      ) : (
        <div className="tw2">
          <div className="sc">
            <table className="g">
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>Central Price</th>
                  <th>ราคาลูกค้าเดิม</th>
                  <th>ทุนปัจจุบัน</th>
                  <th>ราคาแนะนำ</th>
                  <th>ราคาอนุมัติ</th>
                  <th>มาร์จิ้น</th>
                  <th>สถานะ</th>
                  {canApprove && <th>การดำเนินการ</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      {r.productName}
                      <div style={{ fontSize: 11, color: 'var(--tx-3)', fontWeight: 400 }}>{r.unit}</div>
                    </td>
                    <td>{fmt(r.centralPrice)}</td>
                    <td>{fmt(r.previousCustomerPrice)}</td>
                    <td>{fmt(r.currentCost)}</td>
                    <td>{fmt(r.suggestedPrice)}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(r.approvedPrice)}</td>
                    <td>
                      <span className={`pill2 ${r.resultingMarginPct == null ? 'n' : r.resultingMarginPct < 0 ? 'r' : 'g'}`}>
                        {r.resultingMarginPct == null ? '—' : `${r.resultingMarginPct.toFixed(1)}%`}
                      </span>
                    </td>
                    <td>
                      {r.isException ? (
                        <StatusPill tone="danger">ข้อยกเว้น</StatusPill>
                      ) : r.status === 'APPROVED' ? (
                        <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">รอตรวจสอบ</StatusPill>
                      )}
                    </td>
                    {canApprove && (
                      <td>
                        {r.status !== 'APPROVED' && (
                          <ApproveCustomerPriceForm
                            lineId={r.id}
                            customerId={sheet.customerId}
                            version={r.version}
                            defaultPrice={r.approvedPrice ?? r.suggestedPrice}
                            currentCost={r.currentCost}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
