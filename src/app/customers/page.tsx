import Link from 'next/link';
import { requireUser } from '@/lib/auth/currentUser';
import { getMarginGuardData, suggestedRaisePrice } from '@/lib/queries/marginGuard';
import type { CustomerGrade } from '@/lib/domain/customerGrade';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { RequestRaiseButton } from './RequestRaiseButton';
import { NewCustomerForm } from './NewCustomerForm';

const GRADES: CustomerGrade[] = ['A', 'B', 'C', 'D', 'F'];

function fmt(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const { grade } = await searchParams;
  const [user, data] = await Promise.all([requireUser(), getMarginGuardData()]);
  const canManageCustomers = user.role === 'SALES' || user.role === 'PRICING';

  if (!data) {
    return (
      <>
        <PageHeader title="ลูกค้า & ราคาสัญญา" who={[user.name[0] ?? '?', user.name, user.role]} />
        {canManageCustomers && <NewCustomerForm />}
        <EmptyState title="ยังไม่มีรอบตั้งราคา" description="สร้างรอบตั้งราคาและอนุมัติชีทราคาลูกค้าก่อน" />
      </>
    );
  }

  const gradeFilter = grade && GRADES.includes(grade as CustomerGrade) ? (grade as CustomerGrade) : null;
  const byGrade: Record<CustomerGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const c of data.customers) byGrade[c.grade] += 1;

  const shownCustomers = gradeFilter ? data.customers.filter((c) => c.grade === gradeFilter) : data.customers;
  const shownCustomerIds = new Set(shownCustomers.map((c) => c.id));
  const shownLines = gradeFilter ? data.lines.filter((l) => shownCustomerIds.has(l.customerId)) : data.lines;

  return (
    <>
      <PageHeader
        title="ลูกค้า & ราคาสัญญา (Contract Management)"
        subtitle="ลูกค้าสัญญาราคาล็อก แต่ทุนลอย — จัดการ Margin และรายการที่ต้องเจรจาปรับราคา"
        who={[user.name[0] ?? '?', user.name, user.role]}
      />

      {data.totals.belowTarget > 0 && (
        <div className="bar-top">
          <div className="t">⚠️ ราคาสัญญากำลังกินตัวเอง</div>
          <ul>
            <li>
              <b>{data.totals.belowTarget}</b> บรรทัด margin ต่ำกว่า Target ของหมวด — <b>{data.totals.loss}</b> บรรทัดขายต่ำกว่าทุนแล้ว
            </li>
            <li>ราคาล็อกไว้รอบเดียวแต่ทุนเป็นเรื่อยๆ — ต้องเจรจาขึ้นราคา หรือยอมรับว่าขาดทุนตัวนี้</li>
          </ul>
        </div>
      )}

      <div className="tools">
        {canManageCustomers && <NewCustomerForm />}
        <span className="hint2">กดที่การ์ดลูกค้าเพื่อดูเฉพาะบรรทัดของเจ้านั้น</span>
        <span className="sortg" style={{ marginLeft: 'auto' }}>
          <Link href="/customers" className={!gradeFilter ? 'tab on' : 'tab'}>
            ทุกเกรด ({data.customers.length})
          </Link>
          {GRADES.map((g) => (
            <Link
              key={g}
              href={byGrade[g] ? `/customers?grade=${g}` : '/customers'}
              aria-disabled={!byGrade[g]}
              className={gradeFilter === g ? 'tab on' : 'tab'}
              style={byGrade[g] ? undefined : { opacity: 0.4, pointerEvents: 'none' }}
            >
              เกรด {g} ({byGrade[g]})
            </Link>
          ))}
        </span>
      </div>

      <div className="card" style={{ padding: 0, border: 0, background: 'transparent' }}>
        <h3 style={{ padding: '0 2px 9px' }}>
          {gradeFilter ? `ลูกค้าเกรด ${gradeFilter} (${shownCustomers.length} เจ้า)` : `ร้านค้าคู่สัญญาทั้งหมด (${data.customers.length} ร้านค้า)`}
        </h3>
        {shownCustomers.length === 0 ? (
          <EmptyState title="ไม่มีลูกค้าเกรดนี้" />
        ) : (
          <div className="cgrid">
            {shownCustomers.map((c) => {
              const lv = c.lossCount > 0 ? 0 : c.belowTargetCount > 0 ? 1 : 2;
              const allVerified = c.verifiedCount === c.lineCount;
              return (
                <Link key={c.id} href={`/customers/${c.id}`} className={`cc lv${lv}`}>
                  <span className="tag">สัญญา · ราคาล็อก</span>
                  <div className="nm" title={c.name}>
                    {c.name}
                  </div>
                  <div className="sp">{c.code} · {c.lineCount} รายการล็อก</div>
                  <div className="row3">
                    <div>
                      <div className="big">{c.grade}</div>
                      <div className="u">เกรด</div>
                    </div>
                    <div className="mg2">
                      <b style={{ color: c.avgMarginPct < 0 ? 'var(--red)' : c.belowTargetCount > 0 ? 'var(--amber)' : 'var(--green)' }}>
                        {fmt(c.avgMarginPct)}%
                      </b>
                      <span>margin เฉลี่ย</span>
                    </div>
                  </div>
                  <div className={allVerified ? 'ok2' : 'ok2 warn'}>
                    {allVerified ? '✓ ยืนยันครบ' : `● ยังไม่ยืนยัน ${c.lineCount - c.verifiedCount} รายการ`}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="row" id="guard">
        <div className="card">
          <h3>
            Margin Guard — ทุกบรรทัดสัญญา
            <span className="sub">{shownLines.length} บรรทัด</span>
          </h3>
          <div className="tw2">
            <div className="sc">
              <table className="g">
                <thead>
                  <tr>
                    <th>ลูกค้าสัญญา</th>
                    <th>สินค้า</th>
                    <th>ราคาล็อก</th>
                    <th>ทุนปัจจุบัน</th>
                    <th>MARGIN</th>
                    <th>ต้องทำอะไร</th>
                    <th>การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {shownLines.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--tx-3)' }}>
                        ไม่มีบรรทัด
                      </td>
                    </tr>
                  ) : (
                    shownLines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.customerName}</td>
                        <td>{l.productName}</td>
                        <td>{fmt(l.lockedPrice)} ฿</td>
                        <td>{fmt(l.currentCost)} ฿</td>
                        <td className={l.state === 'loss' ? 'neg' : l.state === 'thin' ? 'low' : ''}>{fmt(l.marginPct)}%</td>
                        <td className="act">
                          {l.state === 'loss' ? (
                            <span style={{ color: 'var(--red)' }}>● ขาดทุน — เจรจาด่วน</span>
                          ) : l.state === 'thin' ? (
                            <span style={{ color: 'var(--amber)' }}>● บางกว่าเกณฑ์</span>
                          ) : (
                            <span style={{ color: 'var(--green)' }}>● ผ่านเกณฑ์</span>
                          )}
                        </td>
                        <td>
                          {l.state !== 'ok' && (
                            <RequestRaiseButton
                              customerId={l.customerId}
                              productId={l.productId}
                              productName={l.productName}
                              customerName={l.customerName}
                              lockedPrice={l.lockedPrice}
                              currentCost={l.currentCost}
                              targetPct={l.targetPct}
                              suggestedPrice={suggestedRaisePrice(l.currentCost, l.targetPct)}
                            />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
