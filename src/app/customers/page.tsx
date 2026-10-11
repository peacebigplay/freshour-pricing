import Link from 'next/link';
import { requireUser } from '@/lib/auth/currentUser';
import { getMarginGuardData, suggestedRaisePrice } from '@/lib/queries/marginGuard';
import type { CustomerGrade } from '@/lib/domain/customerGrade';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import tableStyles from '@/components/ui/table.module.css';
import { RequestRaiseButton } from './RequestRaiseButton';
import { NewCustomerForm } from './NewCustomerForm';
import styles from './customers.module.css';

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
        <PageHeader title="Customers & ราคาสัญญา" />
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
        title="Customers & ราคาสัญญา"
        subtitle="ลูกค้าสัญญาราคาล็อก แต่ทุนลอย — จัดการ Margin และรายการที่ต้องเจรจาปรับราคา"
      />

      {canManageCustomers && <NewCustomerForm />}

      {data.totals.belowTarget > 0 && (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>⚠️ ราคาสัญญากำลังกินตัวเอง</p>
          <p className={styles.bannerText}>
            <b>{data.totals.belowTarget}</b> บรรทัด margin ต่ำกว่า Target ของหมวด — <b>{data.totals.loss}</b> บรรทัดขายต่ำกว่าทุนแล้ว
            ต้องเจรจาขึ้นราคา หรือยอมรับว่าขาดทุนตัวนี้
          </p>
        </div>
      )}

      <div className={styles.gradeRow}>
        <Link href="/customers" className={`${styles.gradeTab} ${!gradeFilter ? styles.gradeTabOn : ''}`}>
          ทุกเกรด ({data.customers.length})
        </Link>
        {GRADES.map((g) => (
          <Link
            key={g}
            href={byGrade[g] ? `/customers?grade=${g}` : '/customers'}
            aria-disabled={!byGrade[g]}
            className={`${styles.gradeTab} ${gradeFilter === g ? styles.gradeTabOn : ''}`}
            style={byGrade[g] ? undefined : { opacity: 0.4, pointerEvents: 'none' }}
          >
            เกรด {g} ({byGrade[g]})
          </Link>
        ))}
      </div>

      {shownCustomers.length === 0 ? (
        <EmptyState title="ไม่มีลูกค้าเกรดนี้" />
      ) : (
        <div className={styles.cardGrid}>
          {shownCustomers.map((c) => {
            const tone = c.lossCount > 0 ? 'Loss' : c.belowTargetCount > 0 ? 'Thin' : 'Ok';
            return (
              <Link key={c.id} href={`/customers/${c.id}`} className={`${styles.custCard} ${styles[`custCard${tone}`]}`}>
                <p className={styles.custName}>{c.name}</p>
                <p className={styles.custMeta}>
                  {c.code} · {c.lineCount} รายการล็อก
                </p>
                <div className={styles.custStats}>
                  <span className={styles.custGrade}>{c.grade}</span>
                  <span className={styles.custMargin}>
                    <span
                      className={styles.custMarginValue}
                      style={{ color: c.avgMarginPct < 0 ? 'var(--danger)' : c.belowTargetCount > 0 ? 'var(--warning)' : 'var(--success)' }}
                    >
                      {fmt(c.avgMarginPct)}%
                    </span>
                    <span className={styles.custMarginLabel}> margin เฉลี่ย</span>
                  </span>
                </div>
                <p className={`${styles.custVerified} ${c.verifiedCount < c.lineCount ? styles.custVerifiedWarn : ''}`}>
                  {c.verifiedCount === c.lineCount ? '✓ ยืนยันครบ' : `● ยังไม่ยืนยัน ${c.lineCount - c.verifiedCount} รายการ`}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <div className={tableStyles.tableWrap}>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>ลูกค้าสัญญา</th>
              <th>สินค้า</th>
              <th className={tableStyles.numeric}>ราคาล็อก</th>
              <th className={tableStyles.numeric}>ทุนปัจจุบัน</th>
              <th className={tableStyles.numeric}>Margin</th>
              <th>ต้องทำอะไร</th>
              <th>การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {shownLines.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  ไม่มีบรรทัด
                </td>
              </tr>
            ) : (
              shownLines.map((l) => (
                <tr key={l.id}>
                  <td>{l.customerName}</td>
                  <td>{l.productName}</td>
                  <td className={tableStyles.numeric}>{fmt(l.lockedPrice)} ฿</td>
                  <td className={tableStyles.numeric}>{fmt(l.currentCost)} ฿</td>
                  <td className={tableStyles.numeric} style={{ color: l.state === 'loss' ? 'var(--danger)' : l.state === 'thin' ? 'var(--warning)' : 'var(--success)' }}>
                    {fmt(l.marginPct)}%
                  </td>
                  <td>
                    {l.state === 'loss' ? (
                      <StatusPill tone="danger">ขาดทุน — เจรจาด่วน</StatusPill>
                    ) : l.state === 'thin' ? (
                      <StatusPill tone="warning">บางกว่าเกณฑ์</StatusPill>
                    ) : (
                      <StatusPill tone="success">ผ่านเกณฑ์</StatusPill>
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
    </>
  );
}
