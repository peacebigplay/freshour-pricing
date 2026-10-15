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
    function gradeOf(m) { return m == null ? '—' : m < 0 ? 'F' : m < floorPct() ? 'D' : m < targetPct() ? 'B' : 'A'; }
    function lineState(m) { return m < 0 ? 'loss' : m < floorPct() ? 'thin' : 'ok'; }

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
          accepted: null, reconfirm: false, askWant: null, revision: null, prev: l.locked, hist: [], asks: [], negoCount: 0, status: 'none', request: null };
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
        l.margin = mg(l.locked, l.cost); l.state = lineState(l.margin); l.grade = gradeOf(l.margin); l.belowTarget = l.margin < tp;
        (by[l.cid] = by[l.cid] || []).push(l);
      });
      G.customers.forEach(function (c) {
        var ls = by[c.id] || [];
        c.n = ls.length; c.low = ls.filter(function (l) { return l.margin < fp; }).length; c.loss = ls.filter(function (l) { return l.margin < 0; }).length;
        c.mgSum = r1(ls.reduce(function (a, l) { return a + l.margin; }, 0)); c.verified = ls.filter(function (l) { return l.verified; }).length;
        c.margin = ls.length ? r1(c.mgSum / ls.length) : null; c.allVerified = c.verified === ls.length; c.grade = ls.length ? gradeOf(c.margin) : '—';
        c.belowTarget = ls.filter(function (l) { return l.belowTarget; }).length;
      });
      G.totals = { customers: G.customers.length, lines: G.lines.length, low: G.lines.filter(function (l) { return l.margin < fp; }).length,
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
      var rows = D.desk.rows, need = 0, appr = 0, stale = 0;
      rows.forEach(function (r) { var c = r.v21 && r.v21.central; if (!(r.cost > 0)) return; if (!c) need++; else if (c.state === 'stale') stale++; else appr++; });
      desks().forEach(function (d) { d.centralCount = { approved: appr, stale: stale, need: need }; });
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

    /* ── ทุน/ราคา: สูตรเดียวกับเครื่องคิดราคาจริง (ปลีก = ทุน × markup · ส่ง 5/10 = ปลีก + k) ── */
    function priceFromCost(cost) { return Math.round(cost * CFG.markup); }
    function setCost(pid, cost, src, role) {
      var P = product(pid); if (!P) return false;
      var prevCost = P.cost, td = today();
      var sp = S.products.filter(function (p) { return p.id === pid; })[0];
      if (sp) { sp.prev_cost = sp.cost; sp.cost = cost; sp.cost_src = src; sp.cost_src_at = td; }
      var override = sp ? sp.override : 0;
      /* ราคากระดานขยับตามทุนเฉพาะ 2 กรณี: ตัวที่ตั้งด้วยสูตร ทุน × markup อยู่แล้ว ตามสูตรต่อ ·
         ตัวอื่นยืนราคาเดิม แต่ถ้าทุนใหม่ดัน margin หลุดเป้าหมวด ดันขึ้นถึงขั้นต่ำ (ไม่ลดราคาเองเงียบๆ) */
      var baseRow = D.desk.rows.filter(function (r) { return r.id === pid; })[0];
      var pct = (baseRow && baseRow.v21 && baseRow.v21.effectivePct) || targetPct();
      var wasFormula = prevCost > 0 && P.w2 === priceFromCost(prevCost);
      var w2 = override || (wasFormula ? priceFromCost(cost) : Math.max(P.w2 || 0, floorPrice(cost, pct)));
      P.cost = cost; P.costSrc = src; P.costSrcAt = td;
      if (!override) { P.w2 = w2; P.retail = w2; P.s5 = w2 + CFG.k5; P.s10 = w2 + CFG.k10; P.saleFloor = w2 - CFG.haggle_baht; }
      P.margin = mg(P.w2, cost);
      D.board.lines.forEach(function (l) { if (l.id === pid) { l.cost = cost; l.w2 = P.w2; l.margin = P.margin; l.jump = l.w2 - (l.prev || 0); l.okMargin = l.margin >= floorPct(); } });
      desks().forEach(function (d) {
        d.rows.forEach(function (r) {
          if (r.id !== pid) return;
          r.costPrev = prevCost; r.cost = cost; r.boardCost = cost; r.costJump = cost - (prevCost || cost);
          if (!override) { r.w2 = P.w2; r.auto = P.w2; r.jump = r.w2 - (r.prev || 0); }
          r.floorPrice = floorPrice(cost, floorPct()); r.safeLow = r.floorPrice; r.saleFloor = r.w2 - CFG.haggle_baht;
          if (r.cust) { r.cust.cost = cost; if (r.cust.source !== 'สัญญา') r.cust.price = r.w2 + (r.cust.adjust || 0); }
          r.margin = mg(r.cust ? r.cust.price : r.w2, cost);
          r.status = r.margin < floorPct() ? 'floored' : 'none';
          var v = r.v21 || (r.v21 = {});
          v.auto = P.w2; v.costUpdated = td;
          var pct = v.effectivePct || targetPct();
          v.guard = floorPrice(cost, pct); v.target = v.guard;
          if (v.goals) {
            v.goals.target = { price: v.guard, rawResult: v.guard, margin: mg(v.guard, cost), why: 'ทุน ÷ (1 − ' + pct + '%) = ' + v.guard + ' ฿', equalProtect: true };
            v.goals.protect = { price: v.guard, rawResult: v.guard, margin: mg(v.guard, cost), why: 'ทุน ÷ (1 − ' + pct + '%) = ' + v.guard + ' ฿' };
            if (v.goals.hold && v.goals.hold.price) { v.goals.hold.margin = mg(v.goals.hold.price, cost); v.goals.hold.belowFloor = v.goals.hold.price < v.guard; v.goals.hold.floorPrice = v.guard; }
          } else if (cost > 0) {
            v.goals = { competitive: { disabled: true, reason: 'ไม่มีข้อมูลตลาด', why: 'ไม่มีข้อมูลตลาด' },
              hold: { price: r.prev || r.w2, rawResult: r.prev || r.w2, margin: mg(r.prev || r.w2, cost), why: 'ยืนราคารอบก่อน ' + (r.prev || r.w2) + ' ฿', belowFloor: (r.prev || r.w2) < v.guard, floorPrice: v.guard, basis: 'prev_low', prev: r.prev || 0 },
              target: { price: v.guard, rawResult: v.guard, margin: mg(v.guard, cost), why: 'ทุน ÷ (1 − ' + pct + '%) = ' + v.guard + ' ฿', equalProtect: true },
              protect: { price: v.guard, rawResult: v.guard, margin: mg(v.guard, cost), why: 'ทุน ÷ (1 − ' + pct + '%) = ' + v.guard + ' ฿' } };
          }
          if (v.central && v.central.state === 'approved' && cost !== prevCost) v.central.state = 'stale';
          if (v.saved && cost !== prevCost) v.costChanged = true;
        });
        d.costUpdated = td;
      });
      D.guard.lines.forEach(function (l) { if (l.pid === pid) l.cost = cost; });
      catItemDocs().forEach(function (c) { c.items.forEach(function (it) { if (it.id === pid) { it.cost = cost; it.price = P.w2; it.margin = mg(P.w2, cost); it.guard = floorPrice(cost, it.effective); } }); });
      D.brain.evidence.blind.forEach(function (b) { if (b.id === pid) { b.cost = cost; b.w2 = P.w2; b.formula = P.w2; } });
      D.pricelist.costUpdated = td; CFG.cost_updated = td; D.brain.control.cost_updated = td; D.pricelist.dirty = true; D.brain.now.dirty = true;
      /* บันทึกว่าทุนตัวนี้เข้ามาทางไหน (ไฟล์/พิมพ์/ปรับทุกตัว/ตรวจแล้ว) — mini dashboard วัดว่าระบบช่วยรับทุนได้แค่ไหน */
      (D.cost_entries = D.cost_entries || []).unshift({ at: stamp(), pid: pid, cost: cost, prev: prevCost, src: src, by: role || '' });
      if (D.cost_entries.length > 5000) D.cost_entries.length = 5000;
      return true;
    }

    /* ── auth ─────────────────────────────────────────────────── */
    function meOf(role) {
      if (!role || role === 'anon') return { role: null, needPin: needPin };
      var base = D['me:' + (role === 'admin' ? 'boss' : role)] || { tabs: [], dispatch: false, seeCost: false };
      return Object.assign({}, base, { role: role, needPin: needPin });
    }
    function login(body) {
      var role = String(body.role || ''), pin = body.pin == null ? '' : String(body.pin);
      if (!LVL[role] || role === 'anon' || role === 'system') return err(400, 'ไม่รู้จักบทบาทนี้');
      if (PINS) {
        if (!pin) return err(401, 'ต้องใส่รหัสของ ' + (ROLE_NAME[role] || role));
        if (PINS[role] !== pin) { audit(role, 'login-fail', 'รหัสผิด'); return err(401, 'รหัสไม่ถูกต้อง'); }
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
    function guardFor(role) {
      var G = D.guard;
      if (LVL[role] >= 2) return G;
      return { today: G.today, asOf: G.asOf, forSale: true,
        customers: G.customers.map(function (c) { return { id: c.id, name: c.name, grade: c.grade, n: c.n }; }),
        suggest: (G.suggest || []).map(function (s) { return { cid: s.cid, cust: s.cust, from: s.from, to: s.to, toId: s.toId, toPrice: s.toPrice, diff: s.diff, grp: s.grp }; }) };
    }
    function serviceLogsFor(name) {
      var logs = D['service-logs'].logs.filter(function (l) { return !name || l.customer === name; });
      return name ? { customer: name, logs: logs } : { open: logs.filter(function (l) { return l.status !== 'ปิดแล้ว'; }).length, total: logs.length, logs: logs };
    }
    function productView(pid) {
      var P = product(pid); if (!P) return null;
      var bl = D.board.lines.filter(function (l) { return l.id === pid; })[0] || {};
      var hist = (S.dispatched.items || []).filter(function (i) { return i.product_id === pid; }).map(function (i) { return { price: i.w2, cost: i.cost }; });
      hist.push({ price: P.w2, cost: P.cost });
      return { floorPct: floorPct(), haggle: CFG.haggle_baht,
        p: { grp: P.grp, name: P.name, vol: bl.vol || 0, cost: P.cost, w2: P.w2, margin: P.margin, floorPrice: floorPrice(P.cost || 0, floorPct()), retail: P.retail, s5: P.s5, s10: P.s10, saleFloor: P.saleFloor },
        marks: (P.marks || []).map(function (m) { return { label: m.label, tier: m.tier, price: m.price || 0, state: m.state, age: m.age }; }),
        customers: D.guard.lines.filter(function (l) { return l.pid === pid; }).map(function (l) { return { name: l.cust, price: l.locked, margin: l.margin }; }),
        hist: hist };
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
          v.central = { price: px, goal: x.goal || body.goal || 'target', at: td, by: role, state: 'approved', exception: String(x.exception || '') };
          r.w2 = px; r.margin = mg(px, r.cost); r.status = r.margin < floorPct() ? 'floored' : 'none';
          var P = product(r.id); if (P) { P.w2 = px; P.retail = px; P.s5 = px + CFG.k5; P.s10 = px + CFG.k10; P.saleFloor = px - CFG.haggle_baht; P.margin = mg(px, P.cost); }
          D.board.lines.forEach(function (l) { if (l.id === r.id) { l.w2 = px; l.margin = mg(px, l.cost); l.jump = px - (l.prev || 0); } });
          var sp = S.products.filter(function (p) { return p.id === r.id; })[0];
          if (sp) { sp.central_price = px; sp.central_goal = v.central.goal; sp.central_at = td; sp.central_by = role; }
          desks().forEach(function (o) { if (o === D.desk) return; o.rows.forEach(function (q) { if (q.id !== r.id) return; var qv = q.v21 || (q.v21 = {});
            var was = qv.base; qv.central = clone(v.central); qv.base = px; q.w2 = px;
            if (qv.baseApproved === false) qv.baseApproved = true; else if (qv.saved && was != null && was !== px) qv.baseChanged = true;
            if (q.cust && q.cust.source !== 'สัญญา') { q.cust.price = px + (q.cust.adjust || 0); q.margin = mg(q.cust.price, q.cost); } }); });
        } else {
          var was2 = v.saved && v.saved.price;
          v.saved = { price: px, goal: x.goal || body.goal || 'target', at: td, by: role, exception: String(x.exception || '') };
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
      if (l) l.locked = px;
      else D.guard.lines.unshift({ cid: cid, cust: c.name, pid: pid, name: P.name, grp: P.grp, locked: px, cost: P.cost, margin: 0, verified: 1, state: 'ok', grade: 'A', belowTarget: false });
      var sl = S.contract_lines.filter(function (x) { return x.customer_id === cid && x.product_id === pid; })[0];
      if (sl) sl.price = px; else S.contract_lines.push({ customer_id: cid, product_id: pid, price: px, verified: 1, cost: P.cost, customer_name: c.name, customer_type: c.type || 'contract' });
      var dk = deskFor(cid);
      dk.rows.forEach(function (r) { if (r.id !== pid) return; r.cust = { price: px, cost: r.cost, source: 'สัญญา', locked: true }; r.margin = mg(px, r.cost);
        var v = r.v21 || (r.v21 = {}); if (v.baseApproved == null) { v.baseApproved = !!(v.central && v.central.state === 'approved'); v.saved = null; v.baseChanged = false; v.costChanged = false; } v.prevCustomer = px; });
      var sh = sheetFor(cid), sr = sh.rows.filter(function (r) { return r.pid === pid; })[0];
      if (sr) { sr.board = px; sr.prev = sr.prev || px; } else sh.rows.push({ pid: pid, name: P.name, grp: P.grp, inOffer: false, offer: null, board: px, floor: px, quoted: null, response: null, accepted: null, reconfirm: false, askWant: null, revision: null, prev: px, hist: [], asks: [], negoCount: 0, status: 'none', request: null });
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
      var bad = [];
      items.forEach(function (it) { var c = num(it.cost); if (c == null || c < 0) { bad.push(it.id); return; } if (setCost(it.id, c, src, role)) n++; else bad.push(it.id); });
      rebuildGuard(); rebuildTotals(); rebuildCentralCount(); audit(role, 'costs', n + ' รายการ');
      return ok({ ok: true, saved: n, failed: bad });
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
      var id = hashId('p', name + Date.now()), w2 = cost ? cost + add : 0, td = today();
      var marks = D.pricelist.comps.map(function (c) { return { id: c.id, label: c.label, tier: c.tier, price: 0, state: 'none' }; });
      D.pricelist.rows.push({ id: id, name: name, grp: grp, retail: w2, w2: w2, s5: w2 ? w2 + CFG.k5 : 0, s10: w2 ? w2 + CFG.k10 : 0, saleFloor: w2 ? w2 - CFG.haggle_baht : 0, marks: clone(marks), pos: 'none', gap: null, cost: cost, margin: mg(w2, cost), costSrc: cost ? 'กรอกในหน้าเว็บ' : '', costSrcAt: cost ? td : '' });
      var g = D.pricelist.grps.filter(function (x) { return x.grp === grp; })[0]; if (g) g.n++; else D.pricelist.grps.push({ grp: grp, n: 1 });
      D.board.lines.push({ id: id, name: name, grp: grp, w2: w2, cost: cost, margin: mg(w2, cost), cheapest: 0, prev: 0, jump: 0, status: cost ? 'none' : 'nocost', vol: 0, okMarket: null, okMargin: cost ? mg(w2, cost) >= floorPct() : false, okMove: false });
      S.products.push({ id: id, name: name, spec: '', grp: grp, cost: cost, prev_cost: cost, add_baht: add, markup: 0, vol_week: 0, watch: 0, override: 0, active: 1, sort: 0, cost_src: '', cost_src_at: td, central_price: null, central_goal: null, central_at: null, central_by: null, central_exception: null, central_cost_at: null });
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
        desks().forEach(function (d) { d.rows.forEach(function (r) { if (r.id !== P.id) return; apply(r.marks); r.cheapest = cheapest ? { price: cheapest, stale: false } : null; r.usingStale = false;
          var v = r.v21 || {}; if (v.market) { v.market.n = fresh.length; v.market.low = cheapest; v.market.high = fresh.length ? Math.max.apply(null, fresh) : 0; v.market.median = fresh.length ? fresh.slice().sort(function (a, b) { return a - b; })[Math.floor(fresh.length / 2)] : 0; }
          if (v.goals && cheapest && r.cost > 0) { var cp = Math.max(cheapest - 1, v.guard || 0); v.goals.competitive = { price: cp, rawResult: cheapest - 1, margin: mg(cp, r.cost), why: 'ต่ำกว่าถูกสุดในตลาด ' + cheapest + ' ฿ อยู่ 1 ฿' + (cp !== cheapest - 1 ? ' แต่ไม่ต่ำกว่าขั้นต่ำ ' + v.guard : '') }; } }); });
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
      if (Array.isArray(body.competitors)) {
        body.competitors.forEach(function (c) { D.pricelist.comps.forEach(function (x) { if (x.id === c.id) { x.label = c.label || x.label; x.tier = c.tier || x.tier; x.source = c.source || ''; } });
          S.competitors.forEach(function (x) { if (x.id === c.id) { x.label = c.label || x.label; x.source = c.source || ''; } }); });
        changed.push('competitors');
      }
      ['floor_pct', 'target_pct', 'haggle_baht', 'market_ttl_days', 'markup', 'k5', 'k10', 'jump_baht', 'jump_pct', 'stale_days'].forEach(function (k) {
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
    function categoryTargets(role, body) {
      var CG = D['category-guard'], key = body.key, lo = num(body.lo), hi = num(body.hi), tg = num(body.target);
      if (lo == null || hi == null || lo > hi) return err(400, 'ช่วงเป้าไม่ถูกต้อง (ต่ำสุดต้องไม่เกินสูงสุด)');
      var g = key === 'portfolio' ? CG.portfolio : CG.groups.filter(function (x) { return x.key === key; })[0];
      if (!g) return err(404, 'ไม่พบหมวด');
      g.lo = lo; g.hi = hi;
      var state = function (x) { return x.margin == null ? 'unknown' : x.margin < x.lo ? 'bad' : x.margin < x.lo + 1 ? 'warn' : 'good'; };
      if (key !== 'portfolio') {
        if (tg != null) { g.target = tg; g.effective = Math.max(tg, CG.floorPct); }
        var ci = D['category-items:' + key];
        if (ci) { ci.catFloor = g.effective; ci.categories.forEach(function (c) { if (c.key === key) c.target = g.effective; }); ci.items.forEach(function (it) { it.catTarget = g.effective; it.floor = g.effective; if (!it.itemTarget) { it.target = g.effective; it.effective = g.effective; } it.guard = it.cost ? floorPrice(it.cost, it.effective) : 0; }); }
        catItemDocs().forEach(function (c) { c.categories.forEach(function (x) { if (x.key === key) x.target = g.effective; }); });
        desks().forEach(function (d) { d.rows.forEach(function (r) { var v = r.v21; if (!v || !v.category || v.category.key !== key) return; v.category.target = g.effective; v.category.floor = g.effective; v.effectivePct = g.effective; v.targetPct = g.effective;
          if (r.cost > 0) { v.guard = floorPrice(r.cost, g.effective); v.target = v.guard; if (v.goals) { v.goals.target.price = v.guard; v.goals.target.rawResult = v.guard; v.goals.target.margin = mg(v.guard, r.cost); v.goals.target.why = 'ทุน ÷ (1 − ' + g.effective + '%) = ' + v.guard + ' ฿'; v.goals.protect = clone(v.goals.target); delete v.goals.protect.equalProtect; } } }); });
      }
      g.state = state(g);
      CG.below = CG.groups.filter(function (x) { return x.state === 'bad'; }).length;
      audit(role, 'category-targets', key);
      return ok({ ok: true, effective: g.effective });
    }
    function skuCategory(role, body) {
      var pid = body.product_id, key = body.category_key, tg = body.target_pct == null || body.target_pct === '' ? null : num(body.target_pct);
      var CG = D['category-guard'], P = product(pid); if (!P) return err(404, 'ไม่พบสินค้า');
      if (tg != null && !(tg >= 0 && tg <= 90)) return err(400, 'เป้าต้องอยู่ระหว่าง 0–90%');
      var from = null, item = null;
      catItemDocs().forEach(function (c) { var i = c.items.filter(function (x) { return x.id === pid; })[0]; if (i) { from = c; item = i; } });
      if (!item) return err(404, 'สินค้านี้ยังไม่อยู่ในหมวดใด');
      var orig = (D['category-guard'].groups.filter(function (g) { return (g.grps || []).indexOf(P.grp) >= 0 || (g.keywords || []).some(function (k) { return P.name.indexOf(k) >= 0; }); })[0] || {}).key || from.key;
      var toKey = key || orig, to = D['category-items:' + toKey] || from, grp = CG.groups.filter(function (g) { return g.key === toKey; })[0];
      if (to !== from) { from.items = from.items.filter(function (x) { return x !== item; }); to.items.push(item); CG.groups.forEach(function (g) { if (g.key === from.key) g.n--; if (g.key === toKey) g.n++; }); }
      var catT = grp ? grp.effective : to.catFloor;
      item.moved = toKey !== orig; item.catTarget = catT; item.floor = catT; item.itemTarget = tg != null; item.target = tg != null ? tg : catT;
      item.effective = Math.max(item.target, catT); item.guard = item.cost ? floorPrice(item.cost, item.effective) : 0; item.grp = P.grp;
      desks().forEach(function (d) { d.rows.forEach(function (r) { var v = r.v21; if (r.id !== pid || !v) return; v.category = { key: toKey, name: grp ? grp.name : to.name, floor: catT, target: item.effective }; v.effectivePct = item.effective; v.targetPct = item.effective;
        if (r.cost > 0) { v.guard = floorPrice(r.cost, item.effective); v.target = v.guard; if (v.goals) { v.goals.target.price = v.guard; v.goals.target.rawResult = v.guard; v.goals.target.margin = mg(v.guard, r.cost); v.goals.target.why = 'ทุน ÷ (1 − ' + item.effective + '%) = ' + v.guard + ' ฿'; v.goals.protect = clone(v.goals.target); delete v.goals.protect.equalProtect; } } }); });
      return ok({ ok: true, effective: item.effective });
    }
    function priceRequest(role, body) {
      var cid = body.customer_id, pid = body.product_id, want = Math.round(num(body.want));
      var sh = sheetFor(cid), c = custOf(cid), P = product(pid); if (!sh || !c) return err(404, 'ไม่พบลูกค้า'); if (!P) return err(404, 'ไม่พบสินค้า');
      if (!(want > 0)) return err(400, 'ราคาที่ขอต้องมากกว่า 0');
      var row = sh.rows.filter(function (r) { return r.pid === pid; })[0];
      if (!row) return err(400, 'สินค้านี้ไม่อยู่ในสัญญาของ ' + c.name);
      if (row.request && row.request.status === 'open') return err(400, 'มีคำขอของรายการนี้รอ Pricing อยู่แล้ว');
      var cur = row.offer != null ? row.offer : row.board;
      if (want >= cur) return err(400, 'ราคาที่ขอ ' + want + ' ฿ ไม่ต่ำกว่าราคาที่เสนอ ' + cur + ' ฿ — ยืนยันราคาปัจจุบันได้เลย');
      var id = ++seq.req, at = stamp();
      var rq = { id: id, customer_id: cid, product_id: pid, label: sh.label, want: want, floor_at: row.floor || cur, reason: body.reason || '', by_role: role, at: at, status: 'open', decided_by: null, decided_at: null, decided_note: null,
        final_price: null, supplier_cost_target: null, original_price: cur, source: 'sale', exception: '', rev: 1, cust: c.name, product: P.name, cprice: cur };
      D['price-requests'].rows.unshift(rq); D['price-requests'].open++;
      D.sends.negotiations.unshift({ id: id, customer_id: cid, customer: c.name, product_id: pid, product: P.name, want: want, original_price: cur, final_price: null, status: 'open', reason: rq.reason, at: at, source: 'sale' });
      row.request = { id: id, status: 'open', want: want, note: null, final_price: null, rev: 1 }; row.asks.unshift({ label: sh.label, want: want, status: 'open' }); row.negoCount = (row.negoCount || 0) + 1; row.response = 'nego'; row.askWant = want;
      rebuildSheet(sh);
      S.customers.forEach(function (x) { if (x.id === cid) x.haggles = (x.haggles || 0) + 1; });
      return ok({ ok: true, id: id });
    }
    function priceDecide(role, body) {
      var rq = D['price-requests'].rows.filter(function (r) { return r.id === Number(body.id); })[0];
      if (!rq) return err(404, 'ไม่พบคำขอ');
      if (body.seen_rev != null && Number(body.seen_rev) !== rq.rev) return err(409, 'คำขอนี้เพิ่งเปลี่ยน — โหลดใหม่แล้วตัดสินอีกครั้ง', { reload: true, changed: true });
      if (rq.status !== 'open') return err(400, 'คำขอนี้ตัดสินไปแล้ว', { reload: true });
      var approve = !!body.approve, fp = approve ? Math.round(num(body.final_price) || rq.want) : null;
      var P = product(rq.product_id);
      if (approve && P && P.cost > 0 && fp < P.cost && !body.exception) return err(400, 'ราคา ' + fp + ' ฿ ต่ำกว่าทุน ' + P.cost + ' ฿ — ติ๊ก "ข้อยกเว้น" ถ้าตั้งใจ');
      rq.status = approve ? 'ok' : 'no'; rq.decided_by = role; rq.decided_at = stamp(); rq.decided_note = body.note || ''; rq.final_price = fp;
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
        c.sentAt = stamp(); c.sentBy = role; c.channel = body.channel || 'manual'; sh.sent = true; sh.sentAt = c.sentAt;
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
      if (!c.sentAt) { c.sentAt = stamp(); c.sentBy = role; c.channel = 'link'; sh.sent = true; }
      c.linked = true; rebuildSheet(sh);
      return ok({ url: sh.link.url, token: token, expires_at: exp, label: sh.label, opened_at: sh.link.opened_at });
    }
    function publicQuote(token) {
      var cid = tokens[token]; if (!cid) { sheets().forEach(function (sh) { if (sh.link && sh.link.token === token) cid = sh.customer.id; }); }
      var sh = cid && sheetFor(cid); if (!sh || !sh.link) return null;
      sh.link.opened_at = stamp(); var c = sendRow(cid); if (c) c.opened = sh.link.opened_at;
      /* ห้ามส่ง cost · margin · ราคาขั้นต่ำ · คู่แข่ง */
      return { customer: sh.customer.name, label: sh.label, prevLabel: sh.prevLabel, token: token, sent: sh.sent,
        rows: sh.rows.filter(function (r) { return r.inOffer; }).map(function (r) { return { pid: r.pid, name: r.name, grp: r.grp, prev: r.prev, price: r.offer, diff: r.prev ? r.offer - r.prev : null, response: r.response, askWant: r.askWant, pending: !!(r.request && r.request.status === 'open') }; }) };
    }
    function publicRespond(token, body) {
      var cid = tokens[token]; if (!cid) { sheets().forEach(function (sh) { if (sh.link && sh.link.token === token) cid = sh.customer.id; }); }
      var sh = cid && sheetFor(cid); if (!sh) return err(404, 'ลิงก์นี้ใช้ไม่ได้แล้ว');
      sh.sent = true; var c = sendRow(cid); if (c && !c.sentAt) { c.sentAt = stamp(); c.sentBy = 'link'; }
      if (body.kind === 'nego') {
        var r = priceRequest('customer', { customer_id: cid, product_id: body.product_id, want: body.want, reason: body.reason || 'ลูกค้าขอผ่านลิงก์' });
        return r;
      }
      return quoteResponse('customer', { customer_id: cid, product_id: body.product_id, kind: body.kind, all: !!body.all });
    }

    /* ── ส่วนขยาย (ทุนเข้า · ตลาด · LINE · ต่อรอง · log · dashboard) — src/ext.js ── */
    function afterCosts() { rebuildGuard(); rebuildTotals(); rebuildCentralCount(); }
    var EXT = extend({ D: D, S: S, CFG: CFG, today: today, stamp: stamp, r1: r1, mg: mg, num: num, err: err, ok: ok, clone: clone, hashId: hashId, LVL: LVL, ROLE_NAME: ROLE_NAME,
      product: product, custOf: custOf, custByName: custByName, sheetFor: sheetFor, deskFor: deskFor, sendRow: sendRow, desks: desks, rebuildSheet: rebuildSheet, rebuildGuard: rebuildGuard, rebuildTotals: rebuildTotals,
      setCost: setCost, afterCosts: afterCosts, competitorPrices: competitorPrices, quoteFor: quoteFor, quoteLink: quoteLink, quoteResponse: quoteResponse, priceRequest: priceRequest, audit: function () { return audit.apply(null, arguments); }, targetPct: targetPct, floorPct: floorPct,
      lineConfigured: function () { return !!opts.lineConfigured; } });
    /* audit เดิม (หน้า "ความจำ") → ลง log กลางด้วย รูปแบบเดียวกับงานของระบบ */
    var audit0 = audit;
    audit = function (role, action, detail) { audit0(role, action, detail); EXT.logEvent({ actor: role, kind: 'human', action: action, detail: detail }); };

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
        if (path === '/api/me') return ok(meOf(role));
        /* หน้าสาธารณะของลูกค้า (ลิงก์ใบราคา) — ไม่ต้องล็อกอิน */
        var pm = path.match(/^\/api\/public-quotes\/([A-Za-z0-9]+)(\/respond)?$/);
        if (pm) { if (pm[2] && method === 'POST') return publicRespond(pm[1], body); var pq = publicQuote(pm[1]); return pq ? ok(pq) : err(404, 'ลิงก์นี้ใช้ไม่ได้แล้ว'); }

        if (method === 'GET') {
          switch (path) {
            case '/api/pricelist': need(1); return ok(pricelistFor(role));
            case '/api/guard': need(1); return ok(guardFor(role));
            case '/api/sends': need(1); return ok(D.sends);
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
          case '/api/quote-sent': need(1); return quoteSent(role, body);
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
          case '/api/costs': need(2); return costs(role, body);
          case '/api/products': need(2); return addProduct(role, body);
          case '/api/competitor-prices': need(2); return competitorPrices(role, body);
          case '/api/config': need(2); return config(role, body);
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
      var r = handle0(req), m = (req.method || 'GET').toUpperCase(), p = String(req.url || '').split('?')[0];
      if (m !== 'GET' && !/\/api\/(activity|log|login|logout|line\/webhook)$/.test(p)) {
        var b = req.body || {}, cid = b.customer_id || (b.id && /customers/.test(p) ? b.id : ''), pid = b.product_id || '';
        var detail = r.status < 300 ? '' : (r.body && r.body.error) || ('ผิดพลาด ' + r.status);
        var ent = cid ? (custOf(cid) || {}).name || cid : pid ? (product(pid) || {}).name || pid : b.id != null ? String(b.id) : '';
        var already = r.status < 300 && D.events[0] && D.events[0].actor === (req.role || 'anon') && Date.parse(D.events[0].at + '+07:00') > Date.now() - 1500 && D.events[0].kind === 'human';
        if (!already) EXT.logEvent({ actor: req.role || 'anon', kind: 'human', action: p.replace('/api/', ''), entity: cid ? 'customer' : pid ? 'product' : '', entity_id: cid || pid || (b.id == null ? '' : b.id), detail: (ent ? ent + ' · ' : '') + detail, status: r.status < 300 ? 'ok' : 'fail' });
      }
      return r;
    }

    /* ทำให้ตัวเลขสรุปตรงกับบรรทัดจริงตั้งแต่เปิด (fixture บางก้อนจับมาคนละวินาที) */
    rebuildSends(); rebuildDeliveries();

    return { handle: handle, docs: D, meOf: meOf, publicQuote: publicQuote, today: today, LVL: LVL, ROLE_NAME: ROLE_NAME, GOAL_NAMES: GOAL_NAMES, esc: esc, ext: EXT };
  }

  return { createStore: createStore, keyOf: keyOf, LVL: LVL, ROLE_NAME: ROLE_NAME };
});
