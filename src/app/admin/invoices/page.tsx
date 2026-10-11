import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import tableStyles from '@/components/ui/table.module.css';
import { UploadCsvForm } from './UploadCsvForm';
import { PostInvoiceButton } from './PostInvoiceButton';
import { ResolveExceptionButton } from './ResolveExceptionButton';

export default async function AdminInvoicesPage() {
  const [invoices, exceptions] = await Promise.all([
    prisma.invoice.findMany({
      orderBy: { invoiceDate: 'desc' },
      take: 50,
      include: { customer: true, lines: true },
    }),
    prisma.reconciliationException.findMany({
      where: { resolved: false },
      include: { invoice: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <>
      <PageHeader title="Financial Import" subtitle="Invoice fallback (CSV) — e-Today ยังไม่ได้เชื่อมต่อ" />

      <Card title="นำเข้า Invoice จาก CSV (fallback)">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          คอลัมน์ที่ต้องมี: invoiceNumber, customerCode, productAlias, quantity, unit, netSales, recognizedCost (เว้นว่างได้), invoiceDate
        </p>
        <UploadCsvForm />
      </Card>

      <div style={{ height: 20 }} />

      {exceptions.length > 0 && (
        <>
          <Card title={`ข้อยกเว้นที่ยังไม่แก้ไข (${exceptions.length})`}>
            <div className={tableStyles.tableWrap}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>ประเภท</th>
                    <th>รายละเอียด</th>
                    <th>Invoice</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((e) => (
                    <tr key={e.id}>
                      <td><StatusPill tone="danger">{e.kind}</StatusPill></td>
                      <td>{e.detail}</td>
                      <td>{e.invoice ? `${e.invoice.invoiceNumber} (${e.invoice.customer.name})` : '—'}</td>
                      <td><ResolveExceptionButton exceptionId={e.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div style={{ height: 20 }} />
        </>
      )}

      <Card title="Invoices">
        {invoices.length === 0 ? (
          <EmptyState title="ยังไม่มีใบแจ้งหนี้ในระบบ" />
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ลูกค้า</th>
                  <th>วันที่</th>
                  <th>สถานะ</th>
                  <th className={tableStyles.numeric}>ยอดขายสุทธิ</th>
                  <th className={tableStyles.numeric}>GP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const netSales = inv.lines.reduce((s, l) => s + l.netSales, 0);
                  const hasPending = inv.lines.some((l) => l.grossProfit == null);
                  const gp = inv.lines.reduce((s, l) => s + (l.grossProfit ?? 0), 0);
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                      <td>{inv.customer.name}</td>
                      <td>{inv.invoiceDate.toLocaleDateString('th-TH')}</td>
                      <td>
                        <StatusPill tone={inv.status === 'POSTED' ? 'success' : inv.status === 'VOID' ? 'danger' : 'neutral'}>{inv.status}</StatusPill>
                      </td>
                      <td className={tableStyles.numeric}>{netSales.toLocaleString('th-TH')}</td>
                      <td className={tableStyles.numeric}>{hasPending ? 'COST_PENDING' : gp.toLocaleString('th-TH')}</td>
                      <td>{inv.status === 'STAGED' && <PostInvoiceButton invoiceId={inv.id} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
