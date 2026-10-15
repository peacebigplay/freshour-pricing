#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   apply-master — ทำให้ "ใบราคา AL" เป็นความจริงเดียวของสินค้า
   node tools/apply-master.js data/master/al-2026-10-01.json
   · สินค้าทุกตัว = แถวในใบราคา (192 + แช่แข็ง 3) — ตัวที่ไม่อยู่ในใบ เอาออกจากทุกตาราง (กระดาน · ใบรายเจ้า · สัญญา · ใบเซลล์ · หมวด)
   · คง id เดิมเมื่อชื่อตรงกับสินค้าเดิม (ประวัติ/สัญญาตามมาด้วย) · ตัวใหม่ได้ id ใหม่
   · ราคาจากสูตรเดียวกับไฟล์: ปลีก = ⌈ทุน×1.6⌉ · ส่ง 2kg = ทุน + ส่วนเผื่อรายตัว · 5kg = 2kg−3 · 10kg = 2kg−4 (ค่าที่ไฟล์ตั้งเองถูกเก็บเป็น override)
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..'), FX = path.join(ROOT, 'data', 'fixtures');
const { createStore } = require(path.join(ROOT, 'src', 'store'));
const masterPath = process.argv[2] || path.join(ROOT, 'data', 'master', 'al-2026-10-01.json');
const M = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const idx = JSON.parse(fs.readFileSync(path.join(FX, 'index.json'), 'utf8'));
const D = {}; for (const k of Object.keys(idx)) D[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(FX, idx[k]))).toString('utf8'));
const S = D.state, CFG = S.config, HAGGLE = CFG.haggle_baht, FLOOR = CFG.floor_pct, TARGET = CFG.target_pct, MARKUP = 1.6, K5 = -3, K10 = -4;
const AS_OF = 'ใบราคา AL 01-07/10/69', COST_AT = M.as_of || '2026-09-30';
const r1 = n => Math.round(n * 10) / 10, mg = (p, c) => p > 0 && c != null ? r1((p - c) / p * 100) : null, ceilP = c => Math.ceil(c / (1 - FLOOR / 100));
const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return 'p' + h.toString(16).slice(0, 6).padStart(6, '0'); };

/* ── 1) จับคู่สินค้าเดิม ↔ ใบราคา (ตัวจับคู่เดียวกับที่ใช้รับไฟล์ทุน) ── */
const tmp = createStore(JSON.parse(JSON.stringify(D)), {});
const oldById = {}; D.pricelist.rows.forEach(r => { oldById[r.id] = r; });
const oldProd = {}; S.products.forEach(p => { oldProd[p.id] = p; });
const claimed = {}, map = [];   // master row → { id, old }
M.rows.forEach(row => {
  const m = tmp.ext.matchProduct(row.name, row.grp);
  let id = null, old = null;
  if (m && m.score >= 0.8 && !claimed[m.p.id]) { id = m.p.id; old = m.p; claimed[id] = row.name; }
  if (!id) { id = fnv(row.name + '|' + row.idx); if (oldById[id]) id = fnv(row.name + '|' + row.idx + '|x'); }
  map.push({ row, id, old, how: m && id === m.p.id ? m.how : 'new' });
});
const NEW = {}; map.forEach(x => { NEW[x.id] = x; });
const oldToNew = {}; map.forEach(x => { if (x.old) oldToNew[x.old.id] = x.id; });
const kept = map.filter(x => x.old).length, removed = D.pricelist.rows.filter(r => !oldToNew[r.id]).length;

/* ── 2) สูตรราคา ── */
function tiers(c, add, ov) {
  ov = ov || {};
  const retail = ov.retail != null ? ov.retail : (c > 0 ? Math.ceil(c * MARKUP - 1e-9) : 0);
  const w2 = ov.w2 != null ? ov.w2 : (c > 0 && add != null ? c + add : 0);
  return { retail, w2, s5: ov.s5 != null ? ov.s5 : (w2 ? w2 + K5 : 0), s10: ov.s10 != null ? ov.s10 : (w2 ? w2 + K10 : 0) };
}
const vol = {}; (D.board.lines || []).forEach(l => { vol[l.id] = l.vol || 0; });
const prevW2 = {}; (S.dispatched.items || []).forEach(i => { prevW2[i.product_id] = i.w2; });

