import {
  getExecutiveFinancials,
  getCategoryTargetVsActual,
  getSalesPipelineCounts,
  getClosedDealsAwaitingInvoice,
  getDataHealth,
  getAttentionQueue,
} from '@/lib/queries/executive';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertCard } from '@/components/ui/AlertCard';
import { ResolveButton } from './ResolveButton';

function money(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

const PIPELINE_LABEL: Record<string, string> = {
  DRAFT: 'ฉบับร่าง', SENT: 'ส่งแล้ว', CUSTOMER_RESPONDED: 'ลูกค้าตอบกลับ',
  NEGOTIATING: 'เจรจา', ACCEPTED: 'ยอมรับแล้ว', CLOSED: 'ปิดดีล', EXPIRED: 'หมดอายุ',
};

export default async function ExecutiveDashboardPage() {
  const [financials, categories, pipeline, awaitingInvoice, health, attention] = await Promise.all([
    getExecutiveFinancials(),
    getCategoryTargetVsActual(),
    getSalesPipelineCounts(),
    getClosedDealsAwaitingInvoice(),
    getDataHealth(),
    getAttentionQueue(),
  ]);

  const hasRevenueData = financials.postedLineCount > 0;

  return (
    <>
      <PageHeader title="Executive" subtitle="ภาพรวมธุรกิจและสิ่งที่ต้องตัดสินใจ" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard
          label="Actual Revenue (Posted)"
          value={hasRevenueData ? money(financials.revenue) : 'ยังไม่มีข้อมูล'}
          caption={hasRevenueData ? `จาก ${financials.postedLineCount} invoice lines` : 'รอใบแจ้งหนี้ POSTED'}
        />
        <KpiCard
          label="Gross Profit"
          value={hasRevenueData ? money(financials.totalGp) : 'ยังไม่มีข้อมูล'}
          caption={`${financials.coveragePct.toFixed(0)}% ของรายการมีต้นทุนยืนยันแล้ว`}
        />
        <KpiCard label="ดีลที่ปิดแล้ว รอใบแจ้งหนี้" value={String(awaitingInvoice)} />
        <KpiCard
          label="Market Data"
          value={health.marketConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
          caption="ไม่มีการสร้างข้อมูลสมมติ"
        />
      </div>

      {!hasRevenueData && (
        <div style={{ marginBottom: 16 }}>
          <AlertCard
            tone="neutral"
            title="No production data yet — Revenue/GP"
            description="ยังไม่มีใบแจ้งหนี้สถานะ POSTED ในระบบ ตัวเลข Revenue และ GP จะคำนวณจากข้อมูลจริงเมื่อมีการนำเข้า ไม่ใช่ตัวเลขสมมติ"
          />
        </div>
      )}

      <Card title="เป้าหมายมาร์จิ้นตามหมวด vs จริง">
        {categories.length === 0 ? (
          <EmptyState title="ยังไม่มี Margin Policy" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categories.map((c) => (
              <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                <span>{c.category}</span>
                <span>
                  เป้า {c.targetPct}% ·{' '}
                  {c.actualMarginPct == null ? (
                    <span style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล</span>
                  ) : (
                    <StatusPill tone={c.actualMarginPct >= c.targetPct ? 'success' : 'danger'}>
                      จริง {c.actualMarginPct.toFixed(1)}%
                    </StatusPill>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title="Sales Pipeline">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          {Object.entries(PIPELINE_LABEL).map(([key, label]) => (
            <div key={key} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 700 }}>{pipeline[key] ?? 0}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ height: 20 }} />

      <Card title="Data / Operations Health">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div>สินค้ารอจับคู่: <StatusPill tone={health.unresolvedMappings > 0 ? 'warning' : 'success'}>{health.unresolvedMappings}</StatusPill></div>
          <div>ข้อยกเว้นการกระทบยอด: <StatusPill tone={health.reconciliationExceptions > 0 ? 'danger' : 'success'}>{health.reconciliationExceptions}</StatusPill></div>
          <div>ระบบเชื่อมต่อขัดข้อง: <StatusPill tone={health.failingIntegrations > 0 ? 'danger' : 'success'}>{health.failingIntegrations}</StatusPill></div>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      <Card title={`Attention Queue (${attention.length})`}>
        {attention.length === 0 ? (
          <EmptyState title="ไม่มีรายการที่ต้องตัดสินใจตอนนี้" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {attention.map((item) => (
              <div key={item.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>{item.issue}</b>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusPill tone={item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warning' : 'neutral'}>
                      {item.severity}
                    </StatusPill>
                    <ResolveButton decisionId={item.id} />
                  </div>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>{item.businessImpact}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  แหล่งข้อมูล: {item.source} · {item.sourceTimestamp.toLocaleString('th-TH')} · เจ้าของ: {item.owner?.name ?? 'ยังไม่ระบุ'}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
