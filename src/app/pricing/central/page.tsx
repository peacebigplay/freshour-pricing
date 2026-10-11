import { getLatestOpenPricingRound, getCentralPriceLines } from '@/lib/queries/pricing';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { ApproveForm } from './ApproveForm';
import tableStyles from '@/components/ui/table.module.css';

function fmt(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
}

export default async function CentralPricingPage() {
  const round = await getLatestOpenPricingRound();
  if (!round) {
    return (
      <>
        <PageHeader title="Central Pricing" />
        <EmptyState title="ยังไม่มีรอบตั้งราคา" description="สร้างรอบตั้งราคาจาก Cost Snapshot ก่อน" />
      </>
    );
  }

  const lines = await getCentralPriceLines(round.id);

  return (
    <>
      <PageHeader title="Central Pricing" subtitle={`รอบ ${round.label} · ${lines.length} รายการ`} />

      {lines.length === 0 ? (
        <EmptyState title="ยังไม่มีรายการในรอบนี้" description="เผยแพร่ Cost Snapshot แล้วระบบจะสร้างรายการเสนอราคาอัตโนมัติ" />
      ) : (
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>หมวด</th>
                <th>เป้ามาร์จิ้น</th>
                <th className={tableStyles.numeric}>ทุนก่อนหน้า</th>
                <th className={tableStyles.numeric}>ทุนปัจจุบัน</th>
                <th className={tableStyles.numeric}>เปลี่ยนแปลง</th>
                <th className={tableStyles.numeric}>ราคาเดิม</th>
                <th className={tableStyles.numeric}>ราคาแนะนำ (Guard)</th>
                <th className={tableStyles.numeric}>มาร์จิ้นที่ได้</th>
                <th>สถานะ</th>
                <th>ทางเลือกตาม Goal / ยืนยัน</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{line.productName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{line.unit}</div>
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ fontSize: 10.5, color: 'var(--primary)', cursor: 'pointer' }}>Logic ราคาแนะนำ</summary>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>
                        ทุนปัจจุบัน {fmt(line.currentCost)} ฿ · Margin Guard: Global ≥{line.globalFloorPct}% · หมวด {line.category} {line.effectiveTargetPctValue.toFixed(1)}%
                        <br />
                        Guard Price = ceil({fmt(line.currentCost)} ÷ (1 − {line.effectiveTargetPctValue.toFixed(1)}%)) = {fmt(line.guardPrice)} ฿
                      </div>
                    </details>
                  </td>
                  <td>{line.category}</td>
                  <td className={tableStyles.numeric}>{line.effectiveTargetPctValue.toFixed(1)}%</td>
                  <td className={tableStyles.numeric}>{fmt(line.previousCost)}</td>
                  <td className={tableStyles.numeric}>{fmt(line.currentCost)}</td>
                  <td className={tableStyles.numeric} style={{ color: (line.costDelta ?? 0) > 0 ? 'var(--danger)' : (line.costDelta ?? 0) < 0 ? 'var(--success)' : undefined }}>
                    {line.costDelta == null ? '—' : (line.costDelta > 0 ? '+' : '') + fmt(line.costDelta)}
                  </td>
                  <td className={tableStyles.numeric}>{fmt(line.previousApprovedPrice)}</td>
                  <td className={tableStyles.numeric}>{fmt(line.guardPrice)}</td>
                  <td className={tableStyles.numeric}>
                    {line.resultingMarginPct == null ? '—' : `${line.resultingMarginPct.toFixed(1)}%`}
                  </td>
                  <td>
                    {line.isException ? (
                      <StatusPill tone="danger">ข้อยกเว้น</StatusPill>
                    ) : line.status === 'APPROVED' ? (
                      <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">รอตรวจสอบ</StatusPill>
                    )}
                  </td>
                  <td>
                    {line.status !== 'APPROVED' && (
                      <ApproveForm
                        lineId={line.id}
                        version={line.version}
                        defaultPrice={line.approvedPrice ?? (line.guardPrice || line.suggestedPrice)}
                        goals={line.goals}
                      />
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