/* หมวดเป้า margin (category-guard) — เพิ่มกลุ่มใหม่จากใบราคาเข้าไปในหมวดที่เหมาะ */
const CG = D['category-guard'];
const CATMAP = { 'เนื้อแดง / เศษ': 'competitive', 'สะโพก': 'competitive', 'หมูบด': 'competitive', 'สันนอก / สันใน': 'competitive', 'ไหล่': 'competitive',
  'สามชั้น': 'popular', 'สันคอ': 'popular', 'คอหมูย่าง': 'popular', 'ซี่โครง': 'popular',
  'เครื่องใน': 'offal', 'หัว / หนัง / หาง': 'offal', 'กระดูก': 'other', 'ขา': 'other', 'มัน': 'other', 'แพ็คสำเร็จ': 'other', 'แช่แข็ง (B2B)': 'other', 'อื่นๆ': 'other' };
CG.groups.forEach(g => { g.grps = Object.keys(CATMAP).filter(k => CATMAP[k] === g.key); g.examples = g.grps.slice(0, 4).join(' · '); });
const catOf = grp => CG.groups.find(g => g.key === (CATMAP[grp] || 'other')) || CG.groups[CG.groups.length - 1];

/* ── 3) สินค้าใหม่ทั้งชุด ── */
const products = map.map(({ row, id, old }) => {
  const c = row.cost || 0, ov = {};
  if (row.retail_override) ov.retail = row.retail;
  if (row.tier_override) { ov.s5 = row.s5; ov.s10 = row.s10; }
  let add = row.add_baht;
  if (row.frozen && add == null) { const sis = M.rows.find(r => !r.frozen && r.name.startsWith(row.name.replace(/แช่แข็ง.*$/, '').trim().split(' ')[0]) && r.add_baht != null); add = sis ? sis.add_baht : 20; }
  if (row.frozen && row.w2 == null) ov.w2 = c + add;
  const t = tiers(c, add, ov);
  return { id, name: row.name, spec: row.spec || '', grp: row.grp, unit: row.unit, pdf_idx: row.idx, frozen: !!row.frozen, cost: c, prev_cost: row.cost_prev || c, add_baht: add, markup: 0, vol_week: old ? (vol[old.id] || oldProd[old.id] && oldProd[old.id].vol_week || 0) : 0,
    watch: 0, override: 0, active: 1, sort: row.idx, cost_src: AS_OF, cost_src_at: COST_AT, central_price: null, central_goal: null, central_at: null, central_by: null, central_exception: null, central_cost_at: null,
    retail_override: ov.retail != null ? ov.retail : null, s5_override: ov.s5 != null ? ov.s5 : null, s10_override: ov.s10 != null ? ov.s10 : null, needs_price: !!(row.frozen && row.w2 == null), t, prevW2: old ? (prevW2[old.id] || oldById[old.id].w2 || 0) : 0 };
});
S.products = products.map(p => { const o = Object.assign({}, p); delete o.t; delete o.prevW2; return o; });
Object.assign(CFG, { as_of: AS_OF, cost_updated: COST_AT, markup: MARKUP, k5: K5, k10: K10, dirty: 1 });

