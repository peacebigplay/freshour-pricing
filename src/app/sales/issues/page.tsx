import { listCustomerIssues, listActiveCustomersBasic } from '@/lib/queries/issues';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { LogIssueForm } from './LogIssueForm';
import { CloseIssueButton } from './CloseIssueButton';
import '@/components/ui/issue-dashboard.css';

const SEVERITY_LABEL: Record<string, string> = { LOW: 'ต่ำ', MID: 'กลาง', HIGH: 'สูง' };
const SEVERITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = { LOW: 'neutral', MID: 'warning', HIGH: 'danger' };

function timeAgo(d: Date) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function CustomerIssuesPage() {
  const [issues, customers] = await Promise.all([listCustomerIssues(), listActiveCustomersBasic()]);
  const open = issues.filter((i) => i.status === 'OPEN');
  const closed = issues.filter((i) => i.status === 'CLOSED');

  const byCustomerCount = new Map<string, number>();
  for (const i of issues) byCustomerCount.set(i.customer.name, (byCustomerCount.get(i.customer.name) ?? 0) + 1);
  const repeatCustomers = [...byCustomerCount.values()].filter((n) => n > 1).length;

  const byType = new Map<string, number>();
  for (const i of issues) byType.set(i.type, (byType.get(i.type) ?? 0) + 1);
  const byTypeRows = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const maxType = Math.max(...byTypeRows.map((r) => r[1]), 1);

  const byCustomerRows = [...byCustomerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxCustomer = Math.max(...byCustomerRows.map((r) => r[1]), 1);

  return (
    <>
      <PageHeader title="บันทึกปัญหาจากลูกค้า" subtitle="แยกจากการออกราคา · เซลบันทึก → แดชบอร์ดผู้บริหารอัปเดตเอง" />

      <div className="issk">
        <div>
          <span>ปัญหาทั้งหมด</span>
          <b>{issues.length}</b>
        </div>
        <div>
          <span>ยังเปิดอยู่</span>
          <b style={{ color: '#DC2626' }}>{open.length}</b>
        </div>
        <div>
          <span>ลูกค้าที่เกิดซ้ำ</span>
          <b style={{ color: '#D97706' }}>{repeatCustomers}</b>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="issg">
          <div className="card">
            <h3>ตามประเภทปัญหา</h3>
            {byTypeRows.map(([type, count]) => (
              <div className="isb" key={type}>
                <span>{type}</span>
                <i>
                  <u style={{ width: `${(count / maxType) * 100}%`, background: '#2563EB' }} />
                </i>
                <b>{count}</b>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>ตามลูกค้า</h3>
            {byCustomerRows.map(([name, count]) => (
              <div className="isb" key={name}>
                <span>{name}</span>
                <i>
                  <u style={{ width: `${(count / maxCustomer) * 100}%`, background: '#D97706' }} />
                </i>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 14 }} />

      <Card title="บันทึกปัญหาใหม่">
        <LogIssueForm customers={customers} />
      </Card>

      <div style={{ height: 20 }} />

      <Card title={`เคสที่เปิดอยู่ (${open.length})`}>
        {open.length === 0 ? (
          <EmptyState title="ไม่มีปัญหาที่เปิดอยู่" />
        ) : (
          <table className="g" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>ลูกค้า</th>
                <th>ประเภท</th>
                <th>รายละเอียด</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {open.map((issue) => (
                <tr key={issue.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{timeAgo(issue.createdAt)}</td>
                  <td style={{ fontWeight: 600 }}>{issue.customer.name}</td>
                  <td>
                    {issue.type}
                    {issue.severity === 'HIGH' && ' 🔴'}
                  </td>
                  <td style={{ whiteSpace: 'normal', textAlign: 'left' }}>{issue.detail}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <StatusPill tone={SEVERITY_TONE[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</StatusPill>
                      <CloseIssueButton issueId={issue.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title={`ปิดแล้ว (${closed.length})`}>
        {closed.length === 0 ? (
          <EmptyState title="ยังไม่มีเคสที่ปิด" />
        ) : (
          <table className="g" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>ประเภท</th>
                <th>รายละเอียด</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {closed.slice(0, 20).map((issue) => (
                <tr key={issue.id}>
                  <td style={{ fontWeight: 600 }}>{issue.customer.name}</td>
                  <td>{issue.type}</td>
                  <td style={{ whiteSpace: 'normal', textAlign: 'left' }}>{issue.detail}</td>
                  <td>
                    <StatusPill tone="success">ปิดแล้ว</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
