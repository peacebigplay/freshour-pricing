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
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResolveButton } from './ResolveButton';
import '@/components/ui/issue-dashboard.css';
import './exec-v29.css';

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
  const belowTargetCategories = categories.filter((c) => c.actualMarginPct != null && c.actualMarginPct < c.targetPct);

  const attentionRows = [
    cashAr.overdue > 0 && {
      icon: '💸', title: `Overdue AR ฿${mm(cashAr.overdue)}`, sub: `เงินถึงกำหนดแล้วแต่ยังไม่เข้า`, href: '/cost-market', lv: 'red',
    },
    prospects.atRisk.length > 0 && {
      icon: '🧲', title: `Prospect ${prospects.atRisk.length} รายไม่มี Follow-up >14 วัน`, sub: `Pipeline เสี่ยงหลุดประมาณ ฿${mm(prospects.atRisk.reduce((s, p) => s + p.potentialValue, 0))}`, href: '/customers', lv: 'red',
    },
    delivery.delayed.length > 0 && {
      icon: '🚚', title: `Delivery issue ${delivery.delayed.length} รอบ`, sub: 'มี service log ที่ยังต้องปิด', href: '/exec', lv: 'amber',
    },
    belowTargetCategories.length > 0 && {
      icon: '📉', title: `Category Margin Guard หลุด ${belowTargetCategories.length} กลุ่ม`, sub: 'Direction รวม 12–15%', href: '/margin-guard', lv: 'amber',
    },
    issues.open > 0 && {
      icon: '⚠️', title: `ปัญหาจากลูกค้าเปิดอยู่ ${issues.open} เรื่อง`, sub: 'เซลบันทึก · ผู้บริหารอ่านอย่างเดียว', href: '/sales', lv: 'amber',
    },
  ].filter(Boolean) as { icon: string; title: string; sub: string; href: string; lv: 'red' | 'amber' }[];

  return (
    <div className="exec-v8 exec-v12 exec-v13">
      <div className="top">
        <div>
          <h1>ภาพรวมธุรกิจ (Executive)</h1>
          <p>Actual Invoice · Cash · Margin · Prospect · Delivery/Service · Pricing ในหน้าตัดสินใจเดียว</p>
        </div>
        <div className="who">
          <span className="av">{user.name[0] ?? 'E'}</span>
          <span>
            <b>{user.name}</b>
            <span>{user.role}</span>
          </span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 0, background: 'var(--blue-l)', borderColor: 'var(--blue-b)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <b style={{ display: 'block', color: 'var(--ink)', fontSize: 13 }}>Executive role · Review → Decide → Assign → Track</b>
            <span style={{ display: 'block', marginTop: 3, fontSize: 11.5, color: 'var(--tx-2)' }}>
              ผู้บริหารเห็น Revenue, KG, GP, Margin, Cash/AR, Sales/Quote, Cost/Market และ Exception แต่ไม่ต้องกรอกทุน ตั้งราคา หรือบันทึกบัญชีเอง
            </span>
          </div>
          <span className="pill2 b">Financial source: Sales Closed Deal → Financial Store → Executive</span>
          <span className="pill2 g">Accounting = data layer · no login</span>
        </div>
      </div>

      <div className="ex-decision-first">
        <div className="ex-hierarchy">
          <span>Priority 01 · Decide now</span>
          <b>สิ่งที่ต้องตัดสินใจหรือส่งต่อเจ้าของงานวันนี้</b>
        </div>
        {attentionRows.length === 0 ? (
          <EmptyState title="ไม่มีรายการที่ต้องตัดสินใจตอนนี้" />
        ) : (
          <div className="ex-att-list">
            {attentionRows.map((row, i) => (
              <Link key={i} href={row.href} className={`ex-att ${row.lv} clickable`}>
                <span className="ex-att-ic">{row.icon}</span>
                <span className="ex-att-b">
                  <b>{row.title}</b>
                  <span>{row.sub}</span>
                </span>
                <span className="ex-att-go">เปิดดู →</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="ex-section">
        <div className="ex-hierarchy">
          <span>Priority 02 · Business health</span>
          <b>เงินวันนี้ → กำไร/อนาคต → คุณภาพการส่งมอบ</b>
        </div>
        <div className="ex-kpi-row-label">เงินวันนี้ · Sales → Invoice → Cash</div>
        <div className="ex-kpis">
          <div className={`ex-kpi money tone-${hasRevenueData ? 'blue' : 'amber'}`}>
            <div className="ex-kpi-top">
              <span className="ex-kpi-ic">🧾</span>
              <span className={`ex-kpi-badge ${hasRevenueData ? '' : 'amber'}`}>{hasRevenueData ? `${financials.coveragePct.toFixed(0)}% มีต้นทุนยืนยัน` : 'ยังไม่มีข้อมูล'}</span>
            </div>
            <span className="ex-kpi-label">Actual Invoiced MTD</span>
            <b>{hasRevenueData ? `฿${mm(financials.revenue)}` : '—'}</b>
            <span className="ex-kpi-sub">จาก Invoice จริงที่ POSTED เท่านั้น</span>
          </div>
          <div className={`ex-kpi money tone-${collectPct >= 90 ? 'green' : 'red'}`}>
            <div className="ex-kpi-top">
              <span className="ex-kpi-ic">🏦</span>
              <span className={`ex-kpi-badge ${collectPct >= 90 ? '' : 'red'}`}>{collectPct}% collected</span>
            </div>
            <span className="ex-kpi-label">เงินเข้าแล้ว</span>
            <b>฿{mm(cashAr.totalCollected)}</b>
            <span className="ex-kpi-sub">จากยอดเรียกเก็บ ฿{mm(cashAr.totalInvoiced)}</span>
          </div>
          <div className="ex-kpi money tone-red">
            <div className="ex-kpi-top">
              <span className="ex-kpi-ic">📄</span>
              <span className="ex-kpi-badge red">฿{mm(cashAr.overdue)} overdue</span>
            </div>
            <span className="ex-kpi-label">เงินค้างรับ</span>
            <b>฿{mm(cashAr.outstanding)}</b>
            <span className="ex-kpi-sub">{cashAr.invoiceCount} ใบแจ้งหนี้</span>
          </div>
        </div>

        <div className="ex-kpi-row-label">กำไร · โอกาสเติบโต · การส่งมอบ</div>
        <div className="ex-kpis">
          <div className="ex-kpi">
            <div className="ex-kpi-top">
              <span className="ex-kpi-ic">📊</span>
            </div>
            <span className="ex-kpi-label">Gross Margin MTD</span>
            <b>{hasRevenueData && financials.totalGp && financials.revenue ? `${((financials.totalGp / financials.revenue) * 100).toFixed(1)}%` : '—'}</b>
            <span className="ex-kpi-sub">Gross Profit ฿{mm(financials.totalGp)} · Direction 12–15%</span>
          </div>
          <Link href="/customers" className={`ex-kpi tone-${prospects.atRisk.length > 0 ? 'red' : 'green'}`}>
            <div className="ex-kpi-top">
              <span className="ex-kpi-ic">🧲</span>
              <span className={`ex-kpi-badge ${prospects.atRisk.length > 0 ? 'red' : ''}`}>{prospects.atRisk.length} at risk</span>
            </div>
            <span className="ex-kpi-label">Prospect Health</span>
            <b>{prospects.active} ราย</b>
            <span className="ex-kpi-sub">Pipeline ฿{mm(prospects.pipeline)}</span>
            <span className="ex-kpi-open">ดูรายละเอียด →</span>
          </Link>
          <div className={`ex-kpi tone-${delivery.delayed.length > 0 ? 'amber' : 'green'}`}>
            <div className="ex-kpi-top">
              <span className="ex-kpi-ic">🚚</span>
              <span className={`ex-kpi-badge ${delivery.delayed.length > 0 ? 'amber' : ''}`}>{delivery.delayed.length} delayed</span>
            </div>
            <span className="ex-kpi-label">Delivery Score</span>
            <b>{delivery.score != null ? `${delivery.score}/100` : '—'}</b>
            <span className="ex-kpi-sub">{delivery.total} รอบส่งล่าสุด</span>
          </div>
        </div>
      </div>

      <div className="ex-section">
        <div className="ex-hierarchy">
          <span>Priority 03 · Actual performance</span>
          <b>ยอดส่งของ/Invoice จริง + YTD ราย SKU · ไม่ใช้ Quote เป็น Revenue</b>
        </div>
        <div className="card ex-actual-panel">
          <div className="ex-card-head">
            <div>
              <h3>
                Actual Invoiced Sales <span className="sub">YTD 2026</span>
              </h3>
              <p className="hint">Executive ใช้ยอดส่งของ/Invoice จริง ไม่ใช้ยอด Quote เป็น Revenue</p>
            </div>
            <span className="pill2 b">Sales Closed Deal → Financial Store</span>
          </div>

          {actual.lineCount === 0 ? (
            <EmptyState title="ยังไม่มีใบแจ้งหนี้สถานะ POSTED ในปีนี้" description="ตัวเลขจะคำนวณจากข้อมูลจริงเมื่อมีการนำเข้า" />
          ) : (
            <>
              <div className="ex-actual-kpis">
                <div>
                  <span>YTD Invoiced</span>
                  <b>฿{mm(actual.ytdRevenue)}</b>
                </div>
                <div>
                  <span>YTD Gross Profit</span>
                  <b>฿{mm(actual.ytdGp)}</b>
                </div>
                <div className="good">
                  <span>YTD Gross Margin</span>
                  <b>{actual.ytdMarginPct != null ? `${actual.ytdMarginPct.toFixed(1)}%` : '—'}</b>
                  <em>Direction 12–15%</em>
                </div>
                <div>
                  <span>Data source</span>
                  <b className="sm">POSTED Invoice</b>
                </div>
              </div>

              <div className="ex-ytd-bars">
                {actual.months.map((m, i) => {
                  const max = Math.max(...actual.months.map((x) => x.value), 1);
                  return (
                    <div key={i}>
                      <i style={{ height: Math.max(14, Math.round((m.value / max) * 92)) }} />
                      <b>{mm(m.value)}</b>
                      <span>{m.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="ex-ytd-top">
                <div className="ex-mini-title">Top SKU by YTD invoiced revenue</div>
                {actual.topSku.map((s, i) => (
                  <div key={i}>
                    <span>{s.name}</span>
                    <b>฿{mm(s.revenue)}</b>
                    <em>
                      {money(s.qty)} kg · GP ฿{mm(s.gp)}
                    </em>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ex-section">
        <div className="ex-hierarchy">
          <span>Priority 04 · Growth & customer</span>
          <b>Pipeline ใหม่ ลูกค้าที่เสี่ยงหาย และ margin จากฐานลูกค้า</b>
        </div>
        <div className="ex-business-grid">
          <div className="card">
            <h3>
              Prospect Pipeline <span className="sub">ปัจจุบัน</span>
            </h3>
            <p className="hint">ดูทั้งจำนวน prospect และ prospect ที่กำลังเงียบหาย</p>
            {prospects.active === 0 ? (
              <EmptyState title="ยังไม่มี Prospect ในระบบ" />
            ) : (
              <>
                <div className="ex-prospect-head">
                  <div>
                    <b>{prospects.active}</b>
                    <span>Active prospects</span>
                  </div>
                  <div>
                    <b>฿{mm(prospects.pipeline)}</b>
                    <span>Pipeline value</span>
                  </div>
                </div>
                <div className="ex-mini-grid">
                  <div>
                    <b>{prospects.won}</b>
                    <span>Won</span>
                  </div>
                  <div>
                    <b>{prospects.lost}</b>
                    <span>Lost</span>
                  </div>
                  <div className="danger">
                    <b>{prospects.atRisk.length}</b>
                    <span>No activity &gt;14d</span>
                  </div>
                </div>
              </>
            )}
            <Link href="/customers" className="btn">
              ดู Prospect ที่เสี่ยงหาย →
            </Link>
          </div>

          <div className="card">
            <h3>
              Margin & Profit <span className="sub">หมวดสินค้า</span>
            </h3>
            <p className="hint">ดูทั้ง % และจำนวนเงินจริง พร้อมจุดที่กำไรกำลังรั่ว</p>
            <div className="ex-margin-main">
              <div>
                <span>Gross Profit</span>
                <b>฿{mm(financials.totalGp)}</b>
              </div>
              <div>
                <span>Gross Margin</span>
                <b>{hasRevenueData && financials.revenue ? `${((financials.totalGp / financials.revenue) * 100).toFixed(1)}%` : '—'}</b>
                <em>Direction 12–15%</em>
              </div>
            </div>
            <div className="ex-risk-box">
              <span>Category หลุดเป้า</span>
              <b>{belowTargetCategories.length} กลุ่ม</b>
              <Link href="/margin-guard">ดูสาเหตุ →</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="ex-section">
        <div className="ex-hierarchy">
          <span>Priority 05 · Operations</span>
          <b>ขนส่งเจ้าไหนทำงานดี และ Service Log ที่ยังต้องปิด</b>
        </div>
        <div className="ex-ops-grid">
          <div className="card">
            <h3>
              Delivery Performance <span className="sub">เช็คขนส่งแต่ละเจ้า</span>
            </h3>
            <p className="hint">ดู score ราย carrier + รอบที่ผิด SLA</p>
            {delivery.carriers.length === 0 ? (
              <EmptyState title="ยังไม่มีข้อมูลการจัดส่ง" />
            ) : (
              <>
                <div className="ex-delivery-summary">
                  <div>
                    <span>Overall score</span>
                    <b>{delivery.score}/100</b>
                  </div>
                  <div>
                    <span>On-time</span>
                    <b>{delivery.total > 0 ? Math.round((delivery.onTimeCount / delivery.total) * 100) : 0}%</b>
                  </div>
                  <div>
                    <span>Delayed orders</span>
                    <b>{delivery.delayed.length}</b>
                  </div>
                </div>
                <div className="ex-carrier-grid">
                  {delivery.carriers.map((c) => (
                    <div key={c.id} className={`ex-carrier-card ${c.score < 80 ? 'bad' : c.score < 90 ? 'warn' : 'ok'}`}>
                      <div className="ex-carrier-top">
                        <span>{c.name}</span>
                        <b>{c.score}</b>
                      </div>
                      <div className="ex-carrier-meta">
                        <span>{c.jobs} รอบขนส่ง</span>
                        <span>{c.onTimePct}% on-time</span>
                        <span>{c.delayed} delay</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card ex-service-log">
            <div className="ex-card-head">
              <div>
                <h3>
                  ปัญหาจากลูกค้า <span className="sub">เซลบันทึก · ผู้บริหารอ่านอย่างเดียว</span>
                </h3>
                <p className="hint">ผู้บริหารไม่ต้องบันทึกเอง · เซลบันทึกที่หน้าฝ่ายขาย</p>
              </div>
              <Link href="/sales" className="lnk2">
                เปิดหน้าฝ่ายขาย →
              </Link>
            </div>
            {issues.total === 0 ? (
              <EmptyState title="ยังไม่มีการบันทึกปัญหาจากลูกค้า" />
            ) : (
              <>
                <div className="issk">
                  <div>
                    <span>ปัญหาทั้งหมด</span>
                    <b>{issues.total}</b>
                  </div>
                  <div>
                    <span>ยังเปิดอยู่</span>
                    <b style={{ color: '#DC2626' }}>{issues.open}</b>
                  </div>
                  <div>
                    <span>ลูกค้าที่เกิดซ้ำ</span>
                    <b style={{ color: '#D97706' }}>{issues.repeatCustomers}</b>
                  </div>
                </div>
                {issues.byType.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {issues.byType.map((t, i) => {
                      const max = Math.max(...issues.byType.map((x) => x.count), 1);
                      return (
                        <div className="isb" key={i}>
                          <span>{t.type}</span>
                          <i>
                            <u style={{ width: `${(t.count / max) * 100}%`, background: '#2563EB' }} />
                          </i>
                          <b>{t.count}</b>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="ex-section">
        <div className="ex-hierarchy">
          <span>Priority 06 · Pricing intelligence</span>
          <b>Margin Guard ตามหมวด และสถานะใบราคา ใช้เป็นข้อมูลประกอบการตัดสินใจ</b>
        </div>
        <div className="card">
          <h3>
            Margin Guard by Category <span className="sub">Source เดียวทั้งระบบ</span>
          </h3>
          <p className="hint">Pricing / Customer / Sales negotiation อ่าน Target ชุดเดียวกัน</p>
          {categories.length === 0 ? (
            <EmptyState title="ยังไม่มี Margin Policy" />
          ) : (
            <div className="ex-cat-list">
              {categories.map((c) => {
                const state = c.actualMarginPct == null ? 'warn' : c.actualMarginPct >= c.targetPct ? 'good' : 'bad';
                return (
                  <div key={c.category} className={state}>
                    <span>
                      <b>{c.category}</b>
                    </span>
                    <span>
                      <small>Target</small>
                      <b>{c.targetPct}%</b>
                    </span>
                    <span>
                      <small>Actual</small>
                      <b>{c.actualMarginPct == null ? '—' : `${c.actualMarginPct.toFixed(1)}%`}</b>
                    </span>
                    <span className="state">{state === 'good' ? 'อยู่ในเกณฑ์' : state === 'bad' ? 'ต่ำกว่าเป้า' : 'ยังไม่มีข้อมูล'}</span>
                  </div>
                );
              })}
            </div>
          )}
          <Link href="/margin-guard" className="lnk2">
            ตั้งค่า Target รายหมวด →
          </Link>
        </div>

        <div style={{ height: 14 }} />

        <div className="card">
          <h3>Pricing actions</h3>
          <div className="ex-price-grid">
            <Link href="/pricing">
              <span>ไปโต๊ะตั้งราคา</span>
              <b>Pricing</b>
              <em>Home / ราคากลาง / รายเจ้า</em>
            </Link>
            <Link href="/margin-guard">
              <span>Margin Guard</span>
              <b>12–15%</b>
              <em>Target แยกตามหมวดสินค้า</em>
            </Link>
            <Link href="/cost-market">
              <span>ไปหน้าต้นทุน & ตลาด</span>
              <b>Cost & Market</b>
              <em>รู้ราคาตลาดที่ใช้ได้วันนี้</em>
            </Link>
            <Link href="/pricing/requests">
              <span>คำขอปรับราคา</span>
              <b>Requests</b>
              <em>เจรจาราคาสัญญา →</em>
            </Link>
          </div>
        </div>
      </div>

      <div className="ex-section">
        <div className="ex-business-grid">
          <div className="card">
            <h3>Sales Pipeline</h3>
            <div className="ex-mini-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              {Object.entries(PIPELINE_LABEL).map(([key, label]) => (
                <div key={key}>
                  <b>{pipeline[key] ?? 0}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              ดีลที่ปิดแล้ว รอใบแจ้งหนี้: <b>{awaitingInvoice}</b>
            </p>
          </div>

          <div className="card">
            <h3>Data / Operations Health</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <div>
                สินค้ารอจับคู่: <StatusPill tone={health.unresolvedMappings > 0 ? 'warning' : 'success'}>{health.unresolvedMappings}</StatusPill>
              </div>
              <div>
                ข้อยกเว้นการกระทบยอด: <StatusPill tone={health.reconciliationExceptions > 0 ? 'danger' : 'success'}>{health.reconciliationExceptions}</StatusPill>
              </div>
              <div>
                ระบบเชื่อมต่อขัดข้อง: <StatusPill tone={health.failingIntegrations > 0 ? 'danger' : 'success'}>{health.failingIntegrations}</StatusPill>
              </div>
              <div>
                Market data: <StatusPill tone={health.marketConnected ? 'success' : 'neutral'}>{health.marketConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}</StatusPill>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ex-section">
        <div className="card">
          <h3>
            Attention Queue — การตัดสินใจของผู้บริหาร <span className="sub">{attention.length} รายการ</span>
          </h3>
          {attention.length === 0 ? (
            <EmptyState title="ไม่มีรายการที่ต้องตัดสินใจตอนนี้" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {attention.map((item) => (
                <div key={item.id} style={{ borderBottom: '1px solid var(--line-2)', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b>{item.issue}</b>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusPill tone={item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warning' : 'neutral'}>
                        {item.severity}
                      </StatusPill>
                      <ResolveButton decisionId={item.id} />
                    </div>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--tx-3)', marginTop: 4 }}>{item.businessImpact}</p>
                  <p style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>
                    แหล่งข้อมูล: {item.source} · {item.sourceTimestamp.toLocaleString('th-TH')} · เจ้าของ: {item.owner?.name ?? 'ยังไม่ระบุ'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