/* ── 4) pricelist · board · book · brain.evidence · market ── */
const comps = D.pricelist.comps;
const marks = () => comps.map(c => ({ id: c.id, label: c.label, tier: c.tier, price: 0, state: 'none' }));
D.pricelist.rows = products.map(p => ({ id: p.id, name: p.name, grp: p.grp, retail: p.t.retail, w2: p.t.w2, s5: p.t.s5, s10: p.t.s10, saleFloor: p.t.w2 ? p.t.w2 - HAGGLE : 0, marks: marks(), pos: 'none', gap: null, cost: p.cost, margin: mg(p.t.w2, p.cost), costSrc: AS_OF, costSrcAt: COST_AT, unit: p.unit, frozen: p.frozen, pdf_idx: p.pdf_idx, needs_price: p.needs_price }));
const grpCount = {}; products.forEach(p => { grpCount[p.grp] = (grpCount[p.grp] || 0) + 1; });
D.pricelist.grps = Object.keys(grpCount).map(g => ({ grp: g, n: grpCount[g] })).sort((a, b) => b.n - a.n);
Object.assign(D.pricelist, { asOf: AS_OF, costUpdated: COST_AT, dirty: true });
D.board.lines = products.map(p => ({ id: p.id, name: p.name, grp: p.grp, w2: p.t.w2, cost: p.cost, margin: mg(p.t.w2, p.cost), cheapest: 0, prev: p.prevW2, jump: p.prevW2 ? p.t.w2 - p.prevW2 : 0, status: p.cost ? 'none' : 'nocost', vol: p.vol_week, okMarket: null, okMargin: p.cost ? mg(p.t.w2, p.cost) >= FLOOR : false, okMove: false }));
D.board.label = AS_OF; D.board.counts = { n: products.length, known: 0, usable: 0, everKnown: 0, okMarket: 0, okMargin: D.board.lines.filter(l => l.okMargin).length, okMove: 0 };
D.board.moved = { same: D.board.lines.filter(l => l.prev && l.jump === 0).length, up: D.board.lines.filter(l => l.jump > 0).length, down: D.board.lines.filter(l => l.jump < 0).length, fresh: D.board.lines.filter(l => !l.prev).length };
S.book = products.map(p => ({ product_id: p.id, name: p.name, spec: p.spec, grp: p.grp, cost: p.cost, retail: p.t.retail, formula: p.t.w2, auto: p.t.w2, central: null, w2: p.t.w2, s5: p.t.s5, s10: p.t.s10, margin: mg(p.t.w2, p.cost), status: p.cost ? 'none' : 'nocost', floorPrice: p.cost ? ceilP(p.cost) : 0, saleFloor: p.t.w2 - HAGGLE, haggle: HAGGLE, underwater: false, cheapest: 0, dearest: 0, retail_gap: 0, oldest_comp: null, expired: 0, marketAge: null, vol_week: p.vol_week, profit_week: Math.round((p.t.w2 - p.cost) * p.vol_week), competitors: [], prev: p.prevW2, jump: p.prevW2 ? p.t.w2 - p.prevW2 : 0, jumpPct: p.prevW2 ? r1((p.t.w2 - p.prevW2) / p.prevW2 * 100) : 0 }));
S.dispatched.items = (S.dispatched.items || []).filter(i => oldToNew[i.product_id]).map(i => Object.assign({}, i, { product_id: oldToNew[i.product_id], name: NEW[oldToNew[i.product_id]].row.name }));
const costed = products.filter(p => p.cost > 0);
const totals = { count: products.length, profit_week: costed.reduce((a, p) => a + (p.t.w2 - p.cost) * p.vol_week, 0), margin_avg: costed.length ? costed.reduce((a, p) => a + mg(p.t.w2, p.cost), 0) / costed.length : 0, cost_avg: costed.length ? costed.reduce((a, p) => a + p.cost, 0) / costed.length : 0, risk: 0, typo: 0, upside: 0, manual: 0, central: 0, centralStale: 0, centralLow: 0, retail_over: 0, underwater: 0, expired: 0 };
S.totals = Object.assign(S.totals || {}, totals); D.preflight.totals = Object.assign(D.preflight.totals, totals); D.board.costAvg = Math.round(totals.cost_avg);
D.preflight.jumped = D.board.lines.filter(l => l.prev && Math.abs(l.jump) >= (CFG.jump_baht || 8)).map(l => ({ product_id: l.id, name: l.name, prev: l.prev, now: l.w2, jump: l.jump, pct: r1(l.jump / l.prev * 100) })).sort((a, b) => Math.abs(b.jump) - Math.abs(a.jump));
D.preflight.actions = (D.preflight.actions || []).filter(a => !a.product_id || oldToNew[a.product_id]).map(a => a.product_id ? Object.assign({}, a, { product_id: oldToNew[a.product_id] }) : a);
D.preflight.moved = D.board.moved;
const B = D.brain; B.evidence.blind = costed.map(p => ({ id: p.id, name: p.name, spec: p.spec, grp: p.grp, cost: p.cost, w2: p.t.w2, formula: p.t.w2, vol: p.vol_week, revenue: Math.round(p.t.w2 * p.vol_week) }));
B.evidence.stale = []; B.evidence.loss = []; B.now.sku = products.length; B.now.blind = costed.length; B.now.rated = 0; B.money.blindRevenue = B.evidence.blind.reduce((a, b) => a + b.revenue, 0); B.now.profit_week = totals.profit_week; B.now.margin_avg = totals.margin_avg; B.now.cost_avg = totals.cost_avg; B.control.cost_updated = COST_AT; B.control.markup = MARKUP;
B.blockers = B.blockers.filter(b => !/ไม่รู้ทุน|ขยับแรง/.test(b)); B.warnings = B.warnings.filter(w => !/ราคาตลาด 24|ตัวชูโรง/.test(w));
const MK = D.market; MK.totals = { n: products.length, known: 0, everKnown: 0, usable: 0, blind: products.length, volAll: products.reduce((a, p) => a + p.vol_week, 0), volBlind: products.reduce((a, p) => a + p.vol_week, 0), volStale: 0, pctVolBlind: 100, pctVolUnusable: 100, expiredRows: 0 };
MK.competitors.forEach(c => { c.have = 0; c.fresh = 0; c.expired = 0; });
const mkItem = p => ({ id: p.id, name: p.name, spec: p.spec, vol: p.vol_week, cost: p.cost, w2: p.t.w2, cheapest: 0, cells: Object.fromEntries(comps.map(c => [c.id, { state: 'none' }])), blind: true, staleOnly: false, grp: p.grp });
MK.groups = Object.keys(grpCount).map(g => { const ps = products.filter(p => p.grp === g); return { name: g, n: ps.length, known: 0, blindVol: Math.round(ps.reduce((a, p) => a + p.vol_week, 0)), items: ps.map(mkItem) }; });
MK.gaps = products.slice().sort((a, b) => b.vol_week - a.vol_week).slice(0, 12).map(mkItem);

