/* ══════════════════════════════════════════════════════════════════
   Freshour · prototype backend (ไม่พึ่ง Node API — ใช้ได้ทั้งใน server.js และไฟล์เดโมในเบราว์เซอร์)

   ข้อมูลตั้งต้น = ก้อน JSON ที่จับมาจากระบบจริง (data/fixtures) · ทุกปุ่มที่ "บันทึก" แก้ก้อนเหล่านี้ในหน่วยความจำ
   แล้วหน้าเว็บอ่านกลับได้ทันที — ตัวจริงคือ Cloudflare Worker + D1; ตัวนี้เลียนแบบสัญญา (shape) ของทุก endpoint
   ที่หน้าเว็บเรียก ให้ทดสอบ flow ได้ครบ: ทุน → ราคากลาง → ใบรายเจ้า → ส่ง Sales → ลูกค้าตอบ → invoice → รับเงิน
   ══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ext'));
  else root.FHStore = factory(root.FHExt);
})(typeof self !== 'undefined' ? self : this, function (extend) {
  'use strict';

  var LVL = { anon: 0, sale: 1, ops: 2, boss: 3, admin: 3, system: 4 };
  var ROLE_NAME = { boss: 'พี่หมิง', ops: 'พี่จุ๋ม', sale: 'ทีมเซลล์', admin: 'ผู้ดูแลระบบ', system: 'ระบบ', customer: 'ลูกค้า' };
  var GOAL_NAMES = { competitive: 'แข่งขันได้', hold: 'ยืนราคาเดิม', target: 'กำไรตามเป้า', protect: 'ป้องกันกำไร' };

  /* ── เวลาไทย ─────────────────────────────────────────────────── */
  function bkk(now) { return new Date((now || Date.now()) + 7 * 3600e3); }
  function today(now) { return bkk(now).toISOString().slice(0, 10); }
  function stamp(now) { return bkk(now).toISOString().slice(0, 19); }
  function weekStart(d) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.toISOString().slice(0, 10); }

  function r1(n) { return Math.round(n * 10) / 10; }
  function mg(price, cost) { return price > 0 && cost != null ? r1((price - cost) / price * 100) : null; }
  function floorPrice(cost, pct) { return Math.ceil(cost / (1 - pct / 100)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hashId(prefix, s) {
    var h = 2166136261; s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return prefix + h.toString(16).slice(0, prefix === 'c' ? 4 : 6).padStart(prefix === 'c' ? 4 : 6, '0');
  }
  function err(status, msg, extra) { var b = Object.assign({ error: msg }, extra || {}); return { status: status, body: b }; }
  function ok(body) { return { status: 200, body: body || { ok: true } }; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ── key ของก้อนข้อมูล: (บทบาท, url ที่จับมา) → ชื่อก้อน ── */
  function keyOf(role, url) {
    var p = url.replace(/^\/api\//, ''), i = p.indexOf('?'), path = i < 0 ? p : p.slice(0, i), qs = i < 0 ? '' : p.slice(i + 1);
    if (path === 'me') return 'me:' + role;
    if (!qs) return path;
    var q = {}; qs.split('&').forEach(function (kv) { var j = kv.indexOf('='); q[decodeURIComponent(kv.slice(0, j))] = decodeURIComponent(kv.slice(j + 1)); });
    if (path === 'desk') return 'desk:' + q.customer;
    if (path === 'sheet') return 'sheet:' + q.customer;
    if (path === 'category-items') return 'category-items:' + q.key;
    return null;
  }

  /* ════════════════════════════════════════════════════════════════ */
  function createStore(docs, opts) {
    opts = opts || {};
    var D = docs;                                   /* ก้อนข้อมูลทั้งหมด (แก้ในที่) */
    var PINS = opts.pins || null;                   /* {role: pin} · ไม่ตั้ง = เครื่องนี้ไม่ต้องใส่รหัส */
    var needPin = !!PINS;
    var seq = { log: 100, dlv: 100, prs: 100, req: 100, inv: 0, talk: 1000 };
    var tokens = {};                                /* quote-link token → customer_id */

    var S = D.state, CFG = S.config;

    function get(k) { return D[k]; }
    function desks() { return Object.keys(D).filter(function (k) { return k === 'desk' || k.indexOf('desk:') === 0; }).map(function (k) { return D[k]; }); }
    function sheets() { return Object.keys(D).filter(function (k) { return k.indexOf('sheet:') === 0; }).map(function (k) { return D[k]; }); }
    function catItemDocs() { return Object.keys(D).filter(function (k) { return k.indexOf('category-items:') === 0; }).map(function (k) { return D[k]; }); }
    function product(pid) { return (D.pricelist.rows || []).filter(function (r) { return r.id === pid; })[0] || null; }
    function custOf(cid) { return (D.guard.customers || []).filter(function (c) { return c.id === cid; })[0] || (S.customers || []).filter(function (c) { return c.id === cid; })[0] || null; }
    function custByName(nm) { nm = String(nm || '').trim(); return (D.guard.customers || []).filter(function (c) { return c.name === nm; })[0] || null; }
    function floorPct() { return CFG.floor_pct; }
    function targetPct() { return CFG.target_pct; }
    function gradeOf(m, pol) { pol = pol || { min: floorPct(), target: targetPct() }; return m == null ? '—' : m < 0 ? 'F' : m < pol.min ? 'D' : m < pol.target ? 'B' : 'A'; }
    function lineState(m, pol) { pol = pol || { min: floorPct(), target: targetPct() }; return m < 0 ? 'loss' : m < pol.min ? 'thin' : 'ok'; }

    /* ── ใบของลูกค้า: ถ้าไม่มีในชุดที่จับมา สร้างจากฐาน ── */
    function deskFor(cid) {
      if (D['desk:' + cid]) return D['desk:' + cid];
      var c = (D.desk.customers || []).filter(function (x) { return x.id === cid; })[0];
      if (!c) return null;
      var d = clone(D.desk);
      d.customer = { id: c.id, name: c.name, type: c.type, adjust: c.adjust || 0, contractItems: c.contractItems || 0 };
      var lines = {};
      (D.guard.lines || []).forEach(function (l) { if (l.cid === cid) lines[l.pid] = l; });
      d.rows.forEach(function (r) {
        var l = lines[r.id];
        r.cust = l ? { price: l.locked, cost: r.cost, source: 'สัญญา', locked: true }
                   : { price: r.w2 + (c.adjust || 0), cost: r.cost, source: c.adjust ? 'ปรับรายเจ้า' : 'กลาง', adjust: c.adjust || 0 };
        r.margin = mg(r.cust.price, r.cost);
        r.hist = { list: [], last: 0, lastMargin: null, prevMargin: null, keepPrice: 0, suggest: r.w2, squeezed: false, opts: { market: null, keep: null, mid: null } };
        var v = r.v21 || (r.v21 = {});
        if (l) { v.baseApproved = !!(v.central && v.central.state === 'approved'); v.prevCustomer = l.locked; v.saved = null; v.baseChanged = false; v.costChanged = false; }
      });
      D['desk:' + cid] = d;
      return d;
    }
    function sheetFor(cid) {
      if (D['sheet:' + cid]) return D['sheet:' + cid];
      var c = custOf(cid); if (!c) return null;
      var rows = (D.guard.lines || []).filter(function (l) { return l.cid === cid; }).map(function (l) {
        return { pid: l.pid, name: l.name, grp: l.grp, inOffer: false, offer: null, board: l.locked, floor: l.locked, quoted: null, response: null,
          accepted: null, reconfirm: false, askWant: null, revision: null, prev: l.prev || l.locked, hist: l.prev && l.prev_label ? [{ label: l.prev_label, price: l.prev }] : [], asks: [], negoCount: 0, status: 'none', request: null };
      });
      var sh = { label: D.sends.label, today: today(), haggle: CFG.haggle_baht, prevLabel: D.desk.prevRound, customer: { id: c.id, name: c.name }, link: null, sent: false,
        deal: { total: 0, accepted: 0, declined: 0, open: 0, ready: false }, invoices: [], handedAt: null, handedBy: null, total: rows.length, offerTotal: 0, quoted: 0, waiting: 0, rows: rows };
      D['sheet:' + cid] = sh;
      return sh;
    }

    /* ── สรุปตัวเลขที่หน้าต่างๆ อ่าน หลังแก้ข้อมูล ── */
    function rebuildGuard() {
      var G = D.guard, fp = floorPct(), tp = targetPct(), by = {};
      G.lines.forEach(function (l) {
        var pol = policyOf(l.grp);   /* ขั้นต่ำ/เป้า = นโยบายของกลุ่มสินค้านั้น ไม่ใช่ค่าเดียวทั้งพอร์ต */
        l.margin = mg(l.locked, l.cost); l.state = lineState(l.margin, pol); l.grade = gradeOf(l.margin, pol); l.belowTarget = l.margin < pol.target; l.belowMin = l.margin < pol.min; l.policy = pol;
        (by[l.cid] = by[l.cid] || []).push(l);
      });
      G.customers.forEach(function (c) {
        var ls = by[c.id] || [];
        c.n = ls.length; c.low = ls.filter(function (l) { return l.belowMin; }).length; c.loss = ls.filter(function (l) { return l.margin < 0; }).length;
        c.mgSum = r1(ls.reduce(function (a, l) { return a + l.margin; }, 0)); c.verified = ls.filter(function (l) { return l.verified; }).length;
        c.margin = ls.length ? r1(c.mgSum / ls.length) : null; c.allVerified = c.verified === ls.length; c.grade = ls.length ? gradeOf(c.margin) : '—';
        c.belowTarget = ls.filter(function (l) { return l.belowTarget; }).length;
      });
      G.totals = { customers: G.customers.length, lines: G.lines.length, low: G.lines.filter(function (l) { return l.belowMin; }).length,
        loss: G.lines.filter(function (l) { return l.margin < 0; }).length, belowTarget: G.lines.filter(function (l) { return l.belowTarget; }).length };
      G.dist = ['A', 'B', 'C', 'D', 'F'].map(function (g) { return { grade: g, n: G.customers.filter(function (c) { return c.grade === g; }).length }; });
      G.floorPct = fp; G.targetPct = tp;
      /* เกรดลูกค้าในหน้าตั้งราคาเดินตามกันเสมอ */
      desks().forEach(function (d) { (d.customers || []).forEach(function (c) { var g = by[c.id]; if (g && g.length) c.margin = r1(g.reduce(function (a, l) { return a + l.margin; }, 0) / g.length); }); });
    }
    function rebuildSends() {
      var SD = D.sends;
      SD.sent = SD.customers.filter(function (c) { return c.sentAt; }).length;
      SD.pending = SD.customers.length - SD.sent;
      SD.handed = SD.customers.filter(function (c) { return c.handedAt; }).length;
      SD.waiting = SD.customers.reduce(function (a, c) { return a + (c.waiting || 0); }, 0);
      SD.total = SD.customers.length;
    }
    function sendRow(cid) { return D.sends.customers.filter(function (c) { return c.id === cid; })[0]; }
    /* กองใบของเซลล์คนนี้เท่านั้น — ตัวเลขสรุปนับใหม่จากชุดที่กรองแล้ว */
    function sendsFor(role, rep, q) {
      var sc = repScope(role, rep, q); if (!sc) return D.sends;
      var cs = D.sends.customers.filter(function (c) { return inScope(sc, c.id); });
      return Object.assign({}, D.sends, { customers: cs, total: cs.length, sent: cs.filter(function (c) { return c.sentAt; }).length, handed: cs.filter(function (c) { return c.handedAt; }).length,
        pending: cs.filter(function (c) { return c.handedAt && !c.sentAt; }).length, waiting: cs.reduce(function (a, c) { return a + (c.waiting || 0); }, 0),
        negotiations: (D.sends.negotiations || []).filter(function (n) { return inScope(sc, n.customer_id); }), scope: sc, rep: repOf(sc) });
    }
    function rebuildSheet(sh) {
      var rows = sh.rows;
      sh.total = rows.length; sh.offerTotal = rows.filter(function (r) { return r.inOffer; }).length;
      sh.quoted = rows.filter(function (r) { return r.quoted != null; }).length;
      sh.waiting = rows.filter(function (r) { return r.request && r.request.status === 'open'; }).length;
      var inOffer = rows.filter(function (r) { return r.inOffer; });
      sh.deal = { total: inOffer.length, accepted: inOffer.filter(function (r) { return r.response === 'accept'; }).length,
        declined: inOffer.filter(function (r) { return r.response === 'decline'; }).length, open: sh.waiting, ready: false };
      sh.deal.ready = sh.sent && inOffer.length > 0 && sh.deal.open === 0 && sh.deal.accepted + sh.deal.declined >= inOffer.length && sh.deal.accepted > 0;
      var c = sendRow(sh.customer.id);
      if (c) {
        c.lines = sh.total; c.offerLines = sh.offerTotal; c.quoted = sh.quoted; c.waiting = sh.waiting;
        c.accepted = sh.deal.accepted; c.declined = sh.deal.declined; c.invoiced = (sh.invoices || []).length;
        c.revised = rows.filter(function (r) { return r.request && r.request.status === 'ok' && r.response !== 'accept'; }).length;
        c.handedAt = sh.handedAt; c.linked = !!sh.link;
      }
      rebuildSends();
    }
    function rebuildDesk(d) {
      var cid = d.customer && d.customer.id, c = cid && (D.desk.customers || []).filter(function (x) { return x.id === cid; })[0];
      if (!c) return;
      var rows = d.rows.filter(function (r) { return r.cust && r.cust.source === 'สัญญา'; });
      var v = function (r) { return r.v21 || {}; };
      c.lines = rows.length; c.contractItems = rows.length;
      c.gateMissing = rows.filter(function (r) { return v(r).baseApproved === false; }).length;
      c.gateStale = rows.filter(function (r) { return v(r).baseChanged || v(r).costChanged; }).length;
      c.priced = rows.filter(function (r) { return v(r).saved; }).length;
      c.low = rows.filter(function (r) { return r.margin != null && r.margin < floorPct(); }).length;
      c.work = rows.filter(function (r) { var x = v(r); return !x.saved || x.baseApproved === false || x.baseChanged || x.costChanged; }).length;
      d.customer.adjust = c.adjust; d.customer.contractItems = c.contractItems;
      /* รายชื่อในใบรายเจ้าทุกใบต้องตรงกับฐาน */
      desks().forEach(function (o) { if (o !== D.desk) o.customers = clone(D.desk.customers); });
    }
    function rebuildCentralCount() {
      /* สถานะราคากลางต่อ SKU: need = ยังไม่เคยอนุมัติ · approved · review_required / margin_at_risk (ทุนเปลี่ยน) · policy_changed · waiting = ทุนรอยืนยัน */
      var c = { need: 0, approved: 0, stale: 0, review_required: 0, margin_at_risk: 0, policy_changed: 0, waiting: 0, noCost: 0 };
      D.desk.rows.forEach(function (r) {
        var v = r.v21 || {}, ce = v.central;
        if (!(r.cost > 0)) { c.noCost++; return; }
        if (v.ready === 'waiting_cost') { c.waiting++; return; }
        if (!ce) c.need++; else if (ce.state === 'approved') c.approved++; else { c[ce.state] = (c[ce.state] || 0) + 1; c.stale++; }
      });
      c.review = c.stale;
      desks().forEach(function (d) { d.centralCount = clone(c); });
    }
    function rebuildTotals() {
      var rows = D.pricelist.rows.filter(function (r) { return r.cost > 0; });
      var costAvg = rows.length ? rows.reduce(function (a, r) { return a + r.cost; }, 0) / rows.length : 0;
      var mgAvg = rows.length ? rows.reduce(function (a, r) { return a + (r.margin || 0); }, 0) / rows.length : 0;
      var vol = {}; (D.board.lines || []).forEach(function (l) { vol[l.id] = l.vol || 0; });
      var profit = rows.reduce(function (a, r) { return a + (r.w2 - r.cost) * (vol[r.id] || 0); }, 0);
      var t = { cost_avg: costAvg, margin_avg: mgAvg, profit_week: profit, count: D.pricelist.rows.length };
      [D.desk].concat(desks()).forEach(function (d) { Object.assign(d.totals, t); });
      Object.assign(D.preflight.totals, t); Object.assign(S.totals, t);
      D.brain.now.profit_week = profit; D.brain.now.margin_avg = mgAvg; D.brain.now.cost_avg = costAvg; D.brain.now.sku = t.count;
      D.board.costAvg = Math.round(costAvg);
    }
    function audit(role, action, detail) {
      D.brain.audit.unshift({ at: stamp(), role: role, action: action, detail: detail });
      if (D.brain.audit.length > 60) D.brain.audit.length = 60;
    }

    /* ── เครื่องคิดราคา (สูตรเดียวกับใบราคา AL): ปลีก = ⌈ทุน × 1.6⌉ · ส่ง 2kg = ทุน + ส่วนเผื่อรายตัว · 5kg = 2kg−3 · 10kg = 2kg−4
       ค่าที่คนตั้งเอง (override) ชนะสูตร · ราคากลางที่ยืนยันแล้ว = override ของ 2kg จนกว่าทุนจะเปลี่ยน ── */
    function tiersOf(sp, cost, w2) {
      cost = cost == null ? sp.cost : cost;
      var add = sp.add_baht == null ? 15 : sp.add_baht;
      var retail = sp.retail_override != null ? sp.retail_override : cost > 0 ? Math.ceil(cost * CFG.markup - 1e-9) : 0;
      if (w2 == null) w2 = sp.override || (cost > 0 ? cost + add : 0);
      return { retail: retail, w2: w2, s5: sp.s5_override != null ? sp.s5_override : w2 ? w2 + CFG.k5 : 0, s10: sp.s10_override != null ? sp.s10_override : w2 ? w2 + CFG.k10 : 0, add: add };
    }
    function priceFromCost(cost) { return Math.ceil(cost * CFG.markup - 1e-9); }
    function v0(r) { return r.v21 || (r.v21 = {}); }
    /* ══ FRESHOUR COST & PRICING LOGIC ══════════════════════════════════════════════════════════════════════
       Approved Cost Master (ทุนชุดเดียวที่ทุกหน้าอ่าน) → Product Group Policy (Target / Minimum margin ต่อกลุ่ม)
       → Pricing Engine ต่อ SKU: Target = ทุน ÷ (1 − Target%) · Minimum = ทุน ÷ (1 − Min%) · Hold = ราคาเดิม · Competitive = ตลาด(ไม่ stale) ถูกสุด − 1
       → Recommended + เหตุผล → Margin Guard → คนยืนยัน → Approved Central Price (มี version) → ราคารายเจ้าเริ่มจากราคากลาง
       ค่า Target/Minimum เริ่มต้นถอดจากใบราคา AL ล่าสุด (median margin ของแต่ละกลุ่ม) — ค่าจริงต้องมาจาก Freshour แก้ที่ /api/policy */
    function ensurePolicy() {
      var P = S.policy = S.policy || { version: 0, groups: {}, log: [] };
      var grps = {}; D.pricelist.rows.forEach(function (r) { grps[r.grp] = grps[r.grp] || []; if (r.cost > 0 && r.w2 > r.cost) grps[r.grp].push(mg(r.w2, r.cost)); });
      var added = 0;
      Object.keys(grps).forEach(function (g) {
        if (P.groups[g]) return;
        var v = grps[g].sort(function (a, b) { return a - b; }), med = v.length ? v[Math.floor(v.length / 2)] : (CFG.target_pct || 15);
        var t = Math.max(8, Math.round(med));
        P.groups[g] = { target: t, min: Math.max(5, t - 3), source: 'ถอดจากใบราคา AL (median margin ของกลุ่ม) — รอ Freshour ยืนยันค่าจริง', updated_at: stamp(), updated_by: 'system' }; added++;
      });
      if (added && !P.version) P.version = 1;
      if (CFG.market_window_days == null) CFG.market_window_days = 7; if (!CFG.competitive_basis) CFG.competitive_basis = 'low';
      S.products.forEach(function (p) { if (p.sheet_price == null) { var r = product(p.id); p.sheet_price = p.override || (r ? r.w2 : 0) || 0; } });
      S.price_versions = S.price_versions || []; S.central_prices = S.central_prices || {};
      return P;
    }
    function policyOf(grp) { var g = S.policy && S.policy.groups[grp]; return g ? { target: g.target, min: g.min } : { target: CFG.target_pct || 15, min: CFG.floor_pct || 12 }; }
    function spOf(pid) { return S.products.filter(function (p) { return p.id === pid; })[0]; }
    function priceAt(cost, pct) { return pct >= 100 || !(cost > 0) ? 0 : Math.ceil(cost / (1 - pct / 100) - 1e-9); }
    function mgState(m, pol) { return m == null ? 'unknown' : m < pol.min ? 'below_min' : m < pol.target - 0.5 ? 'below_target' : m <= pol.target + 0.5 ? 'on_target' : 'healthy'; }
    var MG_TEXT = { healthy: 'Healthy · สูงกว่าเป้า', on_target: 'On Target', below_target: 'Below Target · เตือน', below_min: 'Below Minimum · ต้องมีเหตุผล/อนุมัติ', unknown: 'ไม่รู้ทุน' };
    /* Approved Cost Master — source of truth ของทุน: Cost · Pricing · Margin Guard · Executive อ่านชุดเดียวกัน */
    function ensureCostMaster() {
      var CM = S.cost_master = S.cost_master || {};
      S.products.forEach(function (p) {
        if (CM[p.id]) return;
        var eff = p.cost_src_at || CFG.cost_updated || today();
        CM[p.id] = { product_id: p.id, current_cost: p.cost || 0, previous_cost: p.prev_cost == null ? null : p.prev_cost, effective_date: eff, source: p.cost_src || CFG.as_of || 'ใบราคา AL', approved_by: 'system', approved_at: eff + 'T00:00:00', batch_id: 'SEED', state: p.cost > 0 ? 'approved' : 'none', pending: null };
      });
      S.price_versions = S.price_versions || []; S.central_prices = S.central_prices || {};
      return CM;
    }
    function costMasterOf(pid) { return (S.cost_master || {})[pid] || null; }
    /* ราคาตลาด (ส่ง) ที่ใช้คิดได้ + อายุข้อมูล: fresh <7 · usable 7–30 · stale >30 วัน (เปิดดูได้ แต่ไม่เอามาคิดราคาเหมือนราคาวันนี้) */
    function marketOf(r) {
      var out = { rows: [], stale: [], n: 0, low: 0, high: 0, median: 0, freshness: null }, td = today();
      (r.marks || []).forEach(function (m) {
        if (!(m.price > 0)) return;
        var age = m.age != null ? m.age : m.seen ? Math.round((Date.parse(td) - Date.parse(String(m.seen).slice(0, 10))) / 864e5) : 999;
        var fr = age < 7 ? 'fresh' : age <= 30 ? 'usable' : 'stale';
        var row = { id: m.id, label: m.label, price: m.price, age: age, freshness: fr, tier: m.tier || 'w' };
        if (fr === 'stale') { out.stale.push(row); return; }
        if (row.tier === 'r') return;   /* ราคาปลีกหน้าร้าน ไม่ใช้เทียบราคาส่ง 2kg */
        out.rows.push(row);
      });
      var ps = out.rows.map(function (x) { return x.price; }).sort(function (a, b) { return a - b; });
      out.n = ps.length;
      if (ps.length) { out.low = ps[0]; out.high = ps[ps.length - 1]; out.median = ps[Math.floor(ps.length / 2)]; out.freshness = out.rows.some(function (x) { return x.freshness === 'fresh'; }) ? 'fresh' : 'usable'; }
      return out;
    }
    /* ══ สูตร 4 Goal — ฟังก์ชันเดียว ทุกหน้าเรียก (AI ไม่คำนวณราคา · ระบบเสนอ คนกด Approve) ══
       ยืนราคาเดิม  = ราคาขายรอบก่อนตรงๆ ไม่บวกไม่ลบ · ถ้า margin < Floor แค่ติดธงส้ม ไม่ปรับเอง · ไม่มีราคาเดิม → ปิดปุ่ม
       ป้องกันกำไร  = ปัดขึ้น(ทุน ÷ (1 − Floor%))
       กำไรตามเป้า  = ปัดขึ้น(ทุน ÷ (1 − Target%)) และ ≥ ป้องกันกำไรเสมอ
       แข่งขันได้    = ราคาตลาด (ต่ำสุด/median ของแหล่งราคาส่งที่ sync ภายใน W วัน) · ถ้า < Floor แสดงราคานั้นพร้อมธงแดง ไม่ใช้ Floor แทน · ไม่มีข้อมูล → ปิดปุ่ม บอกสาเหตุ
       ราคาเท่ากันหลาย Goal → sameAs ให้หน้าเว็บรวมเป็นปุ่มเดียว */
    function goalsFor(inp) {
      var cost = inp.cost, F = inp.floor, T = inp.target, prev = inp.prev > 0 ? inp.prev : 0, W = inp.window || 7, basis = inp.basis || 'low', src = inp.prevSrc || '';
      var protect = priceAt(cost, F), target = Math.max(priceAt(cost, T), protect), f = function (p) { return r1(cost / (1 - p / 100)); };
      var all = (inp.market || []).filter(function (m) { return m.price > 0 && (m.tier || 'w') !== 'r'; });
      var rows = all.filter(function (m) { return m.age != null && m.age <= W; }), old = all.filter(function (m) { return m.age == null || m.age > W; });
      var ps = rows.map(function (m) { return m.price; }).sort(function (a, b) { return a - b; }), mp = ps.length ? (basis === 'median' ? ps[Math.floor(ps.length / 2)] : ps[0]) : 0;
      var hm = prev ? mg(prev, cost) : null;
      var g = {
        hold: prev ? { price: prev, rawResult: prev, margin: hm, belowFloor: hm < F, flag: hm < F ? 'below_floor' : null, floorPrice: protect, prev: prev, basis: src,
            why: 'ราคาขายรอบก่อน ' + prev + ' ฿ ตรงๆ (' + src + ') · margin ' + hm + '%' + (hm < F ? ' — ⚠ ต่ำกว่า Floor ' + F + '% (ขั้นต่ำ ' + protect + ' ฿) ระบบไม่ปรับเอง คนตัดสิน' : '') }
          : { disabled: true, reason: 'ไม่มีราคาเดิม' + (src ? ' — ' + src : ''), why: 'ไม่มีราคาเดิม' + (src ? ' — ' + src : '') },
        protect: { price: protect, rawResult: f(F), margin: mg(protect, cost), why: 'ปัดขึ้น(ทุน ' + cost + ' ÷ (1 − Floor ' + F + '%)) = ' + f(F) + ' → ' + protect + ' ฿ (ขั้นต่ำที่ยอมรับได้)' },
        target: { price: target, rawResult: f(T), margin: mg(target, cost), equalProtect: target === protect, why: 'ปัดขึ้น(ทุน ' + cost + ' ÷ (1 − Target ' + T + '%)) = ' + f(T) + ' → ' + target + ' ฿' + (target === protect ? ' (= ป้องกันกำไร เพราะ Target ของกลุ่มเท่า Floor)' : '') },
        competitive: mp ? { price: mp, rawResult: mp, margin: mg(mp, cost), belowFloor: mp < protect, flag: mp < protect ? 'below_floor' : null, floorPrice: protect, rows: rows, basis: basis,
            why: 'ราคาตลาด' + (basis === 'median' ? 'กลาง' : 'ต่ำสุด') + ' ' + mp + ' ฿ ภายใน ' + W + ' วัน (' + rows.map(function (m) { return m.label + ' ' + m.price + ' · ' + m.age + ' วัน'; }).join(' · ') + ')' + (mp < protect ? ' — ⚠ ต่ำกว่า Floor (ขั้นต่ำ ' + protect + ' ฿) ระบบไม่ปรับเอง' : '') }
          : { disabled: true, stale: old, reason: old.length ? 'ราคาตลาดล่าสุดเก่า ' + Math.min.apply(null, old.map(function (m) { return m.age == null ? 999 : m.age; })) + ' วัน (เกิน ' + W + ' วัน) — ไม่ใช้คิด' : 'ไม่มีข้อมูลตลาด',
            why: old.length ? 'ไม่มีราคาตลาดภายใน ' + W + ' วัน (ที่มีเก่าสุด ' + old.map(function (m) { return m.label + ' ' + m.price + ' · ' + (m.age == null ? '?' : m.age) + ' วัน'; }).join(' · ') + ') — ส่งคนไปสำรวจหรือรอ connector' : 'ไม่มีข้อมูลตลาด — ใช้ยืนราคาเดิม/กำไรตามเป้า แล้วส่งคนไปสำรวจ' }
      };
      var byP = {}; ['hold', 'competitive', 'target', 'protect'].forEach(function (k) { if (!g[k].disabled) (byP[g[k].price] = byP[g[k].price] || []).push(k); });
      ['hold', 'competitive', 'target', 'protect'].forEach(function (k) { if (!g[k].disabled && byP[g[k].price].length > 1) g[k].sameAs = byP[g[k].price].filter(function (x) { return x !== k; }); });
      g.same = byP;
      return g;
    }
    /* ราคาขายรอบก่อน = ใบราคาที่ประกาศล่าสุด (history[0]) — fixture เก่าเคยชี้รอบก่อนหน้านั้น */
    function syncPrevRound() {
      var last = (D.history || [])[0]; if (!last || D.desk.prevRound === last.label) return;
      var byId = {}; S.products.forEach(function (p) { if (p.sheet_price > 0) byId[p.id] = p.sheet_price; });
      if (!Object.keys(byId).length) return;
      desks().forEach(function (d) { d.prevRound = last.label; d.rows.forEach(function (r) { if (byId[r.id]) { r.prev = byId[r.id]; r.jump = (r.w2 || 0) - r.prev; } }); });
      D.board.lines.forEach(function (l) { if (byId[l.id]) { l.prev = byId[l.id]; l.jump = (l.w2 || 0) - l.prev; } });
    }
    /* เครื่องคิดราคาต่อแถว — เลขชุดเดียวทุกหน้า · คืน v21 ที่เติมแล้ว */
    function engineRow(r, d) {
      var v = r.v21 || (r.v21 = {}), cost = r.cost, sp = spOf(r.id), pol = policyOf(r.grp), cm = costMasterOf(r.id);
      v.policy = { grp: r.grp, target: pol.target, min: pol.min, version: S.policy.version };
      v.effectivePct = pol.min; v.targetPct = pol.target; v.category = Object.assign(v.category || {}, { name: r.grp, floor: pol.min, target: pol.target });
      v.roundInc = 1; v.policyVersion = 'POLICY v' + S.policy.version;
      /* STEP 01 Pricing Readiness — ไม่มี Approved Cost = หยุด (Waiting for Cost) */
      if (cm && cm.state === 'waiting') { v.ready = 'waiting_cost'; v.readyText = 'Waiting for Cost — ทุนใหม่' + (cm.pending && cm.pending.cost != null ? ' ' + cm.pending.cost + ' ฿' : '') + ' รอยืนยันใน Review Queue · ยังตั้งราคาใหม่ไม่ได้'; }
      else if (!(cost > 0)) { v.ready = 'no_cost'; v.readyText = 'Waiting for Cost — ยังไม่รู้ทุน'; }
      else { v.ready = 'ok'; v.readyText = ''; }
      if (v.ready !== 'ok') { v.goals = null; v.rec = null; v.guard = 0; v.target = 0; v.marginState = null; v.marginStateText = null; return v; }
      var mk = marketOf(r), td0 = today();
      v.market = { n: mk.n, low: mk.low, high: mk.high, median: mk.median, rows: mk.rows, stale: mk.stale, freshness: mk.freshness, method: (CFG.competitive_basis || 'low') === 'median' ? 'MEDIAN' : 'MIN', window: CFG.market_window_days || 7 };
      /* ราคาเดิม: Step 1 = ราคากลางรอบก่อนที่ยืนยัน/ประกาศแล้ว · Step 2 = ราคาที่ขายให้เจ้านั้นรอบก่อน */
      var prev, prevSrc;
      if (d && d.customer) { prev = v.prevCustomer || 0; prevSrc = prev ? 'ที่ขายให้เจ้านี้รอบก่อน' : 'เจ้านี้ยังไม่เคยได้ราคารายการนี้ — ดูราคากลาง ' + (v.base || r.w2) + ' ฿ เป็นฐาน'; }
      else { prev = (v.central && v.central.price) || (sp && sp.sheet_price) || r.prev || 0; prevSrc = v.central && v.central.price ? 'ราคากลางที่ยืนยันไว้ v' + (v.central.version || 1) : sp && sp.sheet_price ? 'ใบราคารอบก่อน ' + (D.desk.prevRound || '') : r.prev ? 'รอบก่อน' : 'ยังไม่เคยประกาศ'; }
      var marks = (r.marks || []).map(function (m) { var age = m.age != null ? m.age : m.seen ? Math.round((Date.parse(td0) - Date.parse(String(m.seen).slice(0, 10))) / 864e5) : null; return { id: m.id, label: m.label, price: m.price, age: age, tier: m.tier || 'w' }; });
      var G = goalsFor({ cost: cost, floor: pol.min, target: pol.target, prev: prev, prevSrc: prevSrc, market: marks, window: CFG.market_window_days || 7, basis: CFG.competitive_basis || 'low' });
      var T = G.target.price, M = G.protect.price, H = G.hold.disabled ? 0 : G.hold.price, C = G.competitive.disabled ? 0 : G.competitive.price;
      v.guard = M; v.target = T; v.goals = G;
      /* ข้อเสนอของระบบ (คนกด Approve): ไม่มีตลาด → ราคาเดิมถ้า ≥ Target ไม่งั้น Target · มีตลาด → Target ถ้าไม่เกินตลาด · เกิน → ตามตลาด แต่ไม่ต่ำกว่า Floor */
      var rec, strat, why = [];
      why.push('ทุน ' + cost + ' ฿ · Floor ' + pol.min + '% → ขั้นต่ำ ' + M + ' ฿ · Target ' + pol.target + '% → ' + T + ' ฿');
      why.push(H ? 'ราคาเดิม ' + H + ' ฿ (' + prevSrc + ') margin ' + G.hold.margin + '%' + (G.hold.belowFloor ? ' ⚠ ต่ำกว่า Floor' : '') : 'ไม่มีราคาเดิม');
      why.push(C ? 'ราคาตลาด ' + C + ' ฿ (' + G.competitive.rows.length + ' แหล่ง ภายใน ' + (CFG.market_window_days || 7) + ' วัน)' + (G.competitive.belowFloor ? ' ⚠ ต่ำกว่า Floor' : '') : G.competitive.reason);
      if (C) {
        if (H && H >= T && H <= C) { rec = H; strat = 'hold'; why.push('ราคาเดิมได้ตามเป้าและไม่เกินตลาด → ยืนราคาเดิม'); }
        else if (T <= C) { rec = T; strat = 'target'; why.push('Target ไม่เกินราคาตลาด → เสนอ Target'); }
        else if (C >= M) { rec = C; strat = 'competitive'; why.push('Target สูงกว่าตลาด → เสนอตามตลาด ' + C + ' ฿ (ยังไม่ต่ำกว่า Floor)'); }
        else { rec = M; strat = 'protect'; why.push('ตลาด ' + C + ' ฿ ต่ำกว่า Floor → เสนอขั้นต่ำ ' + M + ' ฿ (จะแพงกว่าตลาด — คนตัดสินใจ)'); }
      } else if (H && H >= T) { rec = H; strat = 'hold'; why.push('ไม่มีตลาด · ราคาเดิมได้ตามเป้า → ยืนราคาเดิม'); }
      else { rec = T; strat = 'target'; why.push(H ? 'ไม่มีตลาด · ราคาเดิมต่ำกว่าเป้า → เสนอ Target (ราคาเดิมยังเลือกได้ มีธงเตือน)' : 'ไม่มีตลาด ไม่มีราคาเดิม → เสนอ Target'); }
      var rm = mg(rec, cost), rs = mgState(rm, pol);
      v.rec = { price: rec, strategy: strat, margin: rm, state: rs, stateText: MG_TEXT[rs], why: why, market: C || null, hold: H, target: T, min: M };
      v.auto = rec;
      /* STEP 08 Margin Guard — ราคาที่ใช้อยู่ตอนนี้อยู่สถานะไหน */
      var cur = d && d.customer ? (v.saved ? v.saved.price : r.cust ? r.cust.price : null) : (v.central ? v.central.price : null);
      v.marginState = cur ? mgState(mg(cur, cost), pol) : null; v.marginStateText = v.marginState ? MG_TEXT[v.marginState] : null;
      return v;
    }
    /* คิดใหม่ทั้งสินค้า: แถวกลาง → ราคากลางที่ใช้ (อนุมัติแล้ว = ราคาอนุมัติ · ยังไม่อนุมัติ = ราคาแนะนำ) → ทุกใบรายเจ้าเริ่มจากราคากลางนี้ */
    function recalcProduct(pid) {
      var P = product(pid), r0 = D.desk.rows.filter(function (r) { return r.id === pid; })[0]; if (!P || !r0) return;
      var sp = spOf(pid), v0r = engineRow(r0, D.desk);
      var w2 = sp && sp.override > 0 ? sp.override : v0r.rec ? v0r.rec.price : P.w2;
      var t = tiersOf(sp || {}, P.cost, w2);
      P.w2 = w2; P.retail = t.retail; P.s5 = t.s5; P.s10 = t.s10; P.saleFloor = w2 ? w2 - CFG.haggle_baht : 0; P.margin = mg(w2, P.cost);
      P.rec = v0r.rec ? v0r.rec.price : null; P.recState = v0r.rec ? v0r.rec.state : null; P.ready = v0r.ready; P.centralState = v0r.central ? v0r.central.state : null; P.policy = v0r.policy; P.marginState = P.cost > 0 && w2 ? mgState(P.margin, policyOf(P.grp)) : null;
      r0.w2 = w2; r0.auto = w2; r0.retail = t.retail; r0.s5 = t.s5; r0.s10 = t.s10; r0.margin = mg(w2, P.cost); r0.floorPrice = v0r.guard; r0.safeLow = v0r.guard; r0.saleFloor = P.saleFloor; r0.status = v0r.guard && w2 < v0r.guard ? 'floored' : 'none';
      if (v0r.tiers) v0r.tiers = { retail: t.retail, w2: w2, s5: t.s5, s10: t.s10, add: t.add };
      var pol = policyOf(P.grp);
      D.board.lines.forEach(function (l) { if (l.id === pid) { l.w2 = w2; l.cost = P.cost; l.margin = P.margin; l.jump = w2 - (l.prev || 0); l.okMargin = P.margin >= pol.min; } });
      desks().forEach(function (d) {
        if (d === D.desk) return;
        d.rows.forEach(function (r) {
          if (r.id !== pid) return;
          r.w2 = w2; r.auto = w2; r.retail = t.retail; r.s5 = t.s5; r.s10 = t.s10; r.saleFloor = P.saleFloor; r.cost = P.cost;
          var v = r.v21 || (r.v21 = {}); v.base = w2; v.central = r0.v21.central ? clone(r0.v21.central) : null;
          if (r.cust) { r.cust.cost = P.cost; if (r.cust.source !== 'สัญญา') r.cust.price = w2 + (r.cust.adjust || 0); }
          r.margin = mg(r.cust ? r.cust.price : w2, P.cost);
          engineRow(r, d);
          r.floorPrice = v.guard; r.safeLow = v.guard; r.status = v.guard && (r.cust ? r.cust.price : w2) < v.guard ? 'floored' : 'none';
          if (v.tiers) v.tiers = { retail: t.retail, w2: w2, s5: t.s5, s10: t.s10, add: t.add };
        });
      });
      catItemDocs().forEach(function (c) { c.items.forEach(function (it) { if (it.id === pid) { it.cost = P.cost; it.price = w2; it.margin = P.margin; it.guard = v0r.guard; it.target = pol.target; it.effective = pol.min; } }); });
      D.brain.evidence.blind.forEach(function (b) { if (b.id === pid) { b.cost = P.cost; b.w2 = w2; b.formula = w2; } });
    }
    function recalcAll() { D.pricelist.rows.forEach(function (r) { recalcProduct(r.id); }); rebuildGuard(); rebuildTotals(); rebuildCentralCount(); }
    /* Cost Review: Reject / Hold → ไม่อัปเดต Cost Master · สถานะ Waiting for Cost Confirmation · Pricing หยุดรอ */
    function holdCost(pid, pending, role) { var cm = ensureCostMaster()[pid]; if (!cm) return false; cm.state = 'waiting'; cm.pending = Object.assign({ at: stamp(), by: role || '' }, pending || {}); recalcProduct(pid); rebuildCentralCount(); return true; }
    function releaseCost(pid) { var cm = ensureCostMaster()[pid]; if (!cm) return false; cm.state = cm.current_cost > 0 ? 'approved' : 'none'; cm.pending = null; recalcProduct(pid); rebuildCentralCount(); return true; }
    /* STEP 13 Policy Change → ทุก SKU ในกลุ่ม mark "Pricing Policy Changed" + คิด Target/Minimum ใหม่ทั้งกลุ่ม ไม่ต้องแก้ทีละตัว */
    function policyUpdate(role, body) {
      ensurePolicy();
      var grp = body.grp, g = S.policy.groups[grp]; if (!g) return err(404, 'ไม่พบกลุ่มสินค้า ' + grp);
      var t = body.target == null || body.target === '' ? g.target : num(body.target), m = body.min == null || body.min === '' ? g.min : num(body.min);
      if (t == null || m == null || !(m >= 0 && t >= m && t < 90)) return err(400, 'Target ต้องไม่ต่ำกว่า Minimum และอยู่ระหว่าง 0–90%');
      if (t === g.target && m === g.min) return ok({ ok: true, changed: 0, version: S.policy.version });
      var before = { target: g.target, min: g.min }, at = stamp();
      g.target = t; g.min = m; g.updated_at = at; g.updated_by = role; g.source = String(body.reason || '').trim() || 'ตั้งค่าโดย ' + role;
      S.policy.version++; S.policy.log = S.policy.log || []; S.policy.log.unshift({ v: S.policy.version, grp: grp, from: before, to: { target: t, min: m }, by: role, at: at, reason: String(body.reason || '') });
      var n = 0;
      D.pricelist.rows.filter(function (r) { return r.grp === grp; }).forEach(function (r) {
        n++;
        desks().forEach(function (d) { d.rows.forEach(function (x) { if (x.id !== r.id) return; var v = x.v21 || (x.v21 = {}); v.policyChanged = { v: S.policy.version, at: at, from: before, to: { target: t, min: m } };
          if (v.central && v.central.price && v.central.state !== 'margin_at_risk') v.central.state = mg(v.central.price, x.cost) < m ? 'margin_at_risk' : 'policy_changed'; }); });
        recalcProduct(r.id);
      });
      rebuildCategoryGuard(); rebuildGuard(); rebuildTotals(); rebuildCentralCount();
      audit(role, 'policy', grp + ' target ' + before.target + '→' + t + '% · min ' + before.min + '→' + m + '% · ' + n + ' SKU ต้องตรวจราคาใหม่');
      return ok({ ok: true, changed: n, version: S.policy.version });
    }
    /* หมวดเดิม 4 หมวด (หน้า Margin Guard/ผู้บริหาร) = สรุปจากนโยบายของกลุ่มสินค้าที่อยู่ในหมวดนั้น — ไม่มีตัวเลขของตัวเอง */
    function rebuildCategoryGuard() {
      var CG = D['category-guard']; if (!CG) return;
      CG.groups.forEach(function (g) {
        var pols = (g.grps || []).filter(function (x) { return S.policy.groups[x]; }).map(function (x) { return S.policy.groups[x]; });
        if (!pols.length) return;
        var t = Math.round(pols.reduce(function (a, p) { return a + p.target; }, 0) / pols.length);
        g.target = t; g.effective = t; g.lo = Math.min.apply(null, pols.map(function (p) { return p.min; })); g.hi = Math.max.apply(null, pols.map(function (p) { return p.target; }));
        var rows = D.pricelist.rows.filter(function (r) { return (g.grps || []).indexOf(r.grp) >= 0 && r.cost > 0; }), ms = rows.map(function (r) { return r.margin; }).filter(function (x) { return x != null; });
        g.margin = ms.length ? r1(ms.reduce(function (a, b) { return a + b; }, 0) / ms.length) : null; g.n = rows.length;
        g.state = g.margin == null ? 'unknown' : g.margin < g.lo ? 'bad' : g.margin < g.target ? 'warn' : 'good';
      });
      CG.below = CG.groups.filter(function (x) { return x.state === 'bad'; }).length;
      CG.floorPct = Math.min.apply(null, CG.groups.map(function (g) { return g.lo || 12; }));
    }
    function policyView() {
      ensurePolicy();
      var vol = {}; (D.board.lines || []).forEach(function (l) { vol[l.id] = l.vol || 0; });
      var rows = Object.keys(S.policy.groups).map(function (grp) {
        var g = S.policy.groups[grp], items = D.pricelist.rows.filter(function (r) { return r.grp === grp; }), wc = items.filter(function (r) { return r.cost > 0 && r.w2 > 0; });
        var rev = 0, gp = 0; wc.forEach(function (r) { var q = vol[r.id] || 1; rev += r.w2 * q; gp += (r.w2 - r.cost) * q; });
        var m = rev ? r1(gp / rev * 100) : null, st = { healthy: 0, on_target: 0, below_target: 0, below_min: 0 };
        wc.forEach(function (r) { st[mgState(mg(r.w2, r.cost), g)]++; });
        var review = D.desk.rows.filter(function (r) { return r.grp === grp && r.v21 && r.v21.central && r.v21.central.state !== 'approved'; }).length;
        var waiting = D.desk.rows.filter(function (r) { return r.grp === grp && r.v21 && r.v21.ready === 'waiting_cost'; }).length;
        return { grp: grp, target: g.target, min: g.min, n: items.length, withCost: wc.length, margin: m, state: m == null ? 'unknown' : mgState(m, g), states: st, review: review, waiting: waiting, source: g.source, updated_at: g.updated_at, updated_by: g.updated_by };
      }).sort(function (a, b) { return b.n - a.n; });
      return { version: S.policy.version, groups: rows, log: (S.policy.log || []).slice(0, 20), stateText: MG_TEXT,
        formula: { target: 'Target Price = Cost ÷ (1 − Target Margin)', min: 'Minimum Price = Cost ÷ (1 − Minimum Margin)', margin: 'Margin % = (Price − Cost) ÷ Price × 100', rounding: 'ปัดขึ้นเป็นบาท', competitive: 'ราคาตลาด (ส่ง) ที่อายุ ≤30 วัน ถูกสุด − 1 ฿', hold: 'ราคาเดิม = ราคากลางที่ยืนยันไว้ / ใบราคาปัจจุบัน' } };
    }
    /* ── ทุนเข้า (Approved Cost) — เขียน Cost Master · ทุกแถวที่อ้างสินค้านี้ · แล้ว trigger Pricing Recalculation ── */
    function setCost(pid, cost, src, role, meta) {
      var P = product(pid); if (!P) return false;
      meta = meta || {};
      var prevCost = P.cost, td = today(), sp = spOf(pid), changed = cost !== prevCost, eff = meta.effective_date || td;
      if (sp) { sp.prev_cost = sp.cost; sp.cost = cost; sp.cost_src = src; sp.cost_src_at = eff; }
      P.cost = cost; P.costSrc = src; P.costSrcAt = eff;
      var CM = ensureCostMaster(), cm = CM[pid] || (CM[pid] = { product_id: pid });
      Object.assign(cm, { current_cost: cost, previous_cost: prevCost, effective_date: eff, source: src, approved_by: role || 'system', approved_at: stamp(), batch_id: meta.batch_id || null, state: cost > 0 ? 'approved' : 'none', pending: null });
      D.board.lines.forEach(function (l) { if (l.id === pid) l.cost = cost; });
      D.guard.lines.forEach(function (l) { if (l.pid === pid) l.cost = cost; });
      var pol = policyOf(P.grp);
      desks().forEach(function (d) {
        d.rows.forEach(function (r) {
          if (r.id !== pid) return;
          r.costPrev = prevCost; r.cost = cost; r.boardCost = cost; r.costJump = cost - (prevCost || cost);
          var v = r.v21 || (r.v21 = {}); v.costUpdated = td;
          /* STEP 08 Cost Change Impact: มีราคาที่อนุมัติอยู่ → คิด margin ใหม่ทันที · ต่ำกว่าขั้นต่ำ = Margin at Risk · ไม่งั้น = Pricing Review Required (ไม่ปล่อยให้ Approved เหมือนเดิม) */
          if (changed && v.central && v.central.price) {
            var nm = mg(v.central.price, cost);
            v.central.marginNow = nm; v.central.state = nm < pol.min ? 'margin_at_risk' : 'review_required';
            v.central.impact = { prev_cost: prevCost, cost: cost, margin_before: mg(v.central.price, prevCost), margin_after: nm, at: stamp() };
          }
          if (v.saved && changed) v.costChanged = true;
        });
        d.costUpdated = td;
      });
      D.pricelist.costUpdated = td; CFG.cost_updated = td; D.brain.control.cost_updated = td; D.pricelist.dirty = true; D.brain.now.dirty = true;
      (D.cost_entries = D.cost_entries || []).unshift({ at: stamp(), pid: pid, cost: cost, prev: prevCost, src: src, by: role || '', batch_id: meta.batch_id || null });
      if (D.cost_entries.length > 5000) D.cost_entries.length = 5000;
      recalcProduct(pid);   /* Cost Change → Pricing Recalculation อัตโนมัติ (Target/Minimum/แนะนำ ทุกใบ) */
      return true;
    }

    /* ── auth ─────────────────────────────────────────────────── */
    /* ── ทีมขาย: เซลล์หลายคน ถือลูกค้าคนละชุด — เห็นเฉพาะของตัวเอง ── */
    function ensureReps() {
      S.sales_reps = S.sales_reps || [{ id: 's1', name: 'เซลล์ 1' }, { id: 's2', name: 'เซลล์ 2' }, { id: 's3', name: 'เซลล์ 3' }];
      if (!S.sales_reps.length || S.customers.some(function (c) { return c.owner; })) return;
      /* ยังไม่มีใครถือลูกค้า → มอบหมายชั่วคราวเรียงตามขนาดใบ (มากไปน้อย) สลับคน จะได้ถือมูลค่าไม่เท่ากันเหมือนของจริง · แก้ได้ที่ POST /api/customers/:id {owner} */
      var lines = {}; (D.sends.customers || []).forEach(function (c) { lines[c.id] = c.lines || 0; });
      S.customers.slice().sort(function (a, b) { return (lines[b.id] || 0) - (lines[a.id] || 0); }).forEach(function (c, i) { c.owner = S.sales_reps[i % S.sales_reps.length].id; c.owner_src = 'auto'; });
    }
    function repOf(id) { return (S.sales_reps || []).filter(function (r) { return r.id === id; })[0] || null; }
    function ownerOf(cid) { var c = (S.customers || []).filter(function (x) { return x.id === cid; })[0]; return c ? (c.owner || '') : ''; }
    /* ขอบเขตที่คนนี้เห็น: เซลล์ = เฉพาะลูกค้าที่ตัวเองถือ (ถ้ามีการตั้ง rep) · คนอื่น = ทั้งหมด (กรองด้วย ?rep= ได้) */
    /* เซลล์ที่ไม่ระบุคน (session เก่า/ฝังใช้ในเทสต์) = มุมมองทีมขายรวม — server บังคับให้เลือกชื่อใหม่ก่อนเข้าอยู่แล้ว */
    function repScope(role, rep, q) { if (LVL[role] < 2) return rep || null; return q && q.rep ? q.rep : null; }
    function inScope(scope, cid) { return !scope || ownerOf(cid) === scope; }
    var CUR_REP = null;
    function repsView(role) {
      var n = {}; S.customers.forEach(function (c) { if (c.owner) n[c.owner] = (n[c.owner] || 0) + 1; });
      return { reps: (S.sales_reps || []).map(function (r) { return { id: r.id, name: r.name, customers: n[r.id] || 0 }; }), unassigned: S.customers.filter(function (c) { return !c.owner; }).length, provisional: S.customers.some(function (c) { return c.owner_src === 'auto'; }) };
    }
    function repsPost(role, body) {
      var id = String(body.id || '').trim(), name = String(body.name || '').trim(); if (!name) return err(400, 'ต้องมีชื่อ');
      if (!id) { var k = 1; while (repOf('s' + k)) k++; id = 's' + k; }
      var r = repOf(id); if (r) r.name = name; else S.sales_reps.push({ id: id, name: name });
      if (Array.isArray(body.customers)) body.customers.forEach(function (cid) { var c = S.customers.filter(function (x) { return x.id === cid; })[0]; if (c) { c.owner = id; delete c.owner_src; } });
      audit(role, 'rep-update', name + ' (' + id + ')' + (body.customers ? ' · ลูกค้า ' + body.customers.length : ''));
      return ok({ ok: true, id: id, reps: repsView(role).reps });
    }
    function meOf(role, rep) {
      if (!role || role === 'anon') return { role: null, needPin: needPin };
      var base = D['me:' + (role === 'admin' ? 'boss' : role)] || { tabs: [], dispatch: false, seeCost: false };
      return Object.assign({}, base, { role: role, needPin: needPin, dataNote: (opts.dataNote || '') + (CFG.cost_basis ? ' · ' + CFG.cost_basis : ''), costBasis: CFG.cost_basis || '', sampleMarket: !!opts.sampleMarket, rep: repOf(rep), reps: LVL[role] >= 2 ? repsView(role).reps : undefined });
    }
    function login(body) {
      var role = String(body.role || ''), pin = body.pin == null ? '' : String(body.pin);
      if (!LVL[role] || role === 'anon' || role === 'system') return err(400, 'ไม่รู้จักบทบาทนี้');
      if (PINS) {
        if (!pin) return err(401, 'ต้องใส่รหัสของ ' + (ROLE_NAME[role] || role));
        if (PINS[role] !== pin) { audit(role, 'login-fail', 'รหัสผิด'); return err(401, 'รหัสไม่ถูกต้อง'); }
      }
      if (role === 'sale' && (S.sales_reps || []).length) {
        var rp = repOf(String(body.rep || '')); if (!rp) return err(400, 'เลือกชื่อเซลล์ก่อน — แต่ละคนเห็นเฉพาะลูกค้าของตัวเอง');
        return { status: 200, body: { ok: true, role: role, rep: rp }, session: role + '|' + rp.id };
      }
      return { status: 200, body: { ok: true, role: role }, session: role };
    }

    /* ── มุมมองเฉพาะเซลล์ (ไม่มีทุน) ── */
    function pricelistFor(role) {
      var P = D.pricelist;
      if (LVL[role] >= 2) return P;
      var o = clone(P); o.seeCost = false; o.costUpdated = '';
      o.comps = o.comps.map(function (c) { return { id: c.id, label: c.label, tier: c.tier }; });
      o.rows.forEach(function (r) { delete r.cost; delete r.margin; delete r.costSrc; delete r.costSrcAt; });
      return o;
    }
    function guardFor(role, rep) {
      var G = D.guard;
      if (LVL[role] >= 2) return G;
      var sc = repScope(role, rep);
      return { today: G.today, asOf: G.asOf, forSale: true,
        customers: G.customers.filter(function (c) { return inScope(sc, c.id); }).map(function (c) { return { id: c.id, name: c.name, grade: c.grade, n: c.n }; }),
        suggest: (G.suggest || []).map(function (s) { return { cid: s.cid, cust: s.cust, from: s.from, to: s.to, toId: s.toId, toPrice: s.toPrice, diff: s.diff, grp: s.grp }; }) };
    }
    function serviceLogsFor(name) {
      var logs = D['service-logs'].logs.filter(function (l) { return !name || l.customer === name; });
      return name ? { customer: name, logs: logs } : { open: logs.filter(function (l) { return l.status !== 'ปิดแล้ว'; }).length, total: logs.length, logs: logs };
    }
    function productView(pid) {
      var P = product(pid); if (!P) return null;
      var bl = D.board.lines.filter(function (l) { return l.id === pid; })[0] || {};
      var PR = D.price_rounds, prs = PR && PR.sku && PR.sku[pid], spx = spOf(pid) || {}, histSrc = 'ใบราคาที่ประกาศ', histMock = false;
      var hist = (S.dispatched.items || []).filter(function (i) { return i.product_id === pid; }).map(function (i) { return { price: i.w2, cost: i.cost }; });
      if (prs && prs.length) {   /* มีประวัติรายรอบที่นำเข้า (ตอนนี้ = ชุดจำลอง 6 รอบ) → ใช้แทน และบอกที่มาให้หน้าจอติดป้าย */
        var lbl = {}; (PR.rounds || []).forEach(function (r) { lbl[r.k] = r.label; });
        hist = prs.slice().sort(function (a, b) { return a.k - b.k; }).map(function (r) { return { label: lbl[r.k] || String(r.k), price: r.w2, cost: r.cost, market: r.market }; });
        histSrc = PR.title || PR.source; histMock = PR.source === 'mock';
      }
      hist.push({ label: (D.history[0] || {}).label || 'ปัจจุบัน', price: spx.sheet_price > 0 ? spx.sheet_price : P.w2, cost: P.cost, current: true });
      var r0 = D.desk.rows.filter(function (r) { return r.id === pid; })[0] || {}, v0x = r0.v21 || {}, pol = policyOf(P.grp);
      return { floorPct: floorPct(), haggle: CFG.haggle_baht,
        p: { grp: P.grp, name: P.name, vol: bl.vol || 0, cost: P.cost, w2: P.w2, margin: P.margin, floorPrice: priceAt(P.cost || 0, pol.min), retail: P.retail, s5: P.s5, s10: P.s10, saleFloor: P.saleFloor, unit: P.unit, add: (spOf(P.id) || {}).add_baht },
        policy: { grp: P.grp, target: pol.target, min: pol.min, version: S.policy.version }, rec: v0x.rec || null, goals: v0x.goals || null, ready: v0x.ready || null, central: v0x.central || null, marginState: v0x.marginState || null,
        costMaster: costMasterOf(pid), versions: S.price_versions.filter(function (x) { return x.product_id === pid; }).slice(0, 10),
        marks: (P.marks || []).map(function (m) { return { label: m.label, tier: m.tier, price: m.price || 0, state: m.state, age: m.age }; }),
        customers: D.guard.lines.filter(function (l) { return l.pid === pid; }).map(function (l) { return { name: l.cust, price: l.locked, margin: l.margin }; }),
        hist: hist, histSrc: histSrc, histMock: histMock };
    }
    function quoteFor(cid, tier) {
      var sh = sheetFor(cid); if (!sh) return err(404, 'ไม่พบลูกค้า');
      var rows = sh.rows.filter(function (r) { return r.inOffer; });
      if (!rows.length) return err(400, 'ใบราคารอบ ' + sh.label + ' ของ ' + sh.customer.name + ' ยังไม่ผ่าน Pricing — ให้พี่จุ๋มยืนยันใบรายเจ้าแล้วกด "ส่ง Sales" ก่อน');
      var lines = rows.map(function (r) { var px = r.request && r.request.status === 'ok' && r.request.final_price ? r.request.final_price : r.offer; var d = r.prev ? px - r.prev : 0;
        return '• ' + r.name + ' ' + px + ' ฿/กก.' + (d ? ' (' + (d > 0 ? '+' : '') + d + ')' : ''); });
      var text = 'ใบราคา Freshour รอบ ' + sh.label + '\nลูกค้า: ' + sh.customer.name + '\n\n' + lines.join('\n') +
        '\n\nราคาส่ง ' + (tier === 'w2' ? '2 กก.' : tier) + ' · ใช้ได้ถึงรอบถัดไป · ยืนยันกลับมาทางไลน์ได้เลยครับ';
      return ok({ text: text, customer: sh.customer.name, count: rows.length, label: sh.label, tier: tier, offer: rows.map(function (r) { return r.pid + ':' + r.offer; }).join(',') });
    }
    function dataAudit() {
      var names = {}; D.pricelist.rows.forEach(function (r) { (names[r.name] = names[r.name] || []).push({ name: r.name, grp: r.grp }); });
      var coll = Object.keys(names).map(function (k) { return names[k]; }).filter(function (g) { return g.length > 1; });
      var ids = {}; D.pricelist.rows.forEach(function (r) { ids[r.id] = 1; });
      var cc = D.desk.centralCount || {}, cats = {};
      (D['category-guard'].groups || []).forEach(function (g) { cats[g.name] = g.n; });
      return { today: today(), label: D.sends.label, master: D.pricelist.rows.length, noCost: D.pricelist.rows.filter(function (r) { return !(r.cost > 0); }).length,
        central: { approved: cc.approved || 0, stale: cc.stale || 0, missing: cc.need || 0 },
        market: { live: D.pricelist.rows.filter(function (r) { return (r.marks || []).some(function (m) { return m.price > 0 && m.state === 'fresh'; }); }).length },
        nameCollisions: coll.length, collisions: coll, orphanLines: S.contract_lines.filter(function (l) { return !ids[l.product_id]; }).length,
        round: { customersPriced: D.desk.customers.filter(function (c) { return c.priced > 0; }).length, handed: D.sends.handed, sent: D.sends.sent }, categories: cats };
    }

    /* ── mutations ─────────────────────────────────────────────── */
    function activity(role, body) {
      var ms = Math.min(num(body.ms) || 0, 120000); if (ms < 1000) return ok();
      var step = { '/costs': 'cost', '/pricing': 'central', '/customers': 'guard', '/guard': 'guard', '/exec': 'guard', '/brain': 'guard', '/sales': 'sales' }[String(body.page || '')] || 'guard';
      var OP = D['ops-perf'], wk = weekStart(today());
      var w = OP.weeks.filter(function (x) { return x.week === wk; })[0];
      if (!w) { w = { week: wk, minutes: { cost: 0, central: 0, guard: 0, sales: 0 }, total: 0 }; OP.weeks.unshift(w); }
      w.minutes[step] = r1((w.minutes[step] || 0) + ms / 60000); w.total = r1(w.minutes.cost + w.minutes.central + w.minutes.guard + w.minutes.sales);
      OP.summary.week = wk; OP.summary.steps.forEach(function (s) { s.now = w.minutes[s.key] || 0; }); OP.summary.totalNow = w.total;
      if (OP.summary.totalBefore != null) OP.summary.savedH = r1((OP.summary.totalBefore - w.total) / 60);
      return ok();
    }
    function perfBaseline(body) {
      var OP = D['ops-perf'], steps = ['cost', 'central', 'guard', 'sales'];
      OP.baseline = steps.filter(function (k) { return num(body[k]) != null && body[k] !== ''; }).map(function (k) { return { step: k, minutes: num(body[k]), note: body.note || '' }; });
      if (num(body.loops) != null && body.loops !== '') OP.baseline.push({ step: 'loops', minutes: num(body.loops), note: body.note || '' });
      var b = {}; OP.baseline.forEach(function (x) { b[x.step] = x.minutes; });
      OP.summary.steps.forEach(function (s) { s.before = b[s.key] == null ? null : b[s.key]; });
      var tb = steps.reduce(function (a, k) { return a + (b[k] || 0); }, 0);
      OP.summary.totalBefore = tb || null; OP.summary.loopsBefore = b.loops == null ? null : b.loops;
      OP.summary.savedH = tb ? r1((tb - (OP.summary.totalNow || 0)) / 60) : null;
      return ok();
    }
    function brainSay(role, body) {
      var t = String(body.text || '').trim(), B = D.brain, m = B.money || {}, reply, suggest = ['ไปไหนต่อ', 'ติดอะไรอยู่', 'เสียเงินตรงไหนบ้าง', 'เริ่มจากไหน'];
      var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
      if (/ไปไหน|ต่อไป|next/i.test(t)) reply = (B.moves[0] ? 'ก้าวต่อไปที่คุ้มสุด: ' + B.moves[0].title + ' — ' + B.moves[0].how : 'ตอนนี้ไม่มีก้าวที่ค้าง');
      else if (/ติด|ค้าง|blocker|ประกาศ/i.test(t)) reply = B.blockers.length ? 'ยังประกาศไม่ได้ เพราะ: ' + B.blockers.join(' · ') : 'ไม่มีอะไรติด ประกาศได้';
      else if (/เงิน|เสีย|ขาดทุน|กำไร/i.test(t)) reply = 'ยอดขายที่ยังตั้งราคาแบบไม่รู้ตลาด ' + fmt(m.blindRevenue || 0) + ' ฿/สัปดาห์ · สัญญาที่ขายต่ำกว่าทุน ' + fmt(m.contractBleed || 0) + ' ฿ · กำไร/สัปดาห์ตอนนี้ ' + fmt(B.now.profit_week) + ' ฿ (margin เฉลี่ย ' + r1(B.now.margin_avg) + '%)';
      else if (/เริ่ม|start/i.test(t)) reply = B.from ? B.from.title + ' — ' + B.from.note : 'เริ่มจากรับทุนรอบใหม่ที่หน้า ทุน/ตลาด';
      else if (/สินค้า|sku|กี่ตัว/i.test(t)) reply = 'สินค้าในระบบ ' + B.now.sku + ' ตัว · รู้ราคาตลาด ' + (B.now.sku - B.now.blind) + ' · ยังไม่รู้ ' + B.now.blind;
      else if (/ลูกค้า|สัญญา/i.test(t)) reply = 'ลูกค้าสัญญา ' + D.guard.totals.customers + ' เจ้า · บรรทัดสัญญา ' + D.guard.totals.lines + ' · ต่ำกว่า floor ' + D.guard.totals.low + ' บรรทัด · ขาดทุน ' + D.guard.totals.loss;
      else reply = 'ผมตอบได้จากตัวเลขที่มี: ก้าวต่อไป · สิ่งที่ติด · เงินที่รั่ว · สินค้า · ลูกค้า — เรื่อง "' + t + '" ยังไม่มีข้อมูลในฐาน บอกตรงๆ ว่าไม่รู้';
      B.talk.unshift({ id: ++seq.talk, at: stamp(), who: role, said: t, brain: reply, proposal: null, outcome: null });
      return ok({ text: reply, suggest: suggest });
    }
    function dispatch(role, body) {
      var td = today(), d = bkk(), label = String(body.label || '').trim();
      if (!label) { var e = new Date(d); e.setUTCDate(e.getUTCDate() + 6); label = d.getUTCDate() + '-' + e.getUTCDate() + '/' + String(e.getUTCMonth() + 1).padStart(2, '0'); }
      var prev = D.sends.label, t = S.totals;
      var h = { id: (D.history[0] ? D.history[0].id : 100) + 1, label: label, dispatched_at: td, by_role: role, cost_avg: r1(t.cost_avg), margin_avg: r1(t.margin_avg), profit_week: Math.round(t.profit_week), risk_count: t.risk || 0 };
      D.history.unshift(h);
      D.brain.dispatches.unshift({ label: label, at: td, by: ROLE_NAME[role] || role, risk: 0, cost_avg: h.cost_avg, margin_avg: h.margin_avg, profit_week: h.profit_week });
      D.brain.now.dispatched = { label: label, at: td, by: ROLE_NAME[role] || role }; D.brain.now.dirty = false;
      D.pricelist.dispatched = { label: label, at: td }; D.pricelist.dirty = false; CFG.dirty = 0;
      S.dispatched = { id: h.id, label: label, at: td, items: D.pricelist.rows.map(function (r) { return { product_id: r.id, name: r.name, w2: r.w2, cost: r.cost }; }) };
      D.board.lines.forEach(function (l) { l.prev = l.w2; l.jump = 0; });
      desks().forEach(function (dk) { dk.round = label; dk.prevRound = prev; dk.centralAfterRound = 0; dk.rows.forEach(function (r) { r.prev = r.w2; r.jump = 0; }); });
      /* รอบใหม่ = ทุกเจ้ากลับเป็น "ยังไม่ส่ง" */
      D.sends.label = label;
      D.sends.customers.forEach(function (c) { c.sentAt = null; c.sentBy = null; c.opened = null; });
      sheets().forEach(function (sh) { sh.prevLabel = sh.label; sh.label = label; sh.sent = false; sh.rows.forEach(function (r) { if (r.quoted != null) { r.hist.unshift({ label: sh.prevLabel, price: r.quoted }); r.prev = r.quoted; } r.quoted = null; r.response = null; r.accepted = null; r.reconfirm = false; }); rebuildSheet(sh); });
      D.review.round = label; D.review.roundAt = td;
      audit(role, 'dispatch', label);
      return ok({ ok: true, label: label, id: h.id });
    }
    function savePriceSheet(role, body) {
      var rows = Array.isArray(body.rows) ? body.rows : [], cid = body.customer_id || null, problems = [], saved = 0, exc = 0, handoffReset = false, td = today();
      if (!rows.length) return err(400, 'ไม่มีรายการที่จะบันทึก');
      var dk = cid ? deskFor(cid) : D.desk;
      if (!dk) return err(404, 'ไม่พบลูกค้า ' + cid);
      var byId = {}; dk.rows.forEach(function (r) { byId[r.id] = r; });
      rows.forEach(function (x) {
        var r = byId[x.product_id], px = Math.round(num(x.price));
        if (!r) { problems.push({ product_id: x.product_id, error: 'ไม่พบสินค้า' }); return; }
        if (!(px > 0)) { problems.push({ product_id: x.product_id, name: r.name, error: 'ราคาต้องมากกว่า 0' }); return; }
        var v = r.v21 || (r.v21 = {}), guard = v.guard || 0;
        if (guard > 0 && px < guard && !String(x.exception || '').trim()) { problems.push({ product_id: x.product_id, name: r.name, error: 'ต่ำกว่าขั้นต่ำ ' + guard + ' ฿ ต้องใส่เหตุผลข้อยกเว้น' }); return; }
        if (String(x.exception || '').trim()) exc++;
        if (!cid) {
          var pol = policyOf(r.grp), rec = v.rec || {}, ver = ((S.central_prices || {})[r.id] || {}).version || 0; ver++;
          var goal = x.goal || body.goal || (rec.price === px ? rec.strategy : 'manual'), mstate = mgState(mg(px, r.cost), pol);
          /* Approved Central Price + Price Version — ไม่แก้ทับของเดิม ย้อนดูได้ว่าใครเปลี่ยนอะไรเมื่อไหร่เพราะอะไร */
          v.central = { price: px, goal: goal, at: td, by: role, state: 'approved', exception: String(x.exception || ''), version: ver, cost: r.cost, target: pol.target, min: pol.min, recommended: rec.price || null, strategy: rec.strategy || null, market: v.market ? { low: v.market.low, high: v.market.high, n: v.market.n } : null, marginState: mstate, marginNow: mg(px, r.cost) };
          v.policyChanged = null;
          S.central_prices[r.id] = { product_id: r.id, name: r.name, grp: r.grp, approved_cost: r.cost, target_margin: pol.target, min_margin: pol.min, recommended_price: rec.price || null, approved_price: px, strategy: goal, market_ref: v.central.market, reason: (rec.why || []).join(' · '), exception: v.central.exception, approved_by: role, approved_at: stamp(), version: ver, margin: mg(px, r.cost), margin_state: mstate, policy_version: S.policy.version };
          S.price_versions.unshift(Object.assign({ kind: 'central' }, S.central_prices[r.id])); if (S.price_versions.length > 5000) S.price_versions.length = 5000;
          r.w2 = px; r.margin = mg(px, r.cost); r.status = r.margin < floorPct() ? 'floored' : 'none';
          var P = product(r.id); if (P) { P.w2 = px; P.s5 = px + CFG.k5; P.s10 = px + CFG.k10; P.saleFloor = px - CFG.haggle_baht; P.margin = mg(px, P.cost); }
          D.board.lines.forEach(function (l) { if (l.id === r.id) { l.w2 = px; l.margin = mg(px, l.cost); l.jump = px - (l.prev || 0); } });
          var sp = S.products.filter(function (p) { return p.id === r.id; })[0];
          if (sp) { sp.central_price = px; sp.central_goal = v.central.goal; sp.central_at = td; sp.central_by = role; sp.override = px;
            /* ราคาปลีก / ส่ง 5kg / 10kg ตามใบราคา AL — แก้ได้เป็นรายตัว (ว่าง = สูตร: ปลีก ⌈ทุน×markup⌉ · 5kg = 2kg−3 · 10kg = 2kg−4) */
            if (x.retail != null && x.retail !== '') { var rt = Math.round(num(x.retail)); if (rt > 0) sp.retail_override = rt === Math.ceil(r.cost * CFG.markup - 1e-9) ? null : rt; }
            if (x.s5 != null && x.s5 !== '') { var t5 = Math.round(num(x.s5)); if (t5 > 0) sp.s5_override = t5 === px + CFG.k5 ? null : t5; }
            if (x.s10 != null && x.s10 !== '') { var t10 = Math.round(num(x.s10)); if (t10 > 0) sp.s10_override = t10 === px + CFG.k10 ? null : t10; } }
          desks().forEach(function (o) { if (o === D.desk) return; o.rows.forEach(function (q) { if (q.id !== r.id) return; var qv = q.v21 || (q.v21 = {});
            var was = qv.base; qv.central = clone(v.central); qv.base = px; q.w2 = px;
            if (qv.baseApproved === false) qv.baseApproved = true; else if (qv.saved && was != null && was !== px) qv.baseChanged = true;
            if (q.cust && q.cust.source !== 'สัญญา') { q.cust.price = px + (q.cust.adjust || 0); q.margin = mg(q.cust.price, q.cost); } }); });
          recalcProduct(r.id);
          var Pt = product(r.id); v.central.tiers = { retail: Pt.retail, w2: Pt.w2, s5: Pt.s5, s10: Pt.s10 }; S.central_prices[r.id].tiers = v.central.tiers; S.price_versions[0].tiers = v.central.tiers;
        } else {
          var was2 = v.saved && v.saved.price;
          var polc = policyOf(r.grp), mst = mgState(mg(px, r.cost), polc);
          /* Customer-specific Price เริ่มจากราคากลาง (v.base) − เงื่อนไขลูกค้า · คิด margin จากทุนจริงอีกครั้ง · ต่ำกว่าเป้าได้แต่ต้องมีเหตุผล · ต่ำกว่าขั้นต่ำ = ข้อยกเว้น */
          v.saved = { price: px, goal: x.goal || body.goal || 'target', at: td, by: role, exception: String(x.exception || ''), base: v.base || null, delta: v.base ? px - v.base : null, margin: mg(px, r.cost), state: mst, stateText: MG_TEXT[mst],
            reason: String(x.exception || x.reason || '').trim() || (mst === 'below_target' ? 'Below Target — allowed (เงื่อนไขลูกค้า/ปริมาณ)' : ''), version: ((v.central || {}).version || 0) };
          S.price_versions.unshift({ kind: 'customer', customer_id: cid, product_id: r.id, name: r.name, base_price: v.base || null, price: px, cost: r.cost, margin: v.saved.margin, margin_state: mst, reason: v.saved.reason, by: role, at: stamp(), central_version: v.saved.version, policy_version: S.policy.version }); if (S.price_versions.length > 5000) S.price_versions.length = 5000;
          v.baseChanged = false; v.costChanged = false;
          r.cust = Object.assign(r.cust || { source: 'สัญญา' }, { price: px, cost: r.cost }); r.margin = mg(px, r.cost);
          var sh = sheetFor(cid), srow = sh.rows.filter(function (y) { return y.pid === r.id; })[0];
          if (!srow) { srow = { pid: r.id, name: r.name, grp: r.grp, inOffer: false, offer: null, board: px, floor: px, quoted: null, response: null, accepted: null, reconfirm: false, askWant: null, revision: null, prev: r.v21.prevCustomer || 0, hist: [], asks: [], negoCount: 0, status: 'none', request: null }; sh.rows.push(srow); }
          srow.inOffer = true; srow.offer = px; srow.board = px; srow.floor = v.guard || px; srow.status = px < (v.guard || 0) ? 'floored' : 'none';
          if (srow.response === 'accept' && srow.accepted !== px) srow.reconfirm = true;
          if (sh.handedAt && was2 != null && was2 !== px) handoffReset = true;
          var gl = D.guard.lines.filter(function (l) { return l.cid === cid && l.pid === r.id; })[0];
          if (gl) gl.locked = px;
          S.contract_lines.forEach(function (l) { if (l.customer_id === cid && l.product_id === r.id) l.price = px; });
        }
        saved++;
      });
      if (!saved && problems.length) return err(400, 'มีรายการที่ต้องแก้ ' + problems.length + ' รายการ', { problems: problems });
      if (cid) {
        var sh2 = sheetFor(cid);
        if (handoffReset) { sh2.handedAt = null; sh2.handedBy = null; var c = D.desk.customers.filter(function (x) { return x.id === cid; })[0]; if (c) c.handed = false; }
        rebuildSheet(sh2); rebuildDesk(dk); rebuildGuard();
      } else { rebuildCentralCount(); desks().forEach(function (o) { if (o !== D.desk) rebuildDesk(o); }); rebuildTotals(); D.pricelist.dirty = true; }
      audit(role, cid ? 'price-sheet' : 'central', saved + ' รายการ');
      return ok({ ok: true, saved: saved, exceptions: exc, handoffReset: handoffReset, problems: problems });
    }
    function handoff(role, body) {
      var cid = body.customer_id, c = D.desk.customers.filter(function (x) { return x.id === cid; })[0];
      if (!c) return err(404, 'ไม่พบลูกค้า');
      var sh = sheetFor(cid);
      if (!sh.rows.some(function (r) { return r.inOffer; })) return err(400, 'ยังไม่ได้ยืนยันราคาในใบของ ' + c.name + ' — บันทึกใบราคาก่อนส่ง');
      c.handed = true; sh.handedAt = stamp(); sh.handedBy = role; sh.note = body.note || '';
      rebuildSheet(sh); rebuildDesk(deskFor(cid));
      audit(role, 'handoff', c.name);
      return ok({ ok: true, customer: c.name });
    }
    function customerAdjust(role, body) {
      var cid = body.customer_id, adj = Math.round(num(body.adjust) || 0);
      if (Math.abs(adj) > 30) return err(400, 'ส่วนต่างต้องอยู่ระหว่าง −30 ถึง 30 บาท');
      var c = custOf(cid); if (!c) return err(404, 'ไม่พบลูกค้า');
      c.adjust = adj; S.customers.forEach(function (x) { if (x.id === cid) x.adjust = adj; });
      D.desk.customers.forEach(function (x) { if (x.id === cid) x.adjust = adj; });
      var dk = deskFor(cid);
      dk.customer.adjust = adj;
      dk.rows.forEach(function (r) { if (r.cust && r.cust.source !== 'สัญญา') { r.cust.adjust = adj; r.cust.source = adj ? 'ปรับรายเจ้า' : 'กลาง'; r.cust.price = r.w2 + adj; r.margin = mg(r.cust.price, r.cost); } });
      rebuildDesk(dk);
      return ok({ ok: true, adjust: adj });
    }
    function contractPrice(role, body) {
      var cid = body.customer_id, pid = body.product_id, px = Math.round(num(body.price));
      var c = custOf(cid), P = product(pid);
      if (!c) return err(404, 'ไม่พบลูกค้า'); if (!P) return err(404, 'ไม่พบสินค้า'); if (!(px > 0)) return err(400, 'ราคาต้องมากกว่า 0');
      if (P.cost > 0 && px < P.cost * 0.5) return err(400, 'ราคา ' + px + ' ฿ ต่ำกว่าครึ่งของทุน ' + P.cost + ' ฿ — น่าจะพิมพ์ผิด');
      var l = D.guard.lines.filter(function (x) { return x.cid === cid && x.pid === pid; })[0];
      if (l) { l.locked = px; if (num(body.prev) > 0) { l.prev = Math.round(num(body.prev)); if (body.prevLabel) l.prev_label = String(body.prevLabel); } }
      else D.guard.lines.unshift({ cid: cid, cust: c.name, pid: pid, name: P.name, grp: P.grp, locked: px, prev: num(body.prev) > 0 ? Math.round(num(body.prev)) : null, prev_label: body.prevLabel ? String(body.prevLabel) : null, cost: P.cost, margin: 0, verified: 1, state: 'ok', grade: 'A', belowTarget: false });
      var sl = S.contract_lines.filter(function (x) { return x.customer_id === cid && x.product_id === pid; })[0];
      if (sl) sl.price = px; else S.contract_lines.push({ customer_id: cid, product_id: pid, price: px, verified: 1, cost: P.cost, customer_name: c.name, customer_type: c.type || 'contract' });
      var dk = deskFor(cid);
      dk.rows.forEach(function (r) { if (r.id !== pid) return; r.cust = { price: px, cost: r.cost, source: 'สัญญา', locked: true }; r.margin = mg(px, r.cost);
        var v = r.v21 || (r.v21 = {}); if (v.baseApproved == null) { v.baseApproved = !!(v.central && v.central.state === 'approved'); v.saved = null; v.baseChanged = false; v.costChanged = false; } v.prevCustomer = px; });
      var sh = sheetFor(cid), sr = sh.rows.filter(function (r) { return r.pid === pid; })[0];
      var pv = num(body.prev) > 0 ? Math.round(num(body.prev)) : null;   /* ราคารอบก่อนจากใบลูกค้า (ถ้ามี) — ใช้เป็น "ราคาขายรอบก่อน" ของเจ้านี้ */
      if (sr) { sr.board = px; sr.prev = pv || sr.prev || px; if (pv && body.prevLabel) sr.hist = [{ label: body.prevLabel, price: pv }].concat((sr.hist || []).filter(function (h) { return h.label !== body.prevLabel; })); } else sh.rows.push({ pid: pid, name: P.name, grp: P.grp, inOffer: false, offer: null, board: px, floor: px, quoted: null, response: null, accepted: null, reconfirm: false, askWant: null, revision: null, prev: pv || px, hist: [], asks: [], negoCount: 0, status: 'none', request: null });
      rebuildGuard(); rebuildDesk(dk); rebuildSheet(sh);
      audit(role, 'contract-price', c.name + ' · ' + P.name + ' ' + px);
      return ok({ ok: true, margin: mg(px, P.cost) });
    }
    function addCustomer(role, body) {
      var name = String(body.name || '').trim(); if (!name) return err(400, 'ต้องมีชื่อลูกค้า');
      if (custByName(name)) return err(400, 'มีลูกค้าชื่อนี้อยู่แล้ว');
      var id = hashId('c', name + Date.now()), type = body.type || 'contract', tier = body.tier || 'w2';
      D.guard.customers.push({ id: id, name: name, type: type, tier: tier, adjust: 0, n: 0, low: 0, loss: 0, mgSum: 0, verified: 0, margin: null, allVerified: true, grade: '—', belowTarget: 0 });
      S.customers.push({ id: id, name: name, type: type, tier: tier, owner: body.owner || '', haggles: 0, contact: body.contact || '', note: body.note || '', active: 1, adjust: 0 });
      D.desk.customers.push({ id: id, name: name, type: type, adjust: 0, contractItems: 0, lines: 0, work: 0, low: 0, priced: 0, handed: false, gateMissing: 0, gateStale: 0, margin: null });
      D.sends.customers.push({ id: id, name: name, lines: 0, sentAt: null, sentBy: null, handedAt: null, quoted: 0, waiting: 0, accepted: 0, declined: 0, revised: 0, offerLines: 0, invoiced: 0, linked: false, opened: null });
      desks().forEach(function (o) { if (o !== D.desk) o.customers = clone(D.desk.customers); });
      rebuildGuard(); rebuildSends();
      audit(role, 'customer', name);
      return ok({ ok: true, id: id, name: name });
    }
    function costs(role, body) {
      var src = body.source || 'กรอกในหน้าเว็บ', n = 0;
      if (body.shift != null) {
        var sh = num(body.shift); if (!sh) return err(400, 'ใส่ตัวเลขที่ไม่ใช่ศูนย์');
        var nocost = 0;
        D.pricelist.rows.slice().forEach(function (r) { if (r.cost > 0) { setCost(r.id, Math.max(0, r.cost + sh), 'ปรับทุกตัว ' + (sh > 0 ? '+' : '') + sh, role); n++; } else nocost++; });
        rebuildGuard(); rebuildTotals(); rebuildCentralCount(); audit(role, 'costs', 'ปรับทุกตัว ' + sh);
        return ok({ ok: true, shifted: n, nocost: nocost });
      }
      var items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return err(400, 'ไม่มีรายการทุน');
      /* กรอกมือ/วาง = Cost Import Batch เหมือนไฟล์: จับคู่ด้วย product_id · ตรวจทุนแปลกด้วยด่านเดียวกัน · ผิดปกติ → Review Queue ไม่ทับทุนทันที */
      var r = EXT.importCosts(role, { rows: items.map(function (it) { return { product_id: it.id, cost: it.cost, unit: it.unit }; }), commit: true, source: src, channel: body.channel || 'manual' });
      if (r.status !== 200) return r;
      return ok({ ok: true, saved: r.body.applied || 0, review: r.body.flagged || 0, failed: (r.body.problems || []).map(function (p) { return p.name || p.row; }), batch_id: r.body.batch_id, flags: r.body.flags });
    }
    function productUpdate(role, pid, body) {
      var P = product(pid); if (!P) return err(404, 'ไม่พบสินค้า');
      if (body.vol_week != null) {
        var v = num(body.vol_week); if (v == null || v < 0) return err(400, 'ปริมาณต้องเป็นตัวเลข');
        D.board.lines.forEach(function (l) { if (l.id === pid) l.vol = v; });
        desks().forEach(function (d) { d.rows.forEach(function (r) { if (r.id === pid) r.vol = v; }); });
        S.products.forEach(function (p) { if (p.id === pid) p.vol_week = v; });
        catItemDocs().forEach(function (c) { c.items.forEach(function (it) { if (it.id === pid) it.vol = v; }); });
        D.brain.evidence.blind.forEach(function (b) { if (b.id === pid) { b.vol = v; b.revenue = Math.round(v * b.w2); } });
        rebuildTotals();
      }
      if (body.name) { P.name = String(body.name); }
      return ok();
    }
    function addProduct(role, body) {
      var name = String(body.name || '').trim(); if (!name) return err(400, 'ต้องมีชื่อสินค้า');
      var grp = body.grp || 'อื่นๆ', cost = num(body.cost) || 0, add = num(body.add_baht) == null ? 15 : num(body.add_baht);
      var id = hashId('p', name + Date.now()), td = today(), tt = tiersOf({ add_baht: add }, cost), w2 = tt.w2;
      var marks = D.pricelist.comps.map(function (c) { return { id: c.id, label: c.label, tier: c.tier, price: 0, state: 'none' }; });
      D.pricelist.rows.push({ id: id, name: name, grp: grp, retail: tt.retail, w2: w2, s5: tt.s5, s10: tt.s10, saleFloor: w2 ? w2 - CFG.haggle_baht : 0, marks: clone(marks), pos: 'none', gap: null, cost: cost, margin: mg(w2, cost), costSrc: cost ? 'กรอกในหน้าเว็บ' : '', costSrcAt: cost ? td : '' });
      var g = D.pricelist.grps.filter(function (x) { return x.grp === grp; })[0]; if (g) g.n++; else D.pricelist.grps.push({ grp: grp, n: 1 });
      D.board.lines.push({ id: id, name: name, grp: grp, w2: w2, cost: cost, margin: mg(w2, cost), cheapest: 0, prev: 0, jump: 0, status: cost ? 'none' : 'nocost', vol: 0, okMarket: null, okMargin: cost ? mg(w2, cost) >= floorPct() : false, okMove: false });
      S.products.push({ id: id, name: name, spec: String(body.spec || ''), grp: grp, cost: cost, prev_cost: cost, add_baht: add, markup: 0, vol_week: 0, watch: 0, override: 0, active: 1, sort: 0, cost_src: String(body.cost_src || ''), cost_src_at: td, central_price: null, central_goal: null, central_at: null, central_by: null, central_exception: null, central_cost_at: null });
      desks().forEach(function (d) {
        var guard = cost ? floorPrice(cost, targetPct()) : 0;
        var row = { id: id, name: name, spec: '', grp: grp, vol: 0, cust: null, hist: null, cost: cost, boardCost: cost, costPrev: cost, costJump: 0, costBasis: 'central', w2: w2, prev: 0, jump: 0, margin: mg(w2, cost), floorPrice: cost ? floorPrice(cost, floorPct()) : 0, saleFloor: w2 ? w2 - CFG.haggle_baht : 0,
          status: cost ? 'none' : 'nocost', auto: w2, override: 0, marks: clone(marks), cheapest: null, usingStale: false, safeLow: cost ? floorPrice(cost, floorPct()) : 0, safeHigh: 0,
          v21: { category: { key: 'other', name: 'สินค้าอื่น', floor: targetPct(), target: targetPct() }, market: { median: 0, low: 0, high: 0, n: 0, rows: [], method: 'MEDIAN' }, central: null, auto: w2, guard: guard, target: guard, effectivePct: targetPct(), targetPct: targetPct(),
            goals: cost ? { competitive: { disabled: true, reason: 'ไม่มีข้อมูลตลาด', why: 'ไม่มีข้อมูลตลาด' }, hold: { price: w2, rawResult: w2, margin: mg(w2, cost), why: 'สินค้าใหม่ ยังไม่มีราคารอบก่อน', belowFloor: w2 < guard, floorPrice: guard, basis: 'none', prev: 0 },
              target: { price: guard, rawResult: guard, margin: mg(guard, cost), why: 'ทุน ÷ (1 − ' + targetPct() + '%) = ' + guard + ' ฿', equalProtect: true }, protect: { price: guard, rawResult: guard, margin: mg(guard, cost), why: 'ทุน ÷ (1 − ' + targetPct() + '%) = ' + guard + ' ฿' } } : null,
            roundInc: 1, costUpdated: td, policyVersion: 'V29' } };
        if (d.customer) { row.cust = { price: w2 + (d.customer.adjust || 0), cost: cost, source: d.customer.adjust ? 'ปรับรายเจ้า' : 'กลาง', adjust: d.customer.adjust || 0 }; row.hist = { list: [], last: 0, lastMargin: null, prevMargin: null, keepPrice: 0, suggest: w2, squeezed: false, opts: { market: null, keep: null, mid: null } }; }
        d.rows.push(row); d.totals.count = d.rows.length;
      });
      var ci = D['category-items:other']; if (ci) ci.items.push({ id: id, name: name, grp: grp, cost: cost, price: w2, vol: 0, margin: mg(w2, cost), target: ci.catFloor, catTarget: ci.catFloor, effective: ci.catFloor, guard: cost ? floorPrice(cost, ci.catFloor) : 0, itemTarget: false, floor: ci.catFloor, moved: false, priceBasis: 'ราคาร่าง' });
      ensurePolicy(); ensureCostMaster(); recalcProduct(id);
      rebuildTotals(); rebuildCentralCount(); audit(role, 'product', name);
      return ok({ ok: true, id: id });
    }
    function competitorPrices(role, body) {
      var items = Array.isArray(body.items) ? body.items : [], td = today(), n = 0;
      items.forEach(function (it) {
        var px = Math.round(num(it.price) || 0), cid = it.competitor_id;
        var apply = function (marks) { (marks || []).forEach(function (m) { if (m.id !== cid) return; m.price = px; m.state = px ? 'fresh' : 'none'; m.age = px ? 0 : undefined; m.seen = px ? td : undefined; }); };
        var P = product(it.product_id); if (!P) return; n++;
        apply(P.marks);
        var fresh = P.marks.filter(function (m) { return m.price > 0 && m.state === 'fresh'; }).map(function (m) { return m.price; });
        var cheapest = fresh.length ? Math.min.apply(null, fresh) : 0;
        P.gap = cheapest ? P.w2 - cheapest : null; P.pos = !cheapest ? 'none' : P.w2 > cheapest ? 'over' : P.w2 < cheapest ? 'under' : 'same';
        D.board.lines.forEach(function (l) { if (l.id === P.id) { l.cheapest = cheapest; l.okMarket = cheapest ? l.w2 <= cheapest : null; } });
        desks().forEach(function (d) { d.rows.forEach(function (r) { if (r.id !== P.id) return; apply(r.marks); r.cheapest = cheapest ? { price: cheapest, stale: false } : null; r.usingStale = false; }); });
        recalcProduct(P.id);   /* ตลาดเปลี่ยน → คิด Competitive/แนะนำใหม่ทุกใบ */
        D.brain.evidence.blind = D.brain.evidence.blind.filter(function (b) { return !(b.id === P.id && cheapest); });
        var mk = D.market, gap = mk.gaps.filter(function (g) { return g.id === P.id; })[0];
        if (gap) { gap.cheapest = cheapest; gap.blind = !cheapest; gap.cells = gap.cells || {}; gap.cells[cid] = { price: px, seen: td, age: 0 }; }
      });
      D.market.totals.known = D.pricelist.rows.filter(function (r) { return (r.marks || []).some(function (m) { return m.price > 0; }); }).length;
      D.market.totals.usable = D.pricelist.rows.filter(function (r) { return (r.marks || []).some(function (m) { return m.price > 0 && m.state === 'fresh'; }); }).length;
      D.market.totals.blind = D.market.totals.n - D.market.totals.known;
      D.brain.now.blind = D.pricelist.rows.length - D.market.totals.usable; D.brain.now.rated = D.market.totals.usable;
      D.market.competitors.forEach(function (c) { c.have = D.pricelist.rows.filter(function (r) { return r.marks.some(function (m) { return m.id === c.id && m.price > 0; }); }).length; c.fresh = D.pricelist.rows.filter(function (r) { return r.marks.some(function (m) { return m.id === c.id && m.price > 0 && m.state === 'fresh'; }); }).length; });
      audit(role, 'competitor-prices', n + ' รายการ');
      return ok({ ok: true, saved: n });
    }
    function config(role, body) {
      var changed = [];
      if (body.survey_max_sku != null) { var smx = Math.max(5, Math.min(40, Math.round(num(body.survey_max_sku)) || 15)); CFG.survey_max_sku = smx; changed.push('survey_max_sku'); }
      if (body.survey_mode != null) { CFG.survey_mode = !!body.survey_mode && body.survey_mode !== '0' && body.survey_mode !== 'false'; changed.push('survey_mode'); audit(role, 'config', 'โหมดสำรวจหน้าร้าน ' + (CFG.survey_mode ? 'เปิด' : 'ปิด')); }
      if (Array.isArray(body.competitors)) {
        body.competitors.forEach(function (c) { D.pricelist.comps.forEach(function (x) { if (x.id === c.id) { x.label = c.label || x.label; x.tier = c.tier || x.tier; x.source = c.source || ''; } });
          S.competitors.forEach(function (x) { if (x.id === c.id) { x.label = c.label || x.label; x.source = c.source || ''; } }); });
        changed.push('competitors');
      }
      ['floor_pct', 'target_pct', 'haggle_baht', 'market_ttl_days', 'markup', 'k5', 'k10', 'jump_baht', 'jump_pct', 'stale_days', 'market_window_days'].forEach(function (k) {
        if (body[k] == null || body[k] === '') return; var v = num(body[k]); if (v == null) return;
        if (k === 'floor_pct' && v < 12) throw { status: 400, body: { error: 'กำไรขั้นต่ำต้องไม่ต่ำกว่า 12%' } };
        CFG[k] = v; changed.push(k);
      });
      var fp = floorPct(), tp = targetPct();
      D.brain.control.floor_pct = fp; D.brain.control.markup = CFG.markup; D.brain.control.k5 = CFG.k5; D.brain.control.k10 = CFG.k10; D.brain.control.stale_days = CFG.stale_days || D.brain.control.stale_days;
      D.pricelist.haggle = CFG.haggle_baht; D.pricelist.ttlDays = CFG.market_ttl_days; D.review.floorPct = fp; D.review.targetPct = tp; D.review.ttlDays = CFG.market_ttl_days;
      D['category-guard'].floorPct = fp; D.market.ttl_days = CFG.market_ttl_days;
      desks().forEach(function (d) { d.floorPct = fp; d.ttlDays = CFG.market_ttl_days; d.haggle = CFG.haggle_baht; d.rows.forEach(function (r) { r.saleFloor = r.w2 - CFG.haggle_baht; if (r.cost > 0) { r.floorPrice = floorPrice(r.cost, fp); r.safeLow = r.floorPrice; } }); });
      D.pricelist.rows.forEach(function (r) { r.saleFloor = r.w2 - CFG.haggle_baht; });
      D.board.floor = fp; D.board.lines.forEach(function (l) { l.okMargin = l.margin >= fp; });
      rebuildGuard(); audit(role, 'config', changed.join(','));
      return ok({ ok: true, changed: changed });
    }
    function categoryTargets(role, body) { return err(410, 'เป้า margin ตั้งรายกลุ่มสินค้าแล้ว — ใช้ /api/policy (Target / Minimum ต่อกลุ่ม)'); }
    function skuCategory(role, body) { return err(410, 'สินค้าผูกกับกลุ่มสินค้าในใบราคา AL — เป้า margin แก้รายกลุ่มที่ /api/policy'); }
    function priceRequest(role, body) {
      var cid = body.customer_id, pid = body.product_id, want = Math.round(num(body.want));
      var sh = sheetFor(cid), c = custOf(cid), P = product(pid); if (!sh || !c) return err(404, 'ไม่พบลูกค้า'); if (!P) return err(404, 'ไม่พบสินค้า');
      if (!(want > 0)) return err(400, 'ราคาที่ขอต้องมากกว่า 0');
      var row = sh.rows.filter(function (r) { return r.pid === pid; })[0];
      if (!row) return err(400, 'สินค้านี้ไม่อยู่ในสัญญาของ ' + c.name);
      if (row.request && row.request.status === 'open') return err(400, 'มีคำขอของรายการนี้รอ Pricing อยู่แล้ว');
      var cur = row.offer != null ? row.offer : row.board;
      if (want >= cur) return err(400, 'ราคาที่ขอ ' + want + ' ฿ ไม่ต่ำกว่าราคาที่เสนอ ' + cur + ' ฿ — ยืนยันราคาปัจจุบันได้เลย');
      var id = ++seq.req, at = stamp(), round = D['price-requests'].rows.filter(function (r) { return r.customer_id === cid && r.product_id === pid && r.label === sh.label; }).length + 1;   /* รอบต่อรองของ SKU นี้ในรอบราคานี้ */
      var rq = { id: id, customer_id: cid, product_id: pid, label: sh.label, round: round, sales_id: CUR_REP, want: want, floor_at: row.floor || cur, reason: body.reason || '', by_role: role, at: at, status: 'open', decided_by: null, decided_at: null, decided_note: null,
        final_price: null, supplier_cost_target: null, original_price: cur, source: 'sale', exception: '', rev: 1, cust: c.name, product: P.name, cprice: cur };
      rq.last_at = at; rq.stage = 'new';
      D['price-requests'].rows.unshift(rq); D['price-requests'].open++;
      EXT.alert('warn', 'ลูกค้าต่อรองกลับ · ' + c.name, P.name + ' เสนอ ' + cur + ' ฿ → ขอ ' + want + ' ฿' + (body.reason ? ' · "' + body.reason + '"' : '') + ' — ต้องออกราคาใหม่/ต่อรองโรงงาน', 'negotiation');
      D.sends.negotiations.unshift({ id: id, customer_id: cid, customer: c.name, product_id: pid, product: P.name, want: want, original_price: cur, final_price: null, status: 'open', reason: rq.reason, at: at, source: 'sale' });
      row.request = { id: id, status: 'open', want: want, note: null, final_price: null, rev: 1 }; row.asks.unshift({ label: sh.label, want: want, status: 'open' }); row.negoCount = (row.negoCount || 0) + 1; row.response = 'nego'; row.askWant = want;
      rebuildSheet(sh);
      S.customers.forEach(function (x) { if (x.id === cid) x.haggles = (x.haggles || 0) + 1; });
      return ok({ ok: true, id: id });
    }
    /* ══ แจ้งเตือนต่อรองราคา — trigger: ลูกค้าต่อรองกลับจากใบที่เซลส่ง · ผู้รับ: เซลเจ้าของ + คนตั้งราคา · ปิดเรื่องเมื่อส่งใบแก้ไขให้ลูกค้าแล้ว ══ */
    var STAGE_TEXT = { 'new': 'ใหม่ · รอ Pricing ตัดสิน', supplier: 'กำลังต่อรองกับโรงงาน', decided: 'Pricing ตัดสินแล้ว · รอส่งใบราคาแก้ไขให้ลูกค้า', cancelled: 'ลูกค้ายกเลิก' };
    function closeNegotiations(cid, role, how) {
      var n = 0, at = stamp();
      D['price-requests'].rows.forEach(function (rq) { if (rq.customer_id === cid && rq.status !== 'open' && !rq.closed) { rq.closed = true; rq.closed_at = at; rq.closed_by = role; rq.closed_how = how || 'sent'; rq.last_at = at; n++; } });
      D.sends.negotiations.forEach(function (x) { if (x.customer_id === cid && x.status !== 'open' && !x.closed) { x.closed = true; x.closed_at = at; } });
      if (n) audit(role, 'negotiation-close', (custOf(cid) || {}).name + ' · ส่งใบแก้ไขแล้ว ปิด ' + n + ' เรื่อง');
      return n;
    }
    function negotiationsView(role) {
      var td = today();
      var items = D['price-requests'].rows.filter(function (rq) { return !rq.closed; }).map(function (rq) {
        var last = String(rq.last_at || rq.decided_at || rq.at).slice(0, 10), age = Math.max(0, Math.floor((Date.parse(td) - Date.parse(last)) / 864e5));
        var stage = rq.status === 'open' ? (rq.stage === 'supplier' ? 'supplier' : 'new') : rq.status === 'cancelled' ? 'cancelled' : 'decided';
        return { id: rq.id, customer_id: rq.customer_id, cust: rq.cust, product_id: rq.product_id, product: rq.product, offered: rq.original_price || rq.cprice || null, want: rq.want, final_price: rq.final_price, status: rq.status, stage: stage, stageText: STAGE_TEXT[stage], at: rq.at, last_at: rq.last_at || rq.decided_at || rq.at, age: age, stale: age >= 7, reason: rq.reason, source: rq.source, note: rq.decided_note || '', rev: rq.rev };
      });
      return { items: items, total: items.length, open: items.filter(function (i) { return i.stage === 'new' || i.stage === 'supplier'; }).length, decided: items.filter(function (i) { return i.stage === 'decided'; }).length, stale: items.filter(function (i) { return i.stale; }).length, staleDays: 7, stageText: STAGE_TEXT };
    }
    function requestStatus(role, body) {
      var rq = D['price-requests'].rows.filter(function (r) { return r.id === Number(body.id); })[0]; if (!rq) return err(404, 'ไม่พบคำขอ');
      var st = body.status, at = stamp(), note = String(body.note || '').trim();
      if (st === 'supplier') { if (rq.status !== 'open') return err(400, 'คำขอนี้ตัดสินไปแล้ว'); rq.stage = 'supplier'; rq.last_at = at; rq.supplier_note = note; }
      else if (st === 'cancelled') { rq.status = 'cancelled'; rq.closed = true; rq.closed_at = at; rq.closed_by = role; rq.closed_how = 'customer_cancelled'; rq.last_at = at; rq.decided_note = note || 'ลูกค้ายกเลิก'; D['price-requests'].open = D['price-requests'].rows.filter(function (r) { return r.status === 'open'; }).length;
        D.sends.negotiations.forEach(function (x) { if (x.id === rq.id) { x.status = 'cancelled'; x.closed = true; x.closed_at = at; } });
        var sh = sheetFor(rq.customer_id), row = sh && sh.rows.filter(function (r) { return r.pid === rq.product_id; })[0]; if (row && row.request && row.request.id === rq.id) { row.request.status = 'cancelled'; row.response = null; row.askWant = null; rebuildSheet(sh); } }
      else if (st === 'closed') { rq.closed = true; rq.closed_at = at; rq.closed_by = role; rq.closed_how = 'manual'; rq.last_at = at; }
      else return err(400, 'status ต้องเป็น supplier / cancelled / closed');
      audit(role, 'negotiation', rq.cust + ' · ' + rq.product + ' → ' + (STAGE_TEXT[st === 'supplier' ? 'supplier' : st === 'cancelled' ? 'cancelled' : 'decided']) + (note ? ' · ' + note : ''));
      return ok({ ok: true, status: rq.status, stage: rq.stage || null, closed: !!rq.closed });
    }
    function priceDecide(role, body) {
      var rq = D['price-requests'].rows.filter(function (r) { return r.id === Number(body.id); })[0];
      if (!rq) return err(404, 'ไม่พบคำขอ');
      if (body.seen_rev != null && Number(body.seen_rev) !== rq.rev) return err(409, 'คำขอนี้เพิ่งเปลี่ยน — โหลดใหม่แล้วตัดสินอีกครั้ง', { reload: true, changed: true });
      if (rq.status !== 'open') return err(400, 'คำขอนี้ตัดสินไปแล้ว', { reload: true });
      var approve = !!body.approve, fp = approve ? Math.round(num(body.final_price) || rq.want) : null;
      var P = product(rq.product_id);
      if (approve && P && P.cost > 0 && fp < P.cost && !body.exception) return err(400, 'ราคา ' + fp + ' ฿ ต่ำกว่าทุน ' + P.cost + ' ฿ — ติ๊ก "ข้อยกเว้น" ถ้าตั้งใจ');
      rq.status = approve ? 'ok' : 'no'; rq.decided_by = role; rq.decided_at = stamp(); rq.last_at = rq.decided_at; rq.decided_note = body.note || ''; rq.final_price = fp;
      rq.supplier_cost_target = body.supplier_cost_target == null ? null : num(body.supplier_cost_target); rq.exception = body.exception ? 'yes' : ''; rq.rev++;
      D['price-requests'].open = D['price-requests'].rows.filter(function (r) { return r.status === 'open'; }).length;
      D.sends.negotiations.forEach(function (n) { if (n.id === rq.id) { n.status = rq.status; n.final_price = fp; } });
      var sh = sheetFor(rq.customer_id), row = sh && sh.rows.filter(function (r) { return r.pid === rq.product_id; })[0];
      if (row) {
        row.request = { id: rq.id, status: rq.status, want: rq.want, note: rq.decided_note, final_price: fp, rev: rq.rev };
        row.asks.forEach(function (a) { if (a.status === 'open') a.status = rq.status; });
        if (approve) { row.revision = fp; row.offer = fp; row.inOffer = true; row.response = null; row.askWant = null; row.quoted = null; }
        else { row.response = null; row.askWant = null; }
        rebuildSheet(sh);
      }
      var dk = deskFor(rq.customer_id);
      if (approve && dk) dk.rows.forEach(function (r) { if (r.id === rq.product_id && r.cust) { r.cust.price = fp; r.margin = mg(fp, r.cost); if (r.v21 && r.v21.saved) r.v21.saved.price = fp; } });
      audit(role, 'price-decide', rq.cust + ' · ' + rq.product + ' → ' + (approve ? fp + ' ฿' : 'ไม่ลด'));
      return ok({ ok: true, status: rq.status, final_price: fp });
    }
    function quoted(role, body) {
      var sh = sheetFor(body.customer_id); if (!sh) return err(404, 'ไม่พบลูกค้า');
      var n = 0;
      var apply = function (r, px) {
        if (!r.inOffer) throw { status: 400, body: { error: 'รายการ ' + r.name + ' ยังไม่อยู่ในใบที่ Pricing ยืนยัน' } };
        if (r.request && r.request.status === 'open') return false;
        var allowed = r.offer;
        if (px != null && Math.round(px) !== allowed) throw { status: 400, body: { error: 'เซลล์แก้ราคาเองไม่ได้ — ' + r.name + ' ราคาที่ Pricing อนุมัติคือ ' + allowed + ' ฿ (ถ้าลูกค้าขอลด ส่งคำขอกลับ Pricing)' } };
        r.quoted = allowed; n++; return true;
      };
      if (body.all) sh.rows.forEach(function (r) { if (r.inOffer && r.quoted == null) apply(r, null); });
      else { var r = sh.rows.filter(function (x) { return x.pid === body.product_id; })[0]; if (!r) return err(404, 'ไม่พบสินค้าในใบ'); apply(r, num(body.price)); }
      rebuildSheet(sh);
      return ok({ ok: true, added: n });
    }
    function quoteSent(role, body) {
      var cid = body.customer_id, c = sendRow(cid), sh = sheetFor(cid); if (!c || !sh) return err(404, 'ไม่พบลูกค้า');
      if (body.undo) { c.sentAt = null; c.sentBy = null; sh.sent = false; }
      else {
        if (!sh.rows.some(function (r) { return r.inOffer; })) return err(400, 'ใบของ ' + c.name + ' ยังไม่มีราคาที่ Pricing ยืนยัน — ส่งไม่ได้');
        if (body.label && body.label !== sh.label) return err(409, 'ใบที่เห็นเป็นรอบ ' + body.label + ' แต่รอบปัจจุบันคือ ' + sh.label + ' — โหลดใหม่', { reload: true });
        if (!sh.link) quoteLink(role, { customer_id: cid, silent: true }, body.origin || '');   /* ส่งเองก็ต้องมีลิงก์ให้ลูกค้ากดยืนยัน/ต่อรอง */
        if (EXT && EXT.markSent) EXT.markSent(cid, body.channel || 'manual', role);   /* นับเป็นส่งจริง: Quote V+1 · SLA เริ่ม · log รูปแบบเดียวกับ LINE */
        else { c.sentAt = stamp(); c.sentBy = role; c.channel = body.channel || 'manual'; sh.sent = true; sh.sentAt = c.sentAt; closeNegotiations(cid, role, c.channel); }
      }
      rebuildSheet(sh);
      return ok({ ok: true, sent: !body.undo, pending: D.sends.pending });
    }
    function quoteResponse(role, body) {
      var sh = sheetFor(body.customer_id); if (!sh) return err(404, 'ไม่พบลูกค้า');
      if (!sh.sent) return err(400, 'ยังไม่ได้บันทึกว่าส่งใบให้ลูกค้า — กด "ส่งแล้ว" ก่อน');
      if (body.label && body.label !== sh.label) return err(409, 'รอบเปลี่ยนแล้ว — โหลดใหม่', { reload: true });
      var n = 0, skipped = 0, kind = body.kind;
      var apply = function (r, px) {
        if (!r.inOffer || (r.request && r.request.status === 'open')) { skipped++; return; }
        if (kind === 'accept') { if (px != null && Math.round(px) !== r.offer) { skipped++; return; } r.response = 'accept'; r.accepted = r.offer; r.reconfirm = false; r.askWant = null; if (r.quoted == null) r.quoted = r.offer; }
        else if (kind === 'decline') { r.response = 'decline'; r.accepted = null; }
        else if (kind === 'nego') { r.response = 'nego'; r.askWant = Math.round(num(body.want) || 0) || null; }
        else throw { status: 400, body: { error: 'ไม่รู้จักคำตอบ ' + kind } };
        n++;
        /* ลูกค้าตอบรายการที่ Pricing ตัดสินราคาต่อรองแล้ว (ในลิงก์) = เรื่องต่อรองนั้นจบ ไม่ต้องรอเซลล์ส่งซ้ำ */
        if ((kind === 'accept' || kind === 'decline') && r.request && r.request.status !== 'open') { var rqc = D['price-requests'].rows.filter(function (x) { return x.id === r.request.id; })[0]; if (rqc && !rqc.closed) { rqc.closed = true; rqc.closed_at = stamp(); rqc.closed_by = role; rqc.closed_how = 'customer-' + kind; rqc.last_at = rqc.closed_at; } D.sends.negotiations.forEach(function (x) { if (x.id === r.request.id && !x.closed) { x.closed = true; x.closed_at = stamp(); } }); }
      };
      if (body.all) { var seen = {}; (body.seen || []).forEach(function (s) { seen[s.p] = s.price; }); sh.rows.forEach(function (r) { if (r.inOffer && !r.response && !(r.request && r.request.status === 'open')) apply(r, body.seen ? seen[r.pid] : null); }); }
      else { var r = sh.rows.filter(function (x) { return x.pid === body.product_id; })[0]; if (!r) return err(404, 'ไม่พบสินค้าในใบ'); apply(r, body.price); if (!n) return err(400, 'บันทึกไม่ได้ — ราคาเพิ่งเปลี่ยน โหลดใหม่', { reload: true }); }
      rebuildSheet(sh);
      return ok({ ok: true, n: n, skipped: skipped });
    }
    function recordInvoice(role, cid, invoice_no, date, lines, opts2) {
      opts2 = opts2 || {};
      var sh = sheetFor(cid), c = custOf(cid); if (!sh || !c) return { error: 'ไม่พบลูกค้า' };
      var INV = D.invoices, AR = D.ar;
      if (INV.invoices.some(function (i) { return i.id === invoice_no; })) return { error: 'เลขที่ ' + invoice_no + ' มีอยู่แล้ว', duplicate: true };
      var kg = 0, net = 0, gp = 0, out = [];
      lines.forEach(function (l) {
        var row = sh.rows.filter(function (r) { return r.pid === l.product_id; })[0], P = product(l.product_id);
        var q = num(l.qty_kg) || 0; if (!(q > 0) || !P) return;
        var px = l.price != null ? num(l.price) : row ? (row.accepted != null ? row.accepted : row.offer != null ? row.offer : row.board) : P.w2;
        var cost = P.cost || 0;
        kg += q; net += q * px; gp += q * (px - cost);
        out.push({ product_id: P.id, name: P.name, grp: P.grp, qty_kg: q, price: px, cost: cost, amount: q * px });
      });
      if (!out.length) return { error: 'ไม่มีบรรทัดที่บันทึกได้' };
      net = Math.round(net); gp = Math.round(gp);
      var due = opts2.due_date || (function () { var d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10); })();
      var inv = { id: invoice_no, customer_id: cid, customer: c.name, date: date, label: sh.label, kg: Math.round(kg * 10) / 10, net: net, gp: gp, margin: net ? r1(gp / net * 100) : 0, lines: out, source: opts2.source || 'sales-capture', due: due, paid: 0, by: role, at: stamp() };
      INV.invoices.unshift(inv); seq.inv++;
      sh.invoices.push({ id: invoice_no, date: date, kg: inv.kg, net: net });
      /* สรุป YTD · รายเดือน · รายสินค้า · รายลูกค้า */
      var yr = String(date).slice(0, 4); INV.year = yr;
      var ys = INV.invoices.filter(function (i) { return String(i.date).slice(0, 4) === yr; });
      var sum = function (a, k) { return a.reduce(function (s, i) { return s + (i[k] || 0); }, 0); };
      INV.ytd = { revenue: sum(ys, 'net'), gp: sum(ys, 'gp'), kg: Math.round(sum(ys, 'kg') * 10) / 10, invoices: ys.length, margin: sum(ys, 'net') ? r1(sum(ys, 'gp') / sum(ys, 'net') * 100) : 0 };
      var mo = {}, sk = {}, cu = {};
      ys.forEach(function (i) {
        var m = String(i.date).slice(0, 7); mo[m] = mo[m] || { m: m, revenue: 0, gp: 0, kg: 0, n: 0 }; mo[m].revenue += i.net; mo[m].gp += i.gp; mo[m].kg += i.kg; mo[m].n++;
        cu[i.customer] = cu[i.customer] || { name: i.customer, revenue: 0, gp: 0, kg: 0, n: 0 }; cu[i.customer].revenue += i.net; cu[i.customer].gp += i.gp; cu[i.customer].kg += i.kg; cu[i.customer].n++;
        i.lines.forEach(function (l) { sk[l.product_id] = sk[l.product_id] || { id: l.product_id, name: l.name, grp: l.grp, kg: 0, revenue: 0, gp: 0 }; sk[l.product_id].kg += l.qty_kg; sk[l.product_id].revenue += l.amount; sk[l.product_id].gp += l.qty_kg * (l.price - l.cost); });
      });
      INV.months = Object.keys(mo).sort().reverse().map(function (k) { return mo[k]; });
      INV.sku = Object.keys(sk).map(function (k) { var x = sk[k]; x.margin = x.revenue ? r1(x.gp / x.revenue * 100) : 0; x.revenue = Math.round(x.revenue); x.gp = Math.round(x.gp); return x; }).sort(function (a, b) { return b.revenue - a.revenue; });
      INV.customers = Object.keys(cu).map(function (k) { var x = cu[k]; x.margin = x.revenue ? r1(x.gp / x.revenue * 100) : 0; return x; }).sort(function (a, b) { return b.revenue - a.revenue; });
      rebuildAR();
      if (opts2.paid_amount) payment(role, { invoice_id: invoice_no, amount: opts2.paid_amount, paid_on: opts2.paid_date || date, ref: 'import:' + invoice_no });
      rebuildSheet(sh);
      return { id: invoice_no, total_kg: inv.kg, net_sales: net, gp: gp };
    }
    function rebuildAR() {
      var AR = D.ar, td = today(), open = [];
      var due = 0, collected = 0, outstanding = 0, overdue = 0, received = 0, short = 0, aging = { '1–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
      D.invoices.invoices.forEach(function (i) {
        var left = Math.max(0, i.net - (i.paid || 0)), late = left > 0 && i.due < td;
        received += i.paid || 0;
        if (i.due <= td) { due += i.net; collected += Math.min(i.paid || 0, i.net); }
        if (left > 0) { outstanding += left; open.push({ id: i.id, customer: i.customer, date: i.date, due: i.due, net: i.net, paid: i.paid || 0, left: left, late: late }); }
        if (late) { overdue += left; var days = Math.round((Date.parse(td) - Date.parse(i.due)) / 864e5); aging[days <= 30 ? '1–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '90+'] += left; }
        if ((i.paid || 0) > 0 && left > 0) short++;
      });
      AR.due = due; AR.collected = collected; AR.collectPct = due ? Math.round(collected / due * 100) : null; AR.outstanding = outstanding; AR.overdue = overdue; AR.shortPaid = short;
      AR.openInvoices = open.length; AR.received = received; AR.invoices = D.invoices.invoices.length; AR.open = open.sort(function (a, b) { return a.due < b.due ? -1 : 1; }); AR.today = td;
      AR.aging = Object.keys(aging).map(function (b) { return { b: b, amt: aging[b] }; });
    }
    function payment(role, body) {
      var inv = D.invoices.invoices.filter(function (i) { return i.id === body.invoice_id; })[0]; if (!inv) return err(404, 'ไม่พบใบแจ้งหนี้');
      var amt = num(body.amount); if (!(amt > 0)) return err(400, 'ยอดที่รับต้องมากกว่า 0');
      inv.payments = inv.payments || [];
      if (body.ref && inv.payments.some(function (p) { return p.ref === body.ref; })) return ok({ ok: true, dup: true });
      inv.payments.push({ amount: amt, paid_on: body.paid_on || today(), ref: body.ref || '', by: role });
      inv.paid = inv.payments.reduce(function (a, p) { return a + p.amount; }, 0);
      D.ar.payments = (D.ar.payments || 0) + 1;
      rebuildAR();
      return ok({ ok: true, left: Math.max(0, inv.net - inv.paid) });
    }
    function invoicesPost(role, body) {
      var no = String(body.invoice_no || '').trim(); if (!no) return err(400, 'ต้องมีเลขที่ invoice');
      var date = String(body.invoice_date || today()).slice(0, 10);
      var sh = sheetFor(body.customer_id); if (!sh) return err(404, 'ไม่พบลูกค้า');
      if (!sh.deal.ready) return err(400, 'ดีลยังไม่จบ — ลูกค้าต้องยืนยัน/ตอบครบทุกรายการก่อนบันทึก invoice', { reload: true });
      var r = recordInvoice(role, body.customer_id, no, date, body.lines || []);
      if (r.error) return err(400, r.error);
      audit(role, 'invoice', no + ' ' + r.net_sales + ' ฿');
      return ok(Object.assign({ ok: true }, r));
    }
    function thaiDate(s) {
      s = String(s || '').trim(); var m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
      if (m) { var y = Number(m[3]); if (y < 100) y += 2500; if (y > 2400) y -= 543; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); return null;
    }
    function importInvoices(role, body) {
      var rows = Array.isArray(body.rows) ? body.rows : [], commit = !!body.commit, probs = [], groups = {}, order = [];
      var findP = function (nm) { nm = String(nm || '').trim(); return D.pricelist.rows.filter(function (p) { return p.name === nm; })[0] || D.pricelist.rows.filter(function (p) { return nm && p.name.indexOf(nm) >= 0; })[0]; };
      rows.forEach(function (r, i) {
        var no = String(r.invoice_no || '').trim(), dt = thaiDate(r.date), c = custByName(r.customer), p = findP(r.product), kg = num(String(r.kg || '').replace(/,/g, '')), px = num(String(r.price || '').replace(/,/g, ''));
        if (!no) return probs.push({ row: i + 1, reason: 'ไม่มีเลขที่ใบแจ้งหนี้' });
        if (!dt) return probs.push({ row: i + 1, reason: 'อ่านวันที่ไม่ออก: ' + r.date });
        if (!c) return probs.push({ row: i + 1, reason: 'ไม่รู้จักลูกค้า "' + r.customer + '" — ชื่อต้องตรงกับในระบบ' });
        if (!p) return probs.push({ row: i + 1, reason: 'ไม่รู้จักสินค้า "' + r.product + '"' });
        if (!(kg > 0)) return probs.push({ row: i + 1, reason: 'จำนวน กก. ไม่ถูกต้อง' });
        if (!(px > 0)) px = null;
        var g = groups[no]; if (!g) { g = groups[no] = { no: no, date: dt, cid: c.id, lines: [], due: thaiDate(r.due_date), paid: num(String(r.paid_amount || '').replace(/,/g, '')) || 0, paidDate: thaiDate(r.paid_date) }; order.push(no); }
        g.lines.push({ product_id: p.id, qty_kg: kg, price: px });
      });
      var dups = order.filter(function (no) { return D.invoices.invoices.some(function (i) { return i.id === no; }); });
      var fresh = order.filter(function (no) { return dups.indexOf(no) < 0; });
      var net = 0, gp = 0, lines = 0, pay = 0;
      fresh.forEach(function (no) { var g = groups[no]; g.lines.forEach(function (l) { var P = product(l.product_id), px = l.price || P.w2; net += l.qty_kg * px; gp += l.qty_kg * (px - (P.cost || 0)); lines++; }); if (g.paid) pay++; });
      var res = { fresh: fresh.length, lines: lines, net: Math.round(net), gp: Math.round(gp), duplicates: dups, payments: pay, problems: probs, problemCount: probs.length, ok: fresh.length,
        costNote: 'กำไรคิดจากทุนปัจจุบันของสินค้า (ไม่ใช่ทุน ณ วันออกบิล)' };
      if (commit) { var done = 0; fresh.forEach(function (no) { var g = groups[no]; var r = recordInvoice(role, g.cid, no, g.date, g.lines, { source: 'e-Today', due_date: g.due, paid_amount: g.paid, paid_date: g.paidDate }); if (!r.error) done++; }); res.saved = done; audit(role, 'import-invoices', done + ' ใบ'); }
      return ok(res);
    }
    function delayMin(promised, actual) {
      if (!promised || !actual) return null;
      var p = promised.split(':'), a = actual.split(':'), d = (Number(a[0]) * 60 + Number(a[1])) - (Number(p[0]) * 60 + Number(p[1]));
      if (d < -720) d += 1440; else if (d > 720) d -= 1440; return d;
    }
    function rebuildDeliveries() {
      var DL = D.deliveries, rows = DL.rows, done = rows.filter(function (r) { return r.actual; });
      var state = function (d) { return d == null ? '' : d <= 15 ? 'ok' : d <= 60 ? 'warn' : 'bad'; };
      rows.forEach(function (r) { r.delayMin = delayMin(r.promised, r.actual); r.state = state(r.delayMin); r.delay = r.delayMin == null ? 'ยังไม่ถึง' : (r.delayMin > 0 ? '+' : '') + r.delayMin + ' นาที'; });
      DL.pending = rows.filter(function (r) { return !r.actual; });
      var byC = {};
      rows.forEach(function (r) { (byC[r.carrier] = byC[r.carrier] || []).push(r); });
      DL.carrierNames = Object.keys(byC);
      DL.carriers = DL.carrierNames.map(function (n) {
        var rs = byC[n], fin = rs.filter(function (r) { return r.actual; }), ont = fin.filter(function (r) { return r.delayMin <= 15; }).length, full = rs.filter(function (r) { return r.in_full; }).length;
        var onPct = fin.length ? Math.round(ont / fin.length * 100) : null, fullPct = rs.length ? Math.round(full / rs.length * 100) : null;
        var score = fin.length ? Math.round(onPct * 0.6 + (fullPct || 0) * 0.4) : null;
        return { name: n, jobs: rs.length, ontime: onPct, delayed: fin.filter(function (r) { return r.delayMin > 15; }).length, score: score, inFull: fullPct,
          rounds: rs.slice(0, 8).map(function (r) { return { round: (r.delivered_on || '') + (r.round ? ' · ' + r.round : ''), promised: r.promised, actual: r.actual || '—', delay: r.delay, state: r.state }; }) };
      });
      var ont2 = done.filter(function (r) { return r.delayMin <= 15; }).length, full2 = rows.filter(function (r) { return r.in_full; }).length;
      DL.overall = { score: done.length ? Math.round((ont2 / done.length * 100) * 0.6 + (full2 / rows.length * 100) * 0.4) : null, onTime: done.length ? Math.round(ont2 / done.length * 100) : null,
        inFull: rows.length ? Math.round(full2 / rows.length * 100) : null, delayed: done.filter(function (r) { return r.delayMin > 15; }).length, total: rows.length, pending: DL.pending.length };
    }
    function deliveries(role, body) {
      var DL = D.deliveries;
      if (Array.isArray(body.rows)) {
        var probs = [], okRows = [];
        body.rows.forEach(function (r, i) {
          var dt = thaiDate(r.delivered_on); if (!dt) return probs.push({ row: i + 1, reason: 'อ่านวันที่ไม่ออก: ' + r.delivered_on });
          if (!String(r.carrier || '').trim()) return probs.push({ row: i + 1, reason: 'ไม่มีผู้ขนส่ง' });
          if (!/^\d{1,2}:\d{2}$/.test(String(r.promised || '').trim())) return probs.push({ row: i + 1, reason: 'เวลานัดต้องเป็น ชม:นาที' });
          okRows.push({ delivered_on: dt, round: r.round || '', carrier: String(r.carrier).trim(), customer: r.customer || '', promised: String(r.promised).trim().padStart(5, '0'), actual: /^\d{1,2}:\d{2}$/.test(String(r.actual || '').trim()) ? String(r.actual).trim().padStart(5, '0') : null,
            in_full: !/^(0|ไม่|no|false|n)/i.test(String(r.in_full == null ? '1' : r.in_full).trim()), note: r.note || '' });
        });
        if (body.commit) { okRows.forEach(function (r) { r.id = ++seq.dlv; r.by = role; DL.rows.unshift(r); }); rebuildDeliveries(); }
        return ok({ ok: okRows.length, problems: probs, problemCount: probs.length, saved: body.commit ? okRows.length : 0 });
      }
      var dt2 = thaiDate(body.delivered_on) || today();
      if (!String(body.carrier || '').trim()) return err(400, 'ต้องบอกผู้ขนส่ง');
      if (!/^\d{1,2}:\d{2}$/.test(String(body.promised || ''))) return err(400, 'ใส่เวลานัดส่งเป็น ชม:นาที');
      var row = { id: ++seq.dlv, delivered_on: dt2, round: body.round || '', carrier: String(body.carrier).trim(), customer: body.customer || '', promised: String(body.promised).padStart(5, '0'), actual: /^\d{1,2}:\d{2}$/.test(String(body.actual || '')) ? String(body.actual).padStart(5, '0') : null, in_full: body.in_full !== false && body.in_full !== 0 && body.in_full !== '0', note: body.note || '', by: role };
      DL.rows.unshift(row); rebuildDeliveries();
      return ok({ ok: true, id: row.id });
    }
    function deliveryUpdate(role, body) {
      var r = D.deliveries.rows.filter(function (x) { return x.id === Number(body.id); })[0]; if (!r) return err(404, 'ไม่พบรอบส่ง');
      if (body.actual != null && body.actual !== '') { if (!/^\d{1,2}:\d{2}$/.test(String(body.actual))) return err(400, 'เวลาส่งจริงต้องเป็น ชม:นาที'); r.actual = String(body.actual).padStart(5, '0'); }
      if (body.in_full != null) r.in_full = !(body.in_full === false || body.in_full === 0 || body.in_full === '0');
      if (body.note != null) r.note = body.note;
      rebuildDeliveries(); return ok();
    }
    function prospects(role, body) {
      var PR = D.prospects, td = today(), id = Number(body.id) || 0;
      var name = String(body.name || '').trim(); if (!name) return err(400, 'ต้องมีชื่อลูกค้า / ร้าน');
      var row = id ? PR.rows.filter(function (r) { return r.id === id; })[0] : null;
      if (id && !row) return err(404, 'ไม่พบ prospect');
      if (!row) { row = { id: ++seq.prs, created_at: td, created_by: role }; PR.rows.unshift(row); }
      Object.assign(row, { name: name, contact: body.contact || '', value_month: Math.round(num(body.value_month) || 0), owner: body.owner || '', stage: body.stage || 'new', last_contact: thaiDate(body.last_contact) || td, next_step: body.next_step || '', updated_at: td });
      var act = PR.rows.filter(function (r) { return r.stage !== 'won' && r.stage !== 'lost'; });
      PR.summary = { active: act.length, newN: PR.rows.filter(function (r) { return r.stage === 'new'; }).length, won: PR.rows.filter(function (r) { return r.stage === 'won'; }).length, lost: PR.rows.filter(function (r) { return r.stage === 'lost'; }).length,
        idle: act.filter(function (r) { return (Date.parse(td) - Date.parse(r.last_contact)) / 864e5 > 14; }).length, pipeline: act.reduce(function (a, r) { return a + (r.value_month || 0); }, 0) };
      PR.today = td;
      return ok({ ok: true, id: row.id });
    }
    function serviceLog(role, body) {
      var SL = D['service-logs'], cust = String(body.customer || '').trim(), type = body.type || 'อื่นๆ';
      if (!cust) return err(400, 'ต้องระบุลูกค้า');
      if (!custByName(cust)) return err(400, 'ไม่รู้จักลูกค้า "' + cust + '" — เลือกชื่อจากรายการ');
      if (String(body.detail || '').length < 3) return err(400, 'เล่าสั้นๆ ว่าเกิดอะไรขึ้น');
      if (/ขนส่ง|ส่งช้า|ล่าช้า|ก่อนเวลา|อุณหภูมิ/.test(type) && !String(body.carrier || '').trim()) return err(400, 'เรื่อง "' + type + '" ต้องบอกผู้ขนส่ง');
      var l = { id: ++seq.log, at: stamp(), customer: cust, type: type, detail: body.detail, carrier: body.carrier || '', occurred_on: thaiDate(body.occurred_on) || today(), severity: body.severity || (/คุณภาพ/.test(type) ? 'high' : 'warn'), status: 'เปิด', root_cause: '', action: '', by: role };
      SL.logs.unshift(l); SL.total = SL.logs.length; SL.open = SL.logs.filter(function (x) { return x.status !== 'ปิดแล้ว'; }).length;
      return ok({ ok: true, id: l.id });
    }
    function serviceLogUpdate(role, body) {
      var SL = D['service-logs'], l = SL.logs.filter(function (x) { return x.id === Number(body.id); })[0]; if (!l) return err(404, 'ไม่พบเรื่อง');
      var st = body.status || l.status;
      if ((st === 'แก้ไขแล้ว' || st === 'ปิดแล้ว') && !(String(body.root_cause || l.root_cause).trim() && String(body.action || l.action).trim())) return err(400, 'ปิดเรื่องต้องมีสาเหตุและวิธีแก้ ไม่งั้นเรื่องเดิมจะเกิดซ้ำ');
      l.status = st; if (body.root_cause != null) l.root_cause = body.root_cause; if (body.action != null) l.action = body.action; l.updated_at = stamp(); l.updated_by = role;
      SL.open = SL.logs.filter(function (x) { return x.status !== 'ปิดแล้ว'; }).length;
      return ok();
    }
    function quoteLink(role, body, origin) {
      var cid = body.customer_id, sh = sheetFor(cid), c = sendRow(cid); if (!sh || !c) return err(404, 'ไม่พบลูกค้า');
      if (!sh.rows.some(function (r) { return r.inOffer; })) return err(400, 'ใบของ ' + sh.customer.name + ' ยังไม่มีราคาที่ Pricing ยืนยัน — ยังสร้างลิงก์ไม่ได้');
      var token = sh.link && sh.link.token || hashId('q', cid + ':' + sh.label).slice(1) + Math.random().toString(36).slice(2, 8);
      tokens[token] = cid;
      var exp = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
      sh.link = { token: token, url: (origin || '') + '/q/' + token, expires_at: exp, opened_at: sh.link && sh.link.opened_at || null, label: sh.label };
      /* สร้างลิงก์เพื่อให้เซลล์ส่งเอง = ถือว่าส่งแล้วทางลิงก์ · แต่ถ้าสร้างเพื่อแนบใน LINE (silent) สถานะ "ส่งแล้ว" รอ LINE สำเร็จจริงก่อน */
      if (!body.silent && !c.sentAt) { c.sentAt = stamp(); c.sentBy = role; c.channel = 'link'; sh.sent = true; }
      c.linked = true; rebuildSheet(sh);
      return ok({ url: sh.link.url, token: token, expires_at: exp, label: sh.label, opened_at: sh.link.opened_at });
    }
    function publicQuote(token) {
      var cid = tokens[token]; if (!cid) { sheets().forEach(function (sh) { if (sh.link && sh.link.token === token) cid = sh.customer.id; }); }
      var sh = cid && sheetFor(cid); if (!sh || !sh.link) return null;
      var firstOpen = !sh.link.opened_at || (Date.now() - Date.parse(sh.link.opened_at + '+07:00')) > 36e5;
      sh.link.opened_at = stamp(); var c = sendRow(cid); if (c) c.opened = sh.link.opened_at;
      if (firstOpen) EXT.logEvent({ actor: 'customer', kind: 'customer', action: 'quote-open', entity: 'customer', entity_id: cid, detail: sh.customer.name + ' เปิดใบราคา V' + (sh.quote_version || 1) + ' ทางลิงก์' });
      /* ห้ามส่ง cost · margin · ราคาขั้นต่ำ · คู่แข่ง · โน้ตภายใน */
      var rows = sh.rows.filter(function (r) { return r.inOffer; }).map(function (r) {
        var rq = r.request || null, decided = rq && rq.status !== 'open';
        return { pid: r.pid, name: r.name, grp: r.grp, unit: (product(r.pid) || {}).unit || 'กก.', prev: r.prev, price: r.offer, diff: r.prev ? r.offer - r.prev : null, response: r.response, askWant: r.askWant,
          pending: !!(rq && rq.status === 'open'), revised: !!(decided && rq.status === 'ok' && rq.final_price != null && r.response == null), held: !!(decided && rq.status !== 'ok' && r.response == null), asked: rq ? rq.want : null, round: rq ? (rq.round || 1) : 0 };
      });
      var done = rows.filter(function (r) { return r.response === 'accept' || r.response === 'decline'; }).length, pend = rows.filter(function (r) { return r.pending; }).length;
      return { customer: sh.customer.name, label: sh.label, prevLabel: sh.prevLabel, token: token, sent: sh.sent, version: sh.quote_version || 1, validUntil: sh.link.expires_at || null, sentAt: sh.sentAt || null,
        summary: { total: rows.length, answered: done, accepted: rows.filter(function (r) { return r.response === 'accept'; }).length, pending: pend, complete: rows.length > 0 && done + pend === rows.length && pend === 0 }, rows: rows };
    }
    function publicRespond(token, body) {
      var cid = tokens[token]; if (!cid) { sheets().forEach(function (sh) { if (sh.link && sh.link.token === token) cid = sh.customer.id; }); }
      var sh = cid && sheetFor(cid); if (!sh) return err(404, 'ลิงก์นี้ใช้ไม่ได้แล้ว');
      sh.sent = true; var c = sendRow(cid); if (c && !c.sentAt) { c.sentAt = stamp(); c.sentBy = 'link'; }
      var pname = (product(body.product_id) || {}).name || '';
      if (body.kind === 'nego') {
        var r = priceRequest('customer', { customer_id: cid, product_id: body.product_id, want: body.want, reason: body.reason || 'ลูกค้าขอผ่านลิงก์' });
        if (r.status === 200) EXT.logEvent({ actor: 'customer', kind: 'customer', action: 'negotiation-requested', entity: 'customer', entity_id: cid, detail: sh.customer.name + ' · ' + pname + ' ขอ ' + Math.round(num(body.want)) + ' ฿' + (body.reason ? ' · "' + body.reason + '"' : '') });
        return r;
      }
      var qr = quoteResponse('customer', { customer_id: cid, product_id: body.product_id, kind: body.kind, all: !!body.all });
      if (qr.status === 200) EXT.logEvent({ actor: 'customer', kind: 'customer', action: body.kind === 'accept' ? 'quote-accepted' : 'quote-declined', entity: 'customer', entity_id: cid, detail: sh.customer.name + (body.all ? ' · ทั้งใบ (' + qr.body.n + ' รายการ)' : ' · ' + pname) + (sh.deal && sh.deal.ready ? ' · ตอบครบแล้ว' : '') });
      return qr;
    }

    /* ── ส่วนขยาย (ทุนเข้า · ตลาด · LINE · ต่อรอง · log · dashboard) — src/ext.js ── */
    function afterCosts() { rebuildGuard(); rebuildTotals(); rebuildCentralCount(); }
    var EXT = extend({ D: D, S: S, CFG: CFG, today: today, stamp: stamp, r1: r1, mg: mg, num: num, err: err, ok: ok, clone: clone, hashId: hashId, LVL: LVL, ROLE_NAME: ROLE_NAME,
      product: product, custOf: custOf, custByName: custByName, sheetFor: sheetFor, deskFor: deskFor, sendRow: sendRow, desks: desks, rebuildSheet: rebuildSheet, rebuildGuard: rebuildGuard, rebuildTotals: rebuildTotals,
      setCost: setCost, afterCosts: afterCosts, tiersOf: tiersOf, recalcProduct: recalcProduct, policyOf: policyOf, goalsFor: goalsFor, closeNegotiations: closeNegotiations, mgState: mgState, priceAt: priceAt, holdCost: holdCost, releaseCost: releaseCost, costMasterOf: costMasterOf, ensureCostMaster: ensureCostMaster, spOf: spOf, competitorPrices: competitorPrices, quoteFor: quoteFor, quoteLink: quoteLink, quoteResponse: quoteResponse, priceRequest: priceRequest, audit: function () { return audit.apply(null, arguments); }, targetPct: targetPct, floorPct: floorPct,
      lineConfigured: function () { return !!opts.lineConfigured; }, recordInvoice: recordInvoice, savePriceSheet: savePriceSheet, handoff: handoff, quoteLink: quoteLink, ownerOf: ownerOf, repOf: repOf, repScope: repScope, inScope: inScope, curRep: function () { return CUR_REP; } });
    /* audit เดิม (หน้า "ความจำ") → ลง log กลางด้วย รูปแบบเดียวกับงานของระบบ */
    var audit0 = audit;
    audit = function (role, action, detail) { audit0(role, action, detail); EXT.logEvent({ actor: role, rep: CUR_REP, kind: 'human', action: action, detail: detail }); };

    /* ── ตารางเส้นทาง ───────────────────────────────────────────── */
    function handle0(req) {
      var method = (req.method || 'GET').toUpperCase(), role = req.role && LVL[req.role] != null ? req.role : 'anon', lvl = LVL[role];
      var url = req.url || '/', i = url.indexOf('?'), path = i < 0 ? url : url.slice(0, i), qs = i < 0 ? '' : url.slice(i + 1), body = req.body || {};
      var q = {}; if (qs) qs.split('&').forEach(function (kv) { var j = kv.indexOf('='); var k = j < 0 ? kv : kv.slice(0, j), v = j < 0 ? '' : kv.slice(j + 1); try { q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { q[k] = v; } });
      path = path.replace(/\/+$/, '') || '/';
      var need = function (min) { if (lvl < 1) throw { status: 401, body: { error: 'กรุณาเข้าระบบ' } }; if (lvl < min) throw { status: 403, body: { error: 'ไม่มีสิทธิ์' } }; };
      try {
        if (path === '/api/login' && method === 'POST') return login(body);
        if (path === '/api/logout') return { status: 200, body: { ok: true }, session: null };
        if (path === '/api/me') return ok(meOf(role, req.rep));
        /* หน้าสาธารณะของลูกค้า (ลิงก์ใบราคา) — ไม่ต้องล็อกอิน */
        var pm = path.match(/^\/api\/public-quotes\/([A-Za-z0-9]+)(\/respond)?$/);
        if (pm) { if (pm[2] && method === 'POST') return publicRespond(pm[1], body); var pq = publicQuote(pm[1]); return pq ? ok(pq) : err(404, 'ลิงก์นี้ใช้ไม่ได้แล้ว'); }

        if (method === 'GET') {
          switch (path) {
            case '/api/pricelist': need(1); return ok(pricelistFor(role));
            case '/api/guard': need(1); return ok(guardFor(role, req.rep));
            case '/api/sends': need(1); return ok(sendsFor(role, req.rep, q));
            case '/api/reps': return ok(repsView(role));
            case '/api/deliveries': need(1); return ok(D.deliveries);
            case '/api/prospects': need(1); return ok(D.prospects);
            case '/api/preflight': need(1); return ok(D.preflight);
            case '/api/history': need(1); return ok(D.history);
            case '/api/state': need(2); return ok(S);
            case '/api/sheet': need(1); var sh = sheetFor(q.customer); return sh ? ok(sh) : err(404, 'ไม่พบลูกค้า ' + q.customer);
            case '/api/quote': need(1); return quoteFor(q.customer, q.tier || 'w2');
            case '/api/service-logs': if (q.customer) { need(1); return ok(serviceLogsFor(q.customer)); } need(2); return ok(serviceLogsFor(null));
            case '/api/desk': need(2); if (!q.customer) return ok(D.desk); var dk = deskFor(q.customer); return dk ? ok(dk) : err(404, 'ไม่พบลูกค้า ' + q.customer);
            case '/api/price-requests': need(2); return ok(D['price-requests']);
            case '/api/category-guard': need(2); return ok(D['category-guard']);
            case '/api/category-items': need(2); var ci = D['category-items:' + q.key]; return ci ? ok(ci) : err(404, 'ไม่พบหมวด ' + q.key);
            case '/api/board': need(2); return ok(D.board);
            case '/api/brain': need(2); return ok(D.brain);
            case '/api/wiring': need(2); return ok(D.wiring);
            case '/api/market': need(2); return ok(D.market);
            case '/api/ops-perf': need(2); return ok(D['ops-perf']);
            case '/api/ar': need(2); return ok(D.ar);
            case '/api/product': need(2); var pv = productView(q.id); return pv ? ok(pv) : err(404, 'ไม่พบสินค้า ' + q.id);
            case '/api/data-audit': need(2); return ok(dataAudit());
            case '/api/customers': need(2); return ok({ customers: D.guard.customers });
            case '/api/review': need(3); return ok(D.review);
            case '/api/invoices': need(2); return ok(D.invoices);
            case '/api/exec-attention': need(3); return ok(D['exec-attention']);
            case '/api/ui-state': need(1); return ok({ role: role, today: today() });
            case '/api/price-history': need(2); return ok({ rows: D.history });
            case '/api/policy': need(2); return ok(policyView());
            case '/api/negotiations': need(1); var nv = negotiationsView(role), nsc = repScope(role, req.rep, q); if (nsc) { nv.items = nv.items.filter(function (i) { return inScope(nsc, i.customer_id); }); nv.total = nv.items.length; nv.open = nv.items.filter(function (i) { return i.stage === 'new' || i.stage === 'supplier'; }).length; nv.decided = nv.items.filter(function (i) { return i.stage === 'decided'; }).length; nv.stale = nv.items.filter(function (i) { return i.stale; }).length; } return ok(nv);
            case '/api/cost-master': need(2); return ok({ rows: Object.keys(S.cost_master).map(function (k) { var c = S.cost_master[k], P = product(k) || {}; return Object.assign({ name: P.name, grp: P.grp }, c); }), waiting: Object.keys(S.cost_master).filter(function (k) { return S.cost_master[k].state === 'waiting'; }).length });
            case '/api/price-versions': need(2); return ok({ rows: S.price_versions.filter(function (x) { return (!q.id || x.product_id === q.id) && (!q.customer || x.customer_id === q.customer); }).slice(0, Number(q.limit) || 100) });
          }
          var xg = EXT.route(method, path, q, body, role, need, req); if (xg) return xg;
          return err(404, 'ไม่มีเส้นทางนี้ (' + path + ')');
        }
        /* เขียน */
        var pid = path.match(/^\/api\/products\/([^/]+)$/);
        if (pid) { need(2); if (method === 'DELETE') return err(400, 'ต้นแบบนี้ยังไม่ลบสินค้า'); return productUpdate(role, pid[1], body); }
        switch (path) {
          case '/api/activity': need(1); return activity(role, body);
          case '/api/deliveries': need(1); return deliveries(role, body);
          case '/api/deliveries/update': need(1); return deliveryUpdate(role, body);
          case '/api/prospects': need(1); return prospects(role, body);
          case '/api/service-logs': need(1); return serviceLog(role, body);
          case '/api/service-logs/update': need(2); return serviceLogUpdate(role, body);
          case '/api/price-request': need(1); return priceRequest(role, body);
          case '/api/quoted': need(1); return quoted(role, body);
          case '/api/quote-sent': need(1); body.origin = req.origin; return quoteSent(role, body);
          case '/api/quote-response': need(1); return quoteResponse(role, body);
          case '/api/quote-links': need(1); return quoteLink(role, body, req.origin);
          case '/api/invoices': need(1); return invoicesPost(role, body);
          case '/api/brain/say': need(2); return brainSay(role, body);
          case '/api/save-price-sheet': need(2); return savePriceSheet(role, body);
          case '/api/handoff': need(2); return handoff(role, body);
          case '/api/customer-adjust': need(2); return customerAdjust(role, body);
          case '/api/price-decide': need(2); return priceDecide(role, body);
          case '/api/contract-price': need(2); return contractPrice(role, body);
          case '/api/customers': need(2); return addCustomer(role, body);
          case '/api/reps': need(2); return repsPost(role, body);
          case '/api/costs': need(2); return costs(role, body);
          case '/api/products': need(2); return addProduct(role, body);
          case '/api/competitor-prices': need(2); return competitorPrices(role, body);
          case '/api/config': need(2); return config(role, body);
          case '/api/policy': need(2); return policyUpdate(role, body);
          case '/api/price-requests/status': need(1); return requestStatus(role, body);
          case '/api/category-targets': need(2); return categoryTargets(role, body);
          case '/api/sku-category': need(2); return skuCategory(role, body);
          case '/api/import/invoices': need(2); return importInvoices(role, body);
          case '/api/payments': need(2); return payment(role, body);
          case '/api/perf-baseline': need(3); return perfBaseline(body);
          case '/api/dispatch': need(3); return dispatch(role, body);
          case '/api/ui-state': need(2); return ok();
        }
        var xw = EXT.route(method, path, q, body, role, need, req); if (xw) return xw;
        return err(404, 'ไม่มีเส้นทางนี้ (' + method + ' ' + path + ')');
      } catch (e) {
        if (e && e.status) return { status: e.status, body: e.body };
        return { status: 500, body: { error: 'ระบบขัดข้อง — ' + (e && e.message || e) } };
      }
    }

    /* ทุกคำสั่งเขียนลง log กลางรูปแบบเดียวกัน (สำเร็จ/ล้มเหลว) — ยกเว้น activity ping · /api/log เขียนเองแล้ว */
    function handle(req) {
      CUR_REP = req.rep || null;
      var m = (req.method || 'GET').toUpperCase(), p = String(req.url || '').split('?')[0];
      /* เซลล์เห็น/แตะได้เฉพาะลูกค้าที่ตัวเองถือ — ด่านเดียวคุมทุกเส้นทางที่ระบุลูกค้า (customer_id ใน body · ?customer= · /api/customers/:id) */
      if (req.role && LVL[req.role] === 1 && req.rep) {
        var bq = {}; String(req.url || '').split('?')[1] && String(req.url).split('?')[1].split('&').forEach(function (kv) { var j = kv.indexOf('='); try { bq[decodeURIComponent(kv.slice(0, j < 0 ? kv.length : j))] = decodeURIComponent(j < 0 ? '' : kv.slice(j + 1)); } catch (e) {} });
        var cm2 = p.match(/^\/api\/customers\/([^/]+)$/), cidX = (req.body && req.body.customer_id) || bq.customer || (cm2 && cm2[1]) || '';
        if (cidX && ownerOf(cidX) && ownerOf(cidX) !== (req.rep || '')) return err(403, 'ลูกค้ารายนี้อยู่กับเซลล์คนอื่น');
      }
      var r = handle0(req);
      if (m !== 'GET' && !/\/api\/(activity|log|login|logout|line\/webhook)$/.test(p) && !/^\/api\/public-quotes\//.test(p)) {
        var b = req.body || {}, cid = b.customer_id || (b.id && /customers/.test(p) ? b.id : ''), pid = b.product_id || '';
        var detail = r.status < 300 ? '' : (r.body && r.body.error) || ('ผิดพลาด ' + r.status);
        var ent = cid ? (custOf(cid) || {}).name || cid : pid ? (product(pid) || {}).name || pid : b.id != null ? String(b.id) : '';
        var already = r.status < 300 && D.events[0] && D.events[0].actor === (req.role || 'anon') && Date.parse(D.events[0].at + '+07:00') > Date.now() - 1500 && D.events[0].kind === 'human';
        if (!already) EXT.logEvent({ actor: req.role || 'anon', rep: req.rep || null, kind: 'human', action: p.replace('/api/', ''), entity: cid ? 'customer' : pid ? 'product' : '', entity_id: cid || pid || (b.id == null ? '' : b.id), detail: (ent ? ent + ' · ' : '') + detail, status: r.status < 300 ? 'ok' : 'fail' });
      }
      return r;
    }

    /* ทำให้ตัวเลขสรุปตรงกับบรรทัดจริงตั้งแต่เปิด (fixture บางก้อนจับมาคนละวินาที) */
    ensurePolicy(); ensureCostMaster(); syncPrevRound(); recalcAll(); rebuildCategoryGuard();
    rebuildSends(); rebuildDeliveries(); ensureReps();

    return { handle: handle, docs: D, meOf: meOf, publicQuote: publicQuote, today: today, goalsFor: goalsFor, LVL: LVL, ROLE_NAME: ROLE_NAME, GOAL_NAMES: GOAL_NAMES, esc: esc, ext: EXT };
  }

  return { createStore: createStore, keyOf: keyOf, LVL: LVL, ROLE_NAME: ROLE_NAME };
});
