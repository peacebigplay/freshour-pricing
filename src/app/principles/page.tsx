import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export default async function PrinciplesPage() {
  const policy = await prisma.marginPolicyVersion.findFirst({
    where: { effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
    include: { categoryRules: true, skuOverrides: { include: { product: true } } },
  });

  if (!policy) {
    return (
      <>
        <PageHeader title="หลักการที่ระบบใช้ตัดสิน" />
        <EmptyState title="ยังไม่มี Margin Policy ที่ใช้งานอยู่" />
      </>
    );
  }

  const rules = [
    {
      text: `มาร์จิ้นขั้นต่ำทั่วทั้งบริษัท (Global Floor) = ${policy.globalFloorPct}%`,
      because: 'ทุกสินค้าต้องมีมาร์จิ้นไม่ต่ำกว่านี้ ไม่ว่าจะเป็นสินค้าหมวดใดหรือเงื่อนไขลูกค้าแบบใด',
      enforced: 'effectiveTargetPct() — src/lib/domain/margin.ts',
      level: 'hard' as const,
    },
    ...policy.categoryRules.map((r) => ({
      text: `หมวด ${r.category} — เป้ามาร์จิ้น ${r.targetPct}%`,
      because: null,
      enforced: 'MarginCategoryRule → effectiveTargetPct()',
      level: 'hard' as const,
    })),
    {
      text: 'effective_target_pct = max(global_floor_pct, resolved_category_target_pct)',
      because: 'SKU override (ถ้ามี) แทนเป้าหมวดก่อนเทียบกับมาร์จิ้นขั้นต่ำ',
      enforced: 'effectiveTargetPct()',
      level: 'hard' as const,
    },
    {
      text: 'margin_guard_price = ceil(current_cost / (1 - effective_target_pct / 100))',
      because: 'ราคาต่ำสุดที่ป้องกันมาร์จิ้นไม่ให้หลุดเป้า',
      enforced: 'marginGuardPrice()',
      level: 'hard' as const,
    },
    ...policy.skuOverrides.map((o) => ({
      text: `${o.product.canonicalName} — เป้าเฉพาะ SKU ${o.targetPct}%`,
      because: o.reason,
      enforced: 'SkuCategoryOverride → effectiveTargetPct()',
      level: 'hard' as const,
    })),
  ];

  const LV: Record<string, [string, string]> = {
    hard: ['var(--green)', 'โค้ดบังคับ'],
    warn: ['var(--amber)', 'เตือนอย่างเดียว'],
    none: ['var(--tx-3)', 'ยังไม่บังคับ'],
  };
  const hardCount = rules.filter((r) => r.level === 'hard').length;

  return (
    <>
      <PageHeader title="หลักการที่ระบบใช้ตัดสิน" subtitle={`${rules.length} ข้อ · Margin Policy v${policy.version} · แยกว่ากฎไหนโค้ดบังคับอยู่จริง`} />

      <div className="kpi">
        <div className="k lead">
          <div className="kt">
            <span className="ic">⚖️</span>
            <span className="pill">ใช้อยู่</span>
          </div>
          <div className="lb">Global Floor</div>
          <div className="v">{policy.globalFloorPct}%</div>
          <div className="c">มาร์จิ้นขั้นต่ำทุก SKU</div>
        </div>
        <div className="k">
          <div className="kt">
            <span className="ic">📜</span>
          </div>
          <div className="lb">กฎทั้งหมด</div>
          <div className="v">{rules.length}</div>
          <div className="c">ข้อ</div>
        </div>
        <div className="k">
          <div className="kt">
            <span className="ic">✅</span>
          </div>
          <div className="lb">โค้ดบังคับจริง</div>
          <div className="v" style={{ color: 'var(--green)' }}>
            {hardCount}
          </div>
          <div className="c">จาก {rules.length} ข้อ</div>
        </div>
        <div className="k">
          <div className="kt">
            <span className="ic">🧩</span>
          </div>
          <div className="lb">SKU Override</div>
          <div className="v">{policy.skuOverrides.length}</div>
          <div className="c">ข้อยกเว้นเฉพาะ SKU</div>
        </div>
      </div>

      <p className="hint" style={{ marginTop: 9 }}>
        แก้ค่าเหล่านี้ได้ที่ <a className="lnk2" href="/margin-guard">ตั้งค่า Margin Guard</a> — แก้ที่เดียว ทุกหน้าคิดใหม่ทันที
      </p>

      <div className="tw2" style={{ marginTop: 14 }}>
        {rules.map((r, i) => {
          const v = LV[r.level] ?? LV.none!;
          return (
            <div className="pr" key={i}>
              <div className="prl" style={{ background: v[0] }} />
              <div className="prb">
                <div className="prt">{r.text}</div>
                {r.because && <div className="prw">เพราะ {r.because}</div>}
                <div className="prc">
                  <span>บังคับที่ไหน</span>
                  {r.enforced}
                </div>
                <div className="prm">
                  <span className="pill2 g">{v[1]}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