/* ── 5) สัญญาลูกค้า · guard · ใบเซลล์ · ใบรายเจ้า ── */
S.contract_lines = S.contract_lines.filter(l => oldToNew[l.product_id]).map(l => { const p = NEW[oldToNew[l.product_id]]; return Object.assign({}, l, { product_id: p.id, cost: p.row.cost || 0 }); });
const G = D.guard, prodById = {}; products.forEach(p => { prodById[p.id] = p; });
G.lines = G.lines.filter(l => oldToNew[l.pid]).map(l => { const p = prodById[oldToNew[l.pid]]; const m = mg(l.locked, p.cost); return Object.assign({}, l, { pid: p.id, name: p.name, grp: p.grp, cost: p.cost, margin: m, state: m < 0 ? 'loss' : m < FLOOR ? 'thin' : 'ok', grade: m < 0 ? 'F' : m < FLOOR ? 'D' : m < TARGET ? 'B' : 'A', belowTarget: m < TARGET }); });
G.suggest = (G.suggest || []).filter(s => oldToNew[s.toId]).map(s => Object.assign({}, s, { toId: oldToNew[s.toId] }));
const byC = {}; G.lines.forEach(l => { (byC[l.cid] = byC[l.cid] || []).push(l); });
G.customers.forEach(c => { const ls = byC[c.id] || []; c.n = ls.length; c.low = ls.filter(l => l.margin < FLOOR).length; c.loss = ls.filter(l => l.margin < 0).length; c.mgSum = r1(ls.reduce((a, l) => a + l.margin, 0)); c.verified = ls.filter(l => l.verified).length; c.margin = ls.length ? r1(c.mgSum / ls.length) : null; c.allVerified = c.verified === ls.length; c.grade = ls.length ? (c.margin < 0 ? 'F' : c.margin < FLOOR ? 'D' : c.margin < TARGET ? 'B' : 'A') : '—'; c.belowTarget = ls.filter(l => l.belowTarget).length; });
G.totals = { customers: G.customers.length, lines: G.lines.length, low: G.lines.filter(l => l.margin < FLOOR).length, loss: G.lines.filter(l => l.margin < 0).length, belowTarget: G.lines.filter(l => l.belowTarget).length };
G.dist = ['A', 'B', 'C', 'D', 'F'].map(g => ({ grade: g, n: G.customers.filter(c => c.grade === g).length })); G.asOf = AS_OF;
S.guard = G.lines.map(l => ({ customer_id: l.cid, customer: l.cust, product_id: l.pid, product: l.name, locked: l.locked, cost: l.cost, boardCost: l.cost, margin: l.margin, verified: !!l.verified, risk: l.margin < FLOOR, loss: l.margin < 0 }));
D.review.anomaly = []; D.review.movers = D.preflight.jumped.slice(0, 15).map(j => { const p = prodById[j.product_id]; return { id: p.id, name: p.name, c0: p.prev_cost, cost: p.cost, jump: p.cost - p.prev_cost, prev: j.prev, now: j.now, margin: mg(j.now, p.cost), vol: p.vol_week }; });
D.review.heavy = costed.slice().sort((a, b) => b.vol_week - a.vol_week).slice(0, 10).map(p => ({ id: p.id, name: p.name, vol: p.vol_week, cost: p.cost, price: p.t.w2, margin: mg(p.t.w2, p.cost) }));
D.review.thin = G.customers.filter(c => c.n).map(c => ({ id: c.id, name: c.name, all: c.n, low: c.low, pct: Math.round(c.low / c.n * 100) })).sort((a, b) => b.pct - a.pct).slice(0, 10);
D.review.totals = Object.assign(D.review.totals, { sku: products.length, lineAll: G.lines.length, lineLow: G.totals.low, lowPct: G.lines.length ? Math.round(G.totals.low / G.lines.length * 100) : 0, profit: Math.round(totals.profit_week), volAll: Math.round(MK.totals.volAll), volKnown: products.filter(p => p.vol_week > 0).length });
D.review.asOf = AS_OF; D.review.coverage = { usable: 0, expired: 0, blind: products.length };
const profitBy = {}; costed.forEach(p => { profitBy[p.grp] = (profitBy[p.grp] || 0) + (p.t.w2 - p.cost) * p.vol_week; }); const pbTot = Object.values(profitBy).reduce((a, b) => a + b, 0) || 1;
D.review.profitBy = Object.keys(profitBy).map(g => ({ grp: g, baht: Math.round(profitBy[g]), pct: Math.round(profitBy[g] / pbTot * 100) })).sort((a, b) => b.baht - a.baht).slice(0, 10);
/* ใบเซลล์ */
for (const k of Object.keys(D)) {
  if (!k.startsWith('sheet:')) continue; const sh = D[k];
  sh.rows = sh.rows.filter(r => oldToNew[r.pid]).map(r => { const p = prodById[oldToNew[r.pid]]; return Object.assign({}, r, { pid: p.id, name: p.name, grp: p.grp }); });
  sh.total = sh.rows.length; sh.offerTotal = sh.rows.filter(r => r.inOffer).length; sh.quoted = sh.rows.filter(r => r.quoted != null).length;
  const sc = D.sends.customers.find(c => c.id === sh.customer.id); if (sc) { sc.lines = sh.total; sc.offerLines = sh.offerTotal; sc.quoted = sh.quoted; }
}
D.sends.negotiations = D.sends.negotiations.filter(n => oldToNew[n.product_id]).map(n => Object.assign({}, n, { product_id: oldToNew[n.product_id] }));
D['price-requests'].rows = D['price-requests'].rows.filter(r => oldToNew[r.product_id]).map(r => Object.assign({}, r, { product_id: oldToNew[r.product_id] })); D['price-requests'].open = D['price-requests'].rows.filter(r => r.status === 'open').length;
/* ใบรายเจ้า (desk) */
const goalsOf = (p, prev, eff) => { const c = p.cost; if (!(c > 0)) return null; const guard = Math.ceil(c / (1 - eff / 100)); const hold = prev || p.t.w2;
  return { competitive: { disabled: true, reason: 'ไม่มีข้อมูลตลาด', why: 'ไม่มีข้อมูลตลาด' }, hold: { price: hold, rawResult: hold, margin: mg(hold, c), why: prev ? 'ยืนราคารอบก่อน ' + prev + ' ฿' : 'ยืนราคาตามใบ ' + hold + ' ฿', belowFloor: hold < guard, floorPrice: guard, basis: 'prev_low', prev: prev || 0 },
    target: { price: guard, rawResult: guard, margin: mg(guard, c), why: 'ทุน ÷ (1 − ' + eff + '%) = ' + guard + ' ฿', equalProtect: true }, protect: { price: guard, rawResult: guard, margin: mg(guard, c), why: 'ทุน ÷ (1 − ' + eff + '%) = ' + guard + ' ฿' } }; };
