import Link from 'next/link';
import { requireUser } from '@/lib/auth/currentUser';
import {
  getExecutiveFinancials,
  getCategoryTargetVsActual,
  getSalesPipelineCounts,
  getClosedDealsAwaitingInvoice,
  getDataHealth,
  getAttentionQueue,
  getCashAndAr,
  getProspectHealth,
  getDeliveryHealth,
  getCustomerIssuesSummary,
  getActualYtdPerformance,
} from '@/lib/queries/executive';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertCard } from '@/components/ui/AlertCard';
import { ColumnChart } from '@/components/ui/charts/ColumnChart';
import { BarRows } from '@/components/ui/charts/BarRows';
import { ResolveButton } from './ResolveButton';
import styles from './exec.module.css';

function money(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}
function mm(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return Math.round(n / 1000) + 'K';
  return money(n);
}

const PIPELINE_LABEL: Record<string, string> = {
  DRAFT: 'ฉบับร่าง', SENT: 'ส่งแล้ว', CUSTOMER_RESPONDED: 'ลูกค้าตอบกลับ',
  NEGOTIATING: 'เจรจา', ACCEPTED: 'ยอมรับแล้ว', CLOSED: 'ปิดดีล', EXPIRED: 'หมดอายุ',
};

export default async function ExecutiveDashboardPage() {
  const user = await requireUser();
  const [
    financials, categories, pipeline, awaitingInvoice, health, attention,
    cashAr, prospects, delivery, issues, actual,
  ] = await Promise.all([
    getExecutiveFinancials(),
    getCategoryTargetVsActual(),
    getSalesPipelineCounts(),
    getClosedDealsAwaitingInvoice(),
    getDataHealth(),
    getAttentionQueue(),
    getCashAndAr(),
    getProspectHealth(),
    getDeliveryHealth(),
    getCustomerIssuesSummary(),
    getActualYtdPerformance(),
  ]);

  const hasRevenueData = financials.postedLineCount > 0;
  const collectPct = cashAr.totalInvoiced > 0 ? Math.round((cashAr.totalCollected / cashAr.totalInvoiced) * 100) : 0;

  // Attention rows — computed live from real data, same shape V29 fixes at 5 rows.
  const attentionRows = [
    cashAr.overdue > 0 && {
      icon: '💸', title: `Overdue AR ฿${mm(cashAr.overdue)}`, href: '/cost-market' as const, tone: 'danger' as const,
    },
    prospects.atRisk.length > 0 && {
      icon: '🧲', title: `Prospect ${prospects.atRisk.length} รายไม่มี Follow-up >14 วัน`, href: '/customers' as const, tone: 'warning' as const,
    },
    delivery.delayed.length > 0 && {
      icon: '🚚', title: `Delivery delay ${delivery.delayed.length} รอบ`, href: '/exec' as const, tone: 'warning' as const,
    },
    categories.some((c) => c.actualMarginPct != null && c.actualMarginPct < c.targetPct) && {
      icon: '📉', title: 'Category Margin Guard หลุดเป้าบางหมวด', href: '/margin-guard' as const, tone: 'danger' as const,
    },
    issues.open > 0 && {
      icon: '⚠️', title: `ปัญหาจากลูกค้าเปิดอยู่ ${issues.open} เรื่อง`, href: '/sales' as const, tone: 'warning' as const,
    },
  ].filter(Boolean) as { icon: string; title: string; href: string; tone: 'danger' | 'warning' }[];

  return (
    <>
      <PageHeader
        title="ภาพรวมธุรกิจ (Executive)"
        subtitle="Actual Invoice · Cash · Margin · Prospect · Delivery/Service · Pricing ในหน้าตัดสินใจเดียว"
        who={[user.name[0] ?? 'E', user.name, user.role]}
      />

      <Card>
        <div className={styles.roleBanner}>
          <p className={styles.roleBannerText}>
            Executive role · Review → Decide → Assign → Track — เห็น Revenue, KG, GP, Margin, Cash/AR, Sales/Quote, Cost/Market
            และ Exception แต่ไม่ต้องกรอกทุน ตั้งราคา หรือบันทึกบัญชีเอง
          </p>
          <div className={styles.roleBannerPills}>
            <StatusPill tone="primary">Financial source: Sales Closed Deal → Financial Store → Executive</StatusPill>
            <StatusPill tone="neutral">Accounting = data layer · no login</StatusPill>
          </div>
        </div>
      </Card>

      <div style={{ height: 20 }} />

      {/* Priority 01 — Decide now */}
      <Card title="Priority 01 · สิ่งที่ต้องตัดสินใจหรือส่งต่อวันนี้">
        {attentionRows.length === 0 ? (
          <EmptyState title="ไม่มีรายการที่ต้องตัดสินใจตอนนี้" />
        ) : (
          <div className={styles.attentionGrid}>
            {attentionRows.map((row, i) => (
              <Link key={i} href={row.href} className={styles.attentionRow}>
                <span className={styles.attentionIcon}>{row.icon}</span>
                <span className={styles.attentionTitle}>{row.title}</span>
                <StatusPill tone={row.tone}>เปิดดู →</StatusPill>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 20 }} />

      {/* Priority 02 — Business health */}
      <p className={styles.priorityLabel}>Priority 02 · เงินวันนี้ → กำไร/อนาคต → คุณภาพการส่งมอบ</p>
      <div className={styles.kpiGrid}>
        <KpiCard
          icon="💰"
          label="Actual Invoiced MTD"
          value={hasRevenueData ? `฿${mm(financials.revenue)}` : '—'}
          pill={hasRevenueData ? `${financials.coveragePct.toFixed(0)}% มีต้นทุนยืนยัน` : 'ยังไม่มีข้อมูล'}
          pillTone={hasRevenueData ? 'success' : 'neutral'}
          caption="จาก Invoice จริงที่ POSTED เท่านั้น"
          lead
        />
        <KpiCard
          icon="🏦"
          label="เงินเข้าแล้ว"
          value={`฿${mm(cashAr.totalCollected)}`}
          pill={`${collectPct}% collected`}
          pillTone={collectPct >= 90 ? 'success' : 'danger'}
          caption={`จากยอดเรียกเก็บ ฿${mm(cashAr.totalInvoiced)}`}
        />
        <KpiCard
          icon="📄"
          label="เงินค้างรับ"
          value={`฿${mm(cashAr.outstanding)}`}
          pill={`฿${mm(cashAr.overdue)} overdue`}
          pillTone={cashAr.overdue > 0 ? 'danger' : 'success'}
          caption={`${cashAr.invoiceCount} ใบแจ้งหนี้`}
        />
      </div>

      <div style={{ height: 13 }} />

      <div className={styles.kpiGrid}>
        <KpiCard
          icon="📊"
          label="Gross Margin MTD"
          value={hasRevenueData && financials.totalGp && financials.revenue ? `${((financials.totalGp / financials.revenue) * 100).toFixed(1)}%` : '—'}
          caption={`Gross Profit ฿${mm(financials.totalGp)} · Direction 12–15%`}
          pillTone="neutral"
        />
        <KpiCard
          icon="🧲"
          label="Prospect Health"
          value={`${prospects.active} ราย`}
          pill={`${prospects.atRisk.length} at risk`}
          pillTone={prospects.atRisk.length > 0 ? 'danger' : 'success'}
          caption={`Pipeline ฿${mm(prospects.pipeline)}`}
          href="/customers"
        />
        <KpiCard
          icon="🚚"
          label="Delivery Score"
          value={delivery.score != null ? `${delivery.score}/100` : 'ยังไม่มีข้อมูล'}
          pill={`${delivery.delayed.length} delayed`}
          pillTone={delivery.delayed.length > 0 ? 'warning' : 'success'}
          caption={`${delivery.total} รอบส่งล่าสุด`}
        />
      </div>

      <div style={{ height: 20 }} />

      {/* Priority 03 — Actual performance */}
      <Card
        title="Priority 03 · Actual Performance"
        action={<span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>YTD 2026 · ไม่ใช้ Quote เป็น Revenue</span>}
      >
        {actual.lineCount === 0 ? (
          <AlertCard
            tone="neutral"
            title="No production data yet — Revenue/GP"
            description="ยังไม่มีใบแจ้งหนี้สถานะ POSTED ในปีนี้ ตัวเลขจะคำนวณจากข้อมูลจริงเมื่อมีการนำเข้า"
          />
        ) : (
          <>
            <div className={styles.actualKpis}>
              <div>
                <span>YTD Invoiced</span>
                <b>฿{mm(actual.ytdRevenue)}</b>
              </div>
              <div>
                <span>YTD Gross Profit</span>
                <b>฿{mm(actual.ytdGp)}</b>
              </div>
              <div>
                <span>YTD Gross Margin</span>
                <b>{actual.ytdMarginPct != null ? `${actual.ytdMarginPct.toFixed(1)}%` : '—'}</b>
                <em>Direction 12–15%</em>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <ColumnChart columns={actual.months.map((m) => ({ label: m.label, value: m.value, displayValue: mm(m.value) }))} />
            </div>
            <div className={styles.topSkuList}>
              <p className={styles.miniTitle}>Top SKU by YTD invoiced revenue</p>
              {actual.topSku.map((s, i) => (
                <div key={i} className={styles.topSkuRow}>
                  <span>{s.name}</span>
                  <b>฿{mm(s.revenue)}</b>
                  <em>{money(s.qty)} kg · GP ฿{mm(s.gp)}</em>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <div style={{ height: 20 }} />

      {/* Priority 04 — Growth & customer */}
      <p className={styles.priorityLabel}>Priority 04 · Growth & Customer</p>
      <div className={styles.row2}>
        <Card title="Prospect Pipeline">
          {prospects.active === 0 ? (
            <EmptyState title="ยังไม่มี Prospect ในระบบ" />
          ) : (
            <>
              <div className={styles.prospectStats}>
                <div><span>Active</span><b>{prospects.active}</b></div>
                <div><span>Pipeline</span><b>฿{mm(prospects.pipeline)}</b></div>
                <div><span>Won</span><b>{prospects.won}</b></div>
                <div><span>Lost</span><b>{prospects.lost}</b></div>
              </div>
              <div className={styles.prospectList}>
                {prospects.atRisk.slice(0, 5).map((p) => (
                  <div key={p.id} className={styles.prospectRow}>
                    <span>{p.name}</span>
                    <StatusPill tone="danger">{p.daysSinceContact} วันก่อน</StatusPill>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title="ปัญหาจากลูกค้า" action={<span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>เซลบันทึก · อ่านอย่างเดียว</span>}>
          {issues.total === 0 ? (
            <EmptyState title="ยังไม่มีการบันทึกปัญหาจากลูกค้า" />
          ) : (
            <>
              <div className={styles.prospectStats}>
                <div><span>ทั้งหมด</span><b>{issues.total}</b></div>
                <div><span>เปิดอยู่</span><b style={{ color: 'var(--danger)' }}>{issues.open}</b></div>
                <div><span>ลูกค้าเกิดซ้ำ</span><b style={{ color: 'var(--warning)' }}>{issues.repeatCustomers}</b></div>
              </div>
              {issues.byType.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <BarRows rows={issues.byType.map((t) => ({ label: t.type, value: t.count, displayValue: String(t.count) }))} color="var(--primary)" />
                </div>
              )}
            </>
          )}
          <Link href="/sales" className={styles.linkCta}>เปิดหน้าฝ่ายขาย →</Link>
        </Card>
      </div>

      <div style={{ height: 20 }} />

      {/* Priority 05 — Operations */}
      <p className={styles.priorityLabel}>Priority 05 · Operations</p>
      <Card title="Delivery Performance">
        {delivery.carriers.length === 0 ? (
          <EmptyState title="ยังไม่มีข้อมูลการจัดส่ง" />
        ) : (
          <div className={styles.carrierGrid}>
            {delivery.carriers.map((c) => (
              <div key={c.id} className={`${styles.carrierCard} ${c.score < 80 ? styles.carrierBad : c.score < 90 ? styles.carrierWarn : styles.carrierOk}`}>
                <div className={styles.carrierTop}>
                  <span>{c.name}</span>
                  <b>{c.score}</b>
                </div>
                <div className={styles.carrierMeta}>
                  <span>{c.jobs} รอบขนส่ง</span>
                  <span>{c.onTimePct}% on-time</span>
                  <span>{c.delayed} delay</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 20 }} />

      {/* Priority 06 — Pricing intelligence (condensed; full detail lives on dedicated pages) */}
      <p className={styles.priorityLabel}>Priority 06 · Pricing Intelligence</p>
      <Card title="เป้าหมายมาร์จิ้นตามหมวด vs จริง">
        {categories.length === 0 ? (
          <EmptyState title="ยังไม่มี Margin Policy" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categories.map((c) => (
              <div key={c.category} className={styles.categoryRow}>
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

      <div className={styles.row2}>
        <Card title="Sales Pipeline">
          <div className={styles.pipelineGrid}>
            {Object.entries(PIPELINE_LABEL).map(([key, label]) => (
              <div key={key} className={styles.pipelineCell}>
                <p className={styles.pipelineValue}>{pipeline[key] ?? 0}</p>
                <p className={styles.pipelineLabel}>{label}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            ดีลที่ปิดแล้ว รอใบแจ้งหนี้: <b>{awaitingInvoice}</b>
          </p>
        </Card>

        <Card title="Data / Operations Health">
          <div className={styles.healthGrid}>
            <div>สินค้ารอจับคู่: <StatusPill tone={health.unresolvedMappings > 0 ? 'warning' : 'success'}>{health.unresolvedMappings}</StatusPill></div>
            <div>ข้อยกเว้นการกระทบยอด: <StatusPill tone={health.reconciliationExceptions > 0 ? 'danger' : 'success'}>{health.reconciliationExceptions}</StatusPill></div>
            <div>ระบบเชื่อมต่อขัดข้อง: <StatusPill tone={health.failingIntegrations > 0 ? 'danger' : 'success'}>{health.failingIntegrations}</StatusPill></div>
            <div>Market data: <StatusPill tone={health.marketConnected ? 'success' : 'neutral'}>{health.marketConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}</StatusPill></div>
          </div>
        </Card>
      </div>

      <div style={{ height: 20 }} />

      <Card title={`Attention Queue — การตัดสินใจของผู้บริหาร (${attention.length})`}>
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
