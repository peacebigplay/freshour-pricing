import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import tableStyles from '@/components/ui/table.module.css';

export default async function AdminIntegrationsPage() {
  const [configs, marketSources, jobRuns] = await Promise.all([
    prisma.integrationConfig.findMany({ include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } } }),
    prisma.marketSource.findMany(),
    prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 15 }),
  ]);

  return (
    <>
      <PageHeader title="Integrations" subtitle="สถานะการเชื่อมต่อจริง — ไม่แสดงเป็นเชื่อมต่อแล้วถ้ายังไม่ได้เชื่อมต่อจริง" />

      <Card title="ระบบเชื่อมต่อ">
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>ระบบ</th>
                <th>สถานะ</th>
                <th>ลองล่าสุด</th>
                <th>สำเร็จล่าสุด</th>
                <th>ข้อผิดพลาดล่าสุด</th>
                <th>Fallback</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.displayName}</td>
                  <td>
                    <StatusPill tone={c.status === 'CONNECTED' ? 'success' : c.status === 'DEGRADED' ? 'warning' : c.status === 'BLOCKED' ? 'danger' : 'neutral'}>
                      {c.status}
                    </StatusPill>
                  </td>
                  <td>{c.lastAttemptAt?.toLocaleString('th-TH') ?? '—'}</td>
                  <td>{c.lastSuccessAt?.toLocaleString('th-TH') ?? '—'}</td>
                  <td>{c.lastError ?? '—'}</td>
                  <td>{c.fallbackAvailable ? 'มี' : 'ไม่มี'}</td>
                </tr>
              ))}
              {marketSources.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name} (Market)</td>
                  <td>
                    <StatusPill tone={m.status === 'CONNECTED' ? 'success' : 'neutral'}>{m.status}</StatusPill>
                  </td>
                  <td>{m.lastAttemptAt?.toLocaleString('th-TH') ?? '—'}</td>
                  <td>{m.lastSuccessAt?.toLocaleString('th-TH') ?? '—'}</td>
                  <td>{m.lastError ?? '—'}</td>
                  <td>มี (manual CSV / store-check)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      <Card title="Job Runs ล่าสุด">
        {jobRuns.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>ยังไม่มี background job ที่รัน</p>
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>งาน</th>
                  <th>เริ่ม</th>
                  <th>เสร็จ</th>
                  <th>ผลลัพธ์</th>
                </tr>
              </thead>
              <tbody>
                {jobRuns.map((j) => (
                  <tr key={j.id}>
                    <td>{j.jobName}</td>
                    <td>{j.startedAt.toLocaleString('th-TH')}</td>
                    <td>{j.finishedAt?.toLocaleString('th-TH') ?? '—'}</td>
                    <td>{j.outcome ?? 'กำลังทำงาน'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