function deskRow(p) {
  const cat = catOf(p.grp), eff = cat.effective, c = p.cost, guard = c ? Math.ceil(c / (1 - eff / 100)) : 0;
  return { id: p.id, name: p.name, spec: p.spec, grp: p.grp, vol: p.vol_week, cust: null, hist: null, cost: c, boardCost: c, costPrev: p.prev_cost, costJump: c - (p.prev_cost || c), costBasis: 'central', w2: p.t.w2, retail: p.t.retail, s5: p.t.s5, s10: p.t.s10, prev: p.prevW2, jump: p.prevW2 ? p.t.w2 - p.prevW2 : 0, margin: mg(p.t.w2, c), floorPrice: c ? ceilP(c) : 0, saleFloor: p.t.w2 - HAGGLE,
    status: !c ? 'nocost' : mg(p.t.w2, c) < FLOOR ? 'floored' : 'none', auto: p.t.w2, override: 0, marks: marks(), cheapest: null, usingStale: false, safeLow: c ? ceilP(c) : 0, safeHigh: 0, unit: p.unit, frozen: p.frozen,
    v21: { category: { key: cat.key, name: cat.name, floor: eff, target: eff }, market: { median: 0, low: 0, high: 0, n: 0, rows: [], method: 'MEDIAN' }, central: null, auto: p.t.w2, guard, target: guard, effectivePct: eff, targetPct: eff, goals: goalsOf(p, p.prevW2, eff), roundInc: 1, costUpdated: COST_AT, policyVersion: 'V30-AL', tiers: { retail: p.t.retail, w2: p.t.w2, s5: p.t.s5, s10: p.t.s10, add: p.add_baht } } };
}
const baseRows = products.map(deskRow);
const deskKeys = Object.keys(D).filter(k => k === 'desk' || k.startsWith('desk:'));
const linesByCust = {}; G.lines.forEach(l => { (linesByCust[l.cid] = linesByCust[l.cid] || {})[l.pid] = l; });
deskKeys.forEach(k => {
  const d = D[k]; d.asOf = AS_OF; d.costUpdated = COST_AT; d.centralCount = { approved: 0, stale: 0, need: costed.length }; d.totals = Object.assign(d.totals, totals);
  if (!d.customer) { d.rows = JSON.parse(JSON.stringify(baseRows)); return; }
  const cid = d.customer.id, ls = linesByCust[cid] || {}, adj = d.customer.adjust || 0;
  d.rows = JSON.parse(JSON.stringify(baseRows)).map(r => { const l = ls[r.id];
    r.cust = l ? { price: l.locked, cost: r.cost, source: 'สัญญา', locked: true } : { price: r.w2 + adj, cost: r.cost, source: adj ? 'ปรับรายเจ้า' : 'กลาง', adjust: adj };
    r.margin = mg(r.cust.price, r.cost); r.hist = { list: [], last: 0, lastMargin: null, prevMargin: null, keepPrice: 0, suggest: r.w2, squeezed: false, opts: { market: null, keep: null, mid: null } };
    if (l) { r.v21.baseApproved = false; r.v21.prevCustomer = l.locked; r.v21.saved = null; r.v21.baseChanged = false; r.v21.costChanged = false; if (r.v21.goals) { r.v21.goals.hold = { price: l.locked, rawResult: l.locked, margin: mg(l.locked, r.cost), why: 'ยืนราคาที่เจ้านี้ได้รอบก่อน ' + l.locked + ' ฿', belowFloor: l.locked < r.v21.guard, floorPrice: r.v21.guard, basis: 'prev_low', prev: l.locked }; } }
    return r; });
  d.customer.contractItems = Object.keys(ls).length;
});
D.desk.customers.forEach(c => { const n = Object.keys(linesByCust[c.id] || {}).length; c.contractItems = n; c.lines = n; c.work = n; c.gateMissing = n; c.gateStale = 0; c.priced = 0; c.handed = false; const gl = G.customers.find(x => x.id === c.id); c.margin = gl ? gl.margin : null; c.low = gl ? gl.low : 0; });
deskKeys.forEach(k => { if (k !== 'desk') D[k].customers = JSON.parse(JSON.stringify(D.desk.customers)); });
/* หมวด (category-items) */
CG.groups.forEach(g => {
  const ps = products.filter(p => (CATMAP[p.grp] || 'other') === g.key && p.cost > 0);
  const key = 'category-items:' + g.key, ci = D[key] || (D[key] = { key: g.key, floorPct: FLOOR, catFloor: g.effective, name: g.name, items: [], categories: [] });
  ci.items = ps.map(p => ({ id: p.id, name: p.name, grp: p.grp, cost: p.cost, price: p.t.w2, vol: p.vol_week, margin: mg(p.t.w2, p.cost), target: g.effective, catTarget: g.effective, effective: g.effective, guard: Math.ceil(p.cost / (1 - g.effective / 100)), itemTarget: false, floor: g.effective, moved: false, priceBasis: 'ราคาร่าง' }));
  ci.categories = CG.groups.map(x => ({ key: x.key, name: x.name, target: x.effective })); ci.name = g.name; ci.catFloor = g.effective;
  g.n = ps.length; g.known = ps.filter(p => p.vol_week > 0).length; const rev = ps.reduce((a, p) => a + p.t.w2 * Math.max(p.vol_week, 0.0001), 0), gp = ps.reduce((a, p) => a + (p.t.w2 - p.cost) * Math.max(p.vol_week, 0.0001), 0);
  g.margin = rev ? r1(gp / rev * 100) : null; g.gpWeek = Math.round(ps.reduce((a, p) => a + (p.t.w2 - p.cost) * p.vol_week, 0)); g.state = g.margin == null ? 'unknown' : g.margin < g.lo ? 'bad' : g.margin < g.lo + 1 ? 'warn' : 'good';
});
CG.portfolio.n = costed.length; CG.portfolio.gpWeek = Math.round(totals.profit_week); CG.portfolio.margin = r1(totals.margin_avg); CG.uncovered = { n: 0, names: [] }; CG.below = CG.groups.filter(g => g.state === 'bad').length; CG.asOf = COST_AT;
/* ประวัติรอบ: ใบนี้คือราคาที่มีผล 01-07/10 */
if (!D.history.some(h => h.label === '01-07/10')) { D.history.unshift({ id: (D.history[0] ? D.history[0].id : 100) + 1, label: '01-07/10', dispatched_at: COST_AT, by_role: 'ใบราคา AL', cost_avg: r1(totals.cost_avg), margin_avg: r1(totals.margin_avg), profit_week: Math.round(totals.profit_week), risk_count: 0 }); }
D.pricelist.dispatched = { label: '01-07/10', at: COST_AT }; S.dispatched.label = '01-07/10'; S.dispatched.at = COST_AT; B.now.dispatched = { label: '01-07/10', at: COST_AT, by: 'ใบราคา AL' };
D.review.round = '01-07/10'; D.review.roundAt = COST_AT; D.sends.label = '01-07/10'; deskKeys.forEach(k => { D[k].round = '01-07/10'; D[k].prevRound = '26-2/09'; });
Object.keys(D).filter(k => k.startsWith('sheet:')).forEach(k => { D[k].label = '01-07/10'; D[k].prevLabel = '26-2/09'; });

