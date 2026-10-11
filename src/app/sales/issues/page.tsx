import { listCustomerIssues, listActiveCustomersBasic } from '@/lib/queries/issues';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { LogIssueForm } from './LogIssueForm';
import { CloseIssueButton } from './CloseIssueButton';
import styles from './issues.module.css';

const SEVERITY_LABEL: Record<string, string> = { LOW: 'ต่ำ', MID: 'กลาง', HIGH: 'สูง' };
const SEVERITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = { LOW: 'neutral', MID: 'warning', HIGH: 'danger' };

function timeAgo(d: Date) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function CustomerIssuesPage() {
  const [issues, customers] = await Promise.all([listCustomerIssues(), listActiveCustomersBasic()]);
  const open = issues.filter((i) => i.status === 'OPEN');
  const closed = issues.filter((i) => i.status === 'CLOSED');

  return (
    <>
      <PageHeader title="ปัญหาลูกค้า (Customer Service)" subtitle={`เปิดอยู่ ${open.length} เคส · ปิดแล้ว ${closed.length} เคส`} />

      <Card title="บันทึกปัญหาใหม่">
        <LogIssueForm customers={customers} />
      </Card>

      <div style={{ height: 20 }} />

      <Card title={`เคสที่เปิดอยู่ (${open.length})`}>
        {open.length === 0 ? (
          <EmptyState title="ไม่มีปัญหาที่เปิดอยู่" />
        ) : (
          <div className={styles.list}>
            {open.map((issue) => (
              <div key={issue.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {issue.customer.name} · {issue.type}
                  </span>
                  <span className={styles.rowMeta}>
                    {timeAgo(issue.createdAt)} · รายงานโดย {issue.reportedBy?.name ?? '—'}
                    {issue.carrier ? ` · ขนส่ง ${issue.carrier.name}` : ''}
                  </span>
                  <p className={styles.rowDetail}>{issue.detail}</p>
                </div>
                <div className={styles.rowSide}>
                  <StatusPill tone={SEVERITY_TONE[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</StatusPill>
                  <CloseIssueButton issueId={issue.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title={`ปิดแล้ว (${closed.length})`}>
        {closed.length === 0 ? (
          <EmptyState title="ยังไม่มีเคสที่ปิด" />
        ) : (
          <div className={styles.list}>
            {closed.slice(0, 20).map((issue) => (
              <div key={issue.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {issue.customer.name} · {issue.type}
                  </span>
                  <span className={styles.rowMeta}>
                    เปิด {timeAgo(issue.createdAt)}
                    {issue.closedAt ? ` · ปิด ${timeAgo(issue.closedAt)}` : ''}
                  </span>
                  <p className={styles.rowDetail}>{issue.detail}</p>
                </div>
                <div className={styles.rowSide}>
                  <StatusPill tone="success">ปิดแล้ว</StatusPill>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
