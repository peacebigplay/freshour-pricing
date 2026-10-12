import { getLatestOpenPricingRound, getCentralPriceLines } from '@/lib/queries/pricing';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { ApproveForm } from './ApproveForm';

function fmt(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
}

export default async function CentralPricingPage() {
  const round = await getLatestOpenPricingRound();
  if (!round) {
    return (
      <>
        <PageHeader title="ตั้งราคากลาง" />
        <EmptyState title="ยังไม่มีรอบตั้งราคา" description="สร้างรอบตั้งราคาจาก Cost Snapshot ก่อน" />
      </>
    );
  }

  const lines = await getCentralPriceLines(round.id);
  const kCost = lines.filter((l) => l.currentCost > 0).length;
  const kPrev = lines.filter((l) => l.previousApprovedPrice != null).length;

  return (
    <>
      <PageHeader title="ตั้งราคากลาง (Central Pricing)" subtitle={`รอบ ${round.label} · ${lines.length} รายการ`} />

      {lines.length === 0 ? (
        <EmptyState title="ยังไม่มีรายการในรอบนี้" description="เผยแพร่ Cost Snapshot แล้วระบบจะสร้างรายการเสนอราคาอัตโนมัติ" />
      ) : (
        <div className="tw2">
          <div className="sc">
            <table className="g zt" style={{ minWidth: 1280 }}>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th className="zh2">
                    ต้นทุนรอบปัจจุบัน
                    <span className="thperiod">{round.label}</span>
                    <i className="cnt">
                      {kCost}/{lines.length}
                    </i>
                  </th>
                  <th className="zh2">ต้นทุนรอบก่อน</th>
                  <th className="zh1">
                    ราคาขายรอบก่อน
                    <i className="cnt">
                      {kPrev}/{lines.length}
                    </i>
                  </th>
                  <th className="zh3">ราคาตลาดล่าสุด</th>
                  <th className="zh4">
                    ราคาขายรอบปัจจุบัน
                    <span className="thperiod">ตาม Goal ที่เลือก</span>
                  </th>
                  <th>สถานะ</th>
                  <th>ทางเลือกตาม Goal / ยืนยัน</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className={line.isException ? 'work' : line.status === 'APPROVED' ? 'confirmed' : ''}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{line.productName}</div>
                      <div style={{ fontSize: 11, color: 'var(--tx-3)' }}>{line.unit}</div>
                      <div style={{ fontSize: 10, color: 'var(--tx-3)', marginTop: 2 }}>
                        {line.category} · Target {line.effectiveTargetPctValue.toFixed(1)}% · Floor ≥{line.globalFloorPct}%
                      </div>
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ fontSize: 10.5, color: 'var(--blue)', cursor: 'pointer' }}>ดู Logic</summary>
                        <div style={{ fontSize: 10.5, color: 'var(--tx-3)', marginTop: 4, lineHeight: 1.6 }}>
                          Guard Price = ceil({fmt(line.currentCost)} ÷ (1 − {line.effectiveTargetPctValue.toFixed(1)}%)) = {fmt(line.guardPrice)} ฿
                        </div>
                      </details>
                    </td>
                    <td className={`zc z2${(line.costDelta ?? 0) > 0 ? ' up' : (line.costDelta ?? 0) < 0 ? ' dn' : ''}`}>
                      <b>{fmt(line.currentCost)}</b>
                      <em style={{ color: (line.costDelta ?? 0) > 0 ? 'var(--red)' : (line.costDelta ?? 0) < 0 ? 'var(--green)' : 'var(--tx-3)' }}>
                        {line.costDelta == null || line.costDelta === 0
                          ? 'ทุนไม่ขยับ'
                          : line.costDelta > 0
                            ? `ขึ้น ${fmt(line.costDelta)} ฿`
                            : `ลง ${fmt(Math.abs(line.costDelta))} ฿`}
                      </em>
                    </td>
                    <td className="zc z2">
                      <b>{fmt(line.previousCost)}</b>
                      <em>บาท/กก.</em>
                    </td>
                    <td className="zc z1">
                      <b>{fmt(line.previousApprovedPrice)}</b>
                      <em>{line.previousApprovedPrice ? 'รอบก่อนออก' : 'ยังไม่เคยประกาศ'}</em>
                    </td>
                    <td className="zc z3">
                      <b>—</b>
                      <em>ไม่มีข้อมูล</em>
                    </td>
                    <td className="zc z4">
                      <b>{fmt(line.approvedPrice ?? line.guardPrice)}</b>
                      <em style={{ color: line.resultingMarginPct != null && line.resultingMarginPct < line.effectiveTargetPctValue ? 'var(--red)' : 'var(--green)' }}>
                        กำไร {line.resultingMarginPct == null ? '—' : `${line.resultingMarginPct.toFixed(1)}%`}
                      </em>
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
        </div>
      )}
    </>
  );
}