/* ── 6) เขียนกลับ ── */
const newIdx = {};
for (const k of Object.keys(D)) { const fn = k.replace(/[^A-Za-z0-9_.-]+/g, '_') + '.json.gz'; fs.writeFileSync(path.join(FX, fn), zlib.gzipSync(Buffer.from(JSON.stringify(D[k]), 'utf8'), { level: 9 })); newIdx[k] = fn; }
for (const k of Object.keys(idx)) if (!newIdx[k]) fs.unlinkSync(path.join(FX, idx[k]));
fs.writeFileSync(path.join(FX, 'index.json'), JSON.stringify(newIdx, null, 0));
const report = { source: M.source, products: products.length, kept_ids: kept, new_ids: products.length - kept, removed_old: removed, contract_lines: S.contract_lines.length, guard_lines: G.lines.length, customers_with_lines: G.customers.filter(c => c.n).length, no_cost: products.filter(p => !(p.cost > 0)).length, overrides: products.filter(p => p.retail_override != null || p.s5_override != null).map(p => p.name), needs_price: products.filter(p => p.needs_price).map(p => p.name), groups: grpCount };
fs.writeFileSync(path.join(ROOT, 'data', 'master', 'apply-report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
console.log('mapping sample:', map.slice(0, 8).map(x => x.row.name + ' → ' + (x.old ? x.old.name + ' (' + x.how + ')' : 'ใหม่')).join('\n  '));
