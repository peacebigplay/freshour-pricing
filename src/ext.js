/* ══════════════════════════════════════════════════════════════════
   Freshour · ส่วนต่อขยายจากคอมเมนต์ผู้ใช้ (15 ต.ค.) — ต่อจาก store.js เรียงตาม flow งาน
   1 ทุนเข้า      อ่านไฟล์ทุน AL อัตโนมัติ + ด่านตรวจตัวเลขแปลก (ทุน 3 บาท / กระโดด / สูงกว่าราคาขาย)
   2 เทียบตลาด    connector ดึงราคาเองทุกวัน · จับคู่ SKU เพิ่มเรื่อยๆ · อ่านแนวโน้ม · คะแนนว่าเตือนถูกกี่ครั้ง
   3 ส่งราคา      ราคาไปถึงลูกค้าเองทาง LINE (outbox) · กระดานสถานะใบราคาทุกเจ้า
   4 ต่อรองจนจบ   ตามเจ้าที่เงียบ · บันทึกผลปิดดีล (ตกลงที่ราคาเท่าไหร่ / เสียไปเพราะอะไร)
   5 Log          ทุกเหตุการณ์รูปแบบเดียว ทั้งคนและระบบ · health + alert ถ้าระบบล้มต้องมีคนรู้
   6 Dashboard    สรุปแยกตามคน: พี่หมิง ปิดได้กี่เจ้า margin จริง · พี่จุ๋ม ติดตรงไหน ข้อมูลไหนเก่า · เซลล์ แต่ละเจ้าอยู่ขั้นไหน (ไม่เห็นทุน)
   ══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FHExt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return function extend(X) {
    var D = X.D, S = X.S, CFG = X.CFG, today = X.today, stamp = X.stamp, r1 = X.r1, mg = X.mg, num = X.num, err = X.err, ok = X.ok, clone = X.clone;
    var product = X.product, custOf = X.custOf, sheetFor = X.sheetFor, sendRow = X.sendRow, rebuildSheet = X.rebuildSheet, LVL = X.LVL;
    var FOLLOW_DAYS = 2, STALE_COST_DAYS = 7, STALE_MARKET_DAYS = CFG.market_ttl_days || 30;

    /* ── ตารางใหม่ (อยู่ใน D เพื่อให้ journal/เดโมเล่นซ้ำได้เหมือนเดิม) ── */
    D.events = D.events || []; D.alerts = D.alerts || []; D.outbox = D.outbox || []; D.market_obs = D.market_obs || [];
    D.predictions = D.predictions || []; D.cost_imports = D.cost_imports || []; D.surveys = D.surveys || []; D.source_status = D.source_status || {}; D.inbox = D.inbox || []; D.cost_flags = D.cost_flags || []; D.cost_batches = D.cost_batches || []; D.sku_aliases = D.sku_aliases || {}; D.followups = D.followups || []; D.deals = D.deals || [];
    D.jobs = D.jobs || { 'market-sync': { label: 'ดึงราคาตลาด (ทุกวัน)', every_h: 24, last_run: null, status: 'never', detail: '', runs: 0 },
      'line-outbox': { label: 'ส่ง LINE', every_h: 0, last_run: null, status: 'never', detail: '', runs: 0 },
      'cost-import': { label: 'อ่านไฟล์ทุน AL', every_h: 0, last_run: null, status: 'never', detail: '', runs: 0 } };
    D.jobs['followup-check'] = D.jobs['followup-check'] || { label: 'ตามลูกค้าที่เงียบ (ทุกวัน)', every_h: 24, last_run: null, status: 'never', detail: '', runs: 0 };
    var seq = { ev: 0, al: 0, ob: 0, pr: 0, ci: 0, cf: 0, fu: 0, dl: 0, ob2: 0 };
    var nextId = function (k) { return ++seq[k]; };

    /* ════════ 5 · LOG รูปแบบเดียวทั้งคนและระบบ ════════ */
    function logEvent(e) {
      var ev = { id: nextId('ev'), at: stamp(), actor: e.actor || 'system', rep: e.rep || (e.actor && e.actor !== 'system' && X.curRep ? X.curRep() : null) || null, kind: e.kind || (e.actor && e.actor !== 'system' ? 'human' : 'system'),
        action: e.action, entity: e.entity || '', entity_id: e.entity_id == null ? '' : String(e.entity_id), detail: e.detail || '', status: e.status || 'ok', step: e.step || stepOf(e.action) };
      D.events.unshift(ev); if (D.events.length > 3000) D.events.length = 3000;
      return ev;
    }
    /* ขั้นของ flow ที่เหตุการณ์นี้อยู่ — ใช้ร้อยเรื่องราวจากทุน → ส่งลูกค้า → ปิดดีล */
    function stepOf(a) {
      a = String(a || '');
      if (/cost|product|import\/costs|cost-flag/.test(a)) return 'ทุนเข้า';
      if (/market|competitor|trend/.test(a)) return 'เทียบตลาด';
      if (/save-price-sheet|handoff|central|category|config|customer-adjust|contract/.test(a)) return 'ตั้งราคา';
      if (/quote|line|sent|link/.test(a)) return 'ส่งราคา';
      if (/price-request|price-decide|followup|deal|response|nego/.test(a)) return 'ต่อรอง';
      if (/invoice|payment|dispatch/.test(a)) return 'ปิดรอบ';
      if (/service|deliver|prospect/.test(a)) return 'บริการ';
      return 'ระบบ';
    }
    function alert(level, title, detail, source) {
      var same = D.alerts.filter(function (a) { return !a.acked && a.title === title; })[0];
      if (same) { same.count = (same.count || 1) + 1; same.last_at = stamp(); same.detail = detail; return same; }
      var a = { id: nextId('al'), at: stamp(), last_at: stamp(), level: level, title: title, detail: detail || '', source: source || 'system', acked: false, count: 1, notified: false };
      D.alerts.unshift(a); logEvent({ actor: 'system', action: 'alert', entity: 'alert', entity_id: a.id, detail: title, status: level === 'bad' ? 'fail' : 'warn' });
      return a;
    }
    function jobStart(k) { var j = D.jobs[k]; j.status = 'running'; j.started = stamp(); return j; }
    function jobDone(k, detail) { var j = D.jobs[k]; j.status = 'ok'; j.last_run = stamp(); j.detail = detail || ''; j.runs++; j.error = null; logEvent({ actor: 'system', action: k, entity: 'job', entity_id: k, detail: detail }); }
    function jobFail(k, e) { var j = D.jobs[k]; j.status = 'fail'; j.last_run = stamp(); j.error = String(e && e.message || e); j.runs++; logEvent({ actor: 'system', action: k, entity: 'job', entity_id: k, detail: j.error, status: 'fail' }); alert('bad', 'งานระบบล้ม: ' + j.label, j.error, k); }
    function ageDays(iso) { return iso ? Math.floor((Date.parse(today()) - Date.parse(String(iso).slice(0, 10))) / 864e5) : null; }
    function health() {
      var jobs = Object.keys(D.jobs).map(function (k) { var j = D.jobs[k], age = j.last_run ? (Date.now() - Date.parse(j.last_run + '+07:00')) / 36e5 : null;
        var stale = j.every_h && (age == null || age > j.every_h * 1.5);
        return Object.assign({ key: k, stale: !!stale, age_h: age == null ? null : r1(age) }, j); });
      var bad = jobs.filter(function (j) { return j.status === 'fail' || j.stale; });
      var ob = { queued: D.outbox.filter(function (o) { return o.status === 'queued'; }).length, failed: D.outbox.filter(function (o) { return o.status === 'failed'; }).length, sent: D.outbox.filter(function (o) { return o.status === 'sent' || o.status === 'simulated'; }).length };
      var open = D.alerts.filter(function (a) { return !a.acked; });
      return { ok: !bad.length && !open.some(function (a) { return a.level === 'bad'; }), today: today(), jobs: jobs, outbox: ob, alerts: open, events: D.events.length, line: X.lineConfigured ? X.lineConfigured() : false };
    }

    /* ════════ 1 · ทุนเข้า: อ่านไฟล์ AL + ด่านตรวจตัวเลขแปลก ════════ */
    function norm(s) { return String(s || '').toLowerCase().replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').replace(/\(.*?\)/g, ' ').replace(/[%\-_/.,()*]/g, ' ').replace(/\s+/g, ' ').replace(/หม/g, '').trim(); }
    /* ชื่อจากไฟล์ → ชื่อสินค้า: ตัดเลขลำดับหน้า · "กก.ละ" · **NEW** · เลขราคาที่ติดท้าย · ช่องว่างหน้าจุด */
    function cleanName(raw) { return String(raw || '').replace(/^\s*\d{1,3}[.)]?\s+/, '').replace(/กก\.?\s*ละ/g, '').replace(/\*\*\s*new\s*\*\*/gi, '').replace(/(?:\s+-?\d+(?:[.,]\d+)?){2,}\s*$/, '').replace(/\s+([.,%)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim(); }
    function tokens(s) { return norm(s).split(' ').filter(Boolean); }
    /* จับคู่ชื่อจากไฟล์กับ SKU: ตรงเป๊ะ → ตรงหลังล้างชื่อ → คำซ้อนกันมากสุด (ต้อง ≥ 60%) */
    function bigrams(s) { var t = norm(s).replace(/\s+/g, ''), out = {}; for (var i = 0; i < t.length - 1; i++) out[t.slice(i, i + 2)] = (out[t.slice(i, i + 2)] || 0) + 1; return out; }
    function dice(a, b) { var A = bigrams(a), B = bigrams(b), n = 0, na = 0, nb = 0, k; for (k in A) { na += A[k]; if (B[k]) n += Math.min(A[k], B[k]); } for (k in B) nb += B[k]; return na + nb ? 2 * n / (na + nb) : 0; }
    /* จับคู่ชื่อจากไฟล์/ตลาดกับ SKU: ตรงเป๊ะ → ตรงหลังล้างชื่อ → ความคล้ายตัวอักษรคู่ (ภาษาไทยไม่มีช่องว่าง) ต้อง ≥ 0.6 และไม่กำกวม */
    var MATCH_CACHE = {};
    function matchProduct(name, grpHint) {
      var rows = D.pricelist.rows, nm = String(name || '').trim(); if (!nm) return null;
      var al = D.sku_aliases && D.sku_aliases[norm(nm)]; if (al) { var ap = product(al); if (ap) return { p: ap, how: 'alias', score: 1 }; }   /* ชื่อที่คนเคยจับคู่ไว้ — ไม่ต้องจับใหม่ */
      var ck = nm + '|' + (grpHint || '') + '|' + rows.length; if (ck in MATCH_CACHE) return MATCH_CACHE[ck];
      return (MATCH_CACHE[ck] = matchProduct0(rows, nm, grpHint));
    }
    function rankProducts(nm, grpHint) {
      var rows = D.pricelist.rows, n1 = norm(nm), tk = tokens(nm); if (!tk.length) return [];
      return rows.map(function (r) {
        var rt = tokens(r.name), hit = tk.filter(function (t) { return rt.some(function (x) { return x === t || (t.length > 2 && (x.indexOf(t) >= 0 || t.indexOf(x) >= 0)); }); }).length;
        var tok = hit / Math.max(tk.length, rt.length), dc = dice(nm, r.name), rn = norm(r.name).replace(/\s+/g, ''), qn = n1.replace(/\s+/g, '');
        var contain = rn && qn && (rn.indexOf(qn) === 0 || qn.indexOf(rn) === 0) ? 0.1 : 0;
        return { p: r, score: Math.max(tok, dc) + contain + (grpHint && r.grp === grpHint ? 0.05 : 0) };
      }).sort(function (a, b) { return b.score - a.score; });
    }
    function matchProduct0(rows, nm, grpHint) {
      var exact = rows.filter(function (r) { return r.name === nm; }); if (exact.length === 1) return { p: exact[0], how: 'exact', score: 1 };
      var n1 = norm(nm), eq = rows.filter(function (r) { return norm(r.name) === n1; }); if (eq.length === 1) return { p: eq[0], how: 'normalized', score: 0.95 };
      /* ชื่อในไฟล์ = ชื่อสินค้า + สเปคต่อท้าย (เช่น "สามชั้นหมูหั่นเส้น หนา 1.5") → เอาชื่อที่ยาวสุดที่เป็นคำขึ้นต้น ถ้ามีตัวเดียว */
      var pre = rows.filter(function (r) { var rn = norm(r.name); return rn.length >= 6 && n1.indexOf(rn) === 0 && n1.length - rn.length <= 14; }).sort(function (a, b) { return norm(b.name).length - norm(a.name).length; });
      if (pre.length && (pre.length === 1 || norm(pre[0].name).length > norm(pre[1].name).length)) return { p: pre[0], how: 'prefix', score: 0.92 };
      var tk = tokens(nm); if (!tk.length) return null;
      var scored = rankProducts(nm, grpHint); if (false) rows.map(function (r) {
        var rt = tokens(r.name), hit = tk.filter(function (t) { return rt.some(function (x) { return x === t || (t.length > 2 && (x.indexOf(t) >= 0 || t.indexOf(x) >= 0)); }); }).length;
        var tok = hit / Math.max(tk.length, rt.length), dc = dice(nm, r.name), rn = norm(r.name).replace(/\s+/g, ''), qn = n1.replace(/\s+/g, '');
        var contain = rn && qn && (rn.indexOf(qn) === 0 || qn.indexOf(rn) === 0) ? 0.1 : 0;
        return { p: r, score: Math.max(tok, dc) + contain + (grpHint && r.grp === grpHint ? 0.05 : 0) };
      }).sort(function (a, b) { return b.score - a.score; });
      var best = scored[0], second = scored[1];
      if (!best || best.score < 0.6) return null;
      if (second && best.score < 0.95 && best.score - second.score < 0.03 && second.p.name !== best.p.name) return null;   /* กำกวม — ให้คนเลือก ไม่เดา */
      return { p: best.p, how: 'fuzzy', score: Math.round(Math.min(best.score, 1) * 100) / 100 };
    }
    function groupMedianCost(grp) { var v = D.pricelist.rows.filter(function (r) { return r.grp === grp && r.cost > 0; }).map(function (r) { return r.cost; }).sort(function (a, b) { return a - b; }); return v.length ? v[Math.floor(v.length / 2)] : null; }
    /* ══ PART 1 · การรับทุน — Human reviews exceptions, not every transaction ══
       STEP 01 Cost Source (ไฟล์ AL / กล่องรับ / LINE / กรอกมือ) → ทุกครั้งเป็น Cost Import Batch
       STEP 02 Read & Normalize (ชื่อ · ทุน · หน่วย → THB/KG · วันมีผล · ที่มา)
       STEP 03 SKU Matching: Matched / Possible → คิวจับคู่ / Unmatched → ห้ามสร้างทุนเอง · คนจับแล้วระบบจำ (alias)
       STEP 04 Cost Validation: เทียบทุนเดิม · ประวัติ · ช่วงที่สมเหตุผล · กลุ่มสินค้า → ระดับ warn / critical
       STEP 05 Classification: Auto Pass / Need Human Review · STEP 06 Review: Confirm / Correct / Hold · STEP 07 Approved Cost Master */
    var MIN_REASONABLE = 10;   /* ฿/กก. — ต่ำกว่านี้แทบไม่มีชิ้นส่วนหมูจริง (เลือด/กระดูกข้อขาเป็นข้อยกเว้นที่คนต้องยืนยัน) */
    var KIND_TEXT = { anomaly: 'ทุนผิดปกติ', unmatched: 'ไม่พบ SKU', possible: 'จับคู่ไม่มั่นใจ', duplicate: 'ซ้ำในไฟล์', missing: 'ไม่มีทุน', unit: 'หน่วยไม่รู้จัก', old_sheet: 'ใบรอบเก่า' };
    function normUnit(u) {
      var s = String(u || '').trim().toLowerCase().replace(/\s+/g, '');
      if (!s || /^(บาท|฿|thb)?\/?(กก|กิโล|kg|กิโลกรัม|kilo)\.?$/.test(s) || /thb\/kg|บาท\/กก|฿\/กก|\/kg$/.test(s)) return { unit: 'THB/KG', factor: 1, valid: true };
      if (/ขีด|100g|100กรัม/.test(s)) return { unit: 'THB/KG', factor: 10, valid: true, note: 'แปลงจากบาท/ขีด ×10' };
      if (/ตัน|ton/.test(s)) return { unit: 'THB/KG', factor: 0.001, valid: true, note: 'แปลงจากบาท/ตัน ÷1000' };
      if (/แพ็ค|แพค|pack|ถุง|ถาด|ชุด|ตัว|ขวด|กล่อง|ชิ้น|แพ็ก/.test(s)) return { unit: 'THB/' + s.toUpperCase(), factor: 1, valid: true, perPiece: true };
      return { unit: s, factor: 1, valid: false };
    }
    function histRange(p) {
      var e = (D.cost_entries || []).filter(function (x) { return x.pid === p.id && x.cost > 0; }).slice(0, 12).map(function (x) { return x.cost; });
      var sp = X.spOf(p.id); if (sp && sp.prev_cost > 0) e.push(sp.prev_cost); if (p.cost > 0) e.push(p.cost);
      return e.length >= 2 ? { lo: Math.min.apply(null, e), hi: Math.max.apply(null, e), n: e.length } : null;
    }
    /* กฎตรวจทุน — คืนรายการเหตุผล (ว่าง = ปกติ) · ระบบไม่ตัดสินว่า "ผิด" แต่บอกว่า "ผิดปกติเมื่อเทียบกับข้อมูลเดิม กรุณาตรวจ" */
    function costChecks(p, cost) {
      var out = [], jp = CFG.jump_pct_cost || 30, jb = CFG.jump_baht_cost || 40;
      if (!(cost > 0)) { out.push({ code: 'missing', severity: 'critical', text: 'ทุนเป็น 0 หรือว่าง' }); return out; }
      /* ทุน ≤10 ฿ ผิดปกติก็ต่อเมื่อของเดิมไม่ได้ถูกขนาดนั้น (กระดูกข้อขา/เลือด ทุน 3–6 ฿ เป็นปกติของมัน) */
      if (cost <= MIN_REASONABLE && !(p.cost > 0 && p.cost <= MIN_REASONABLE * 2)) out.push({ code: 'tiny', severity: 'critical', text: 'ทุน ' + cost + ' ฿/กก. ≤ ' + MIN_REASONABLE + ' ฿ ต่ำกว่าที่สมเหตุผล — ลืมหน่วย/ทศนิยม?' });
      if (p.cost > 0) {
        var d = cost - p.cost, pct = Math.round(d / p.cost * 1000) / 10;
        if (Math.abs(pct) >= 50) out.push({ code: 'jump', severity: 'critical', text: 'Critical Anomaly: ' + p.cost + ' → ' + cost + ' (' + (pct > 0 ? '+' : '') + pct + '%) ผิดจาก historical pattern อย่างมีนัยสำคัญ' });
        else if (Math.abs(pct) >= jp || Math.abs(d) >= jb) out.push({ code: 'jump', severity: 'warn', text: 'กระโดดจาก ' + p.cost + ' → ' + cost + ' (' + (pct > 0 ? '+' : '') + pct + '% · ' + (d > 0 ? '+' : '') + d + ' ฿) เกินเกณฑ์ ' + jp + '% / ' + jb + ' ฿' });
      }
      if (p.w2 > 0 && cost >= p.w2) out.push({ code: 'above-price', severity: 'critical', text: 'ทุนสูงกว่า/เท่ากับราคาขายปัจจุบัน ' + p.w2 + ' ฿ — ขายแล้วขาดทุนทันที' });
      var h = histRange(p); if (h && (cost < h.lo * 0.8 || cost > h.hi * 1.25) && !out.some(function (c) { return c.code === 'jump'; })) out.push({ code: 'history', severity: 'warn', text: 'นอกช่วงประวัติทุน ' + h.lo + '–' + h.hi + ' ฿ (' + h.n + ' ครั้งล่าสุด)' });
      /* เทียบกลุ่ม: เตือนเฉพาะเมื่อทุนใหม่ "หลุด" ออกจากช่วงกลุ่มทั้งที่ทุนเดิมอยู่ในช่วง (ของที่ถูก/แพงกว่ากลุ่มมาตลอด ไม่ใช่ความผิดปกติ) */
      var med = groupMedianCost(p.grp), inBand = function (c) { return c >= med * 0.4 && c <= med * 2.5; };
      if (med && cost > MIN_REASONABLE && (!(p.cost > 0) || inBand(p.cost))) { if (cost < med * 0.4) out.push({ code: 'group-low', severity: 'warn', text: 'ต่ำกว่าครึ่งของทุนกลางกลุ่ม ' + p.grp + ' (' + med + ' ฿)' }); else if (cost > med * 2.5) out.push({ code: 'group-high', severity: 'warn', text: 'สูงกว่าทุนกลางกลุ่ม ' + p.grp + ' (' + med + ' ฿) เกิน 2.5 เท่า' }); }
      return out;
    }
    function batchId() { var td = today(), tag = td.slice(8, 10) + td.slice(5, 7) + td.slice(2, 4), n = (D.cost_batches || []).filter(function (b) { return b.id.indexOf('COST-' + tag) === 0; }).length + 1; return 'COST-' + tag + '-' + (n < 10 ? '0' : '') + n; }
    function candidatesFor(name, grpHint) { return rankProducts(name, grpHint).slice(0, 3).filter(function (c) { return c.score >= 0.35; }).map(function (c) { return { id: c.p.id, name: c.p.name, grp: c.p.grp, score: Math.round(Math.min(c.score, 1) * 100) / 100, cost: c.p.cost }; }); }
    /* นำเข้าทุน (ไฟล์ / วาง / กรอกมือ / กล่องรับ / LINE) — commit=false = แค่ตรวจ */
    function importCosts(role, body) {
      var rows = Array.isArray(body.rows) ? body.rows : [], commit = !!body.commit, source = body.source || 'ไฟล์ทุน AL', channel = body.channel || 'upload';
      if (!rows.length) return err(400, 'ไม่มีแถวในไฟล์');
      var effective = String(body.effective_date || '').slice(0, 10) || (String(body.file || source).match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || today();
      var seen = {}, out = [], problems = [], review = [], auto = [], unchanged = [], byKind = {};
      var push = function (item, kind, severity, reasons) { item.kind = kind; item.kindText = KIND_TEXT[kind]; item.severity = severity; item.reasons = reasons; item.status = 'review'; byKind[kind] = (byKind[kind] || 0) + 1; review.push(item); out.push(item); };
      rows.forEach(function (r, i) {
        var rawName = String(r.product || r.name || '').trim(), name = cleanName(rawName), u = normUnit(r.unit || body.unit), raw = String(r.cost == null ? '' : r.cost).replace(/[,฿\s]/g, '');
        var idxNo = r.idx != null && r.idx !== '' && isFinite(Number(r.idx)) ? Number(r.idx) : null;
        if (!idxNo && /^\d{1,3}[.)]?\s+[ก-๙A-Za-z]/.test(rawName)) idxNo = Number(rawName.match(/^\d{1,3}/)[0]);
        if (rawName && !/[ก-๙A-Za-z]{2,}/.test(name)) return problems.push({ row: i + 1, name: rawName, reason: 'ไม่ใช่แถวสินค้า (ไม่มีชื่อ)' });   /* หัวตาราง/บรรทัดรวม/ตัวเลขล้วน */
        if (rawName && /^(รายการ|ลำดับ|ราคาขาย|ราคามีผล|column|total|รวม)/i.test(name)) return problems.push({ row: i + 1, name: rawName, reason: 'หัวตาราง' });
        var cost = num(raw); if (cost != null) cost = Math.round(cost * u.factor * 100) / 100;
        var item = { row: i + 1, raw: name, raw_file: rawName, idx: idxNo, cost: cost, cost_raw: raw, unit: u.unit, unit_note: u.note || '', effective_date: effective, source: source };
        /* STEP 03 จับคู่ SKU: product_id ตรง → เลขลำดับในใบ AL (pdf_idx) + ชื่อคล้าย → alias ที่คนเคยจับ → ตรงชื่อ/ล้างชื่อ → คล้าย ≥0.9 = Matched · 0.6–0.9 = Possible · ต่ำกว่า = Unmatched */
        var m = null;
        if (r.product_id) { var pp = product(r.product_id); if (pp) m = { p: pp, how: 'id', score: 1 }; }
        if (!m && idxNo != null) { var pi = D.pricelist.rows.filter(function (x) { return x.pdf_idx === idxNo; })[0];
          if (pi) { var sim = name ? Math.max(dice(name, pi.name), norm(name) === norm(pi.name) ? 1 : 0) : 1; if (sim >= 0.45) m = { p: pi, how: 'idx', score: Math.round(Math.max(sim, 0.9) * 100) / 100 }; else item.idxCandidate = { id: pi.id, name: pi.name, grp: pi.grp, score: Math.round(sim * 100) / 100, cost: pi.cost }; } }
        if (!m && name) { var al = D.sku_aliases[norm(name)]; if (al) { var ap = product(al); if (ap) m = { p: ap, how: 'alias', score: 1 }; } }
        if (!m && name) m = matchProduct(name, r.grp);
        if (!name && !r.product_id) return problems.push({ row: i + 1, reason: 'ไม่มีชื่อสินค้า' });
        if (!m) { item.candidates = candidatesFor(name, r.grp); if (item.idxCandidate && !item.candidates.some(function (c) { return c.id === item.idxCandidate.id; })) item.candidates.unshift(item.idxCandidate); var top = item.candidates[0];
          if (item.idxCandidate) return push(item, 'possible', 'warn', ['ลำดับ ' + idxNo + ' ในใบ = "' + item.idxCandidate.name + '" แต่ชื่อในไฟล์ "' + name + '" ไม่เหมือน (คล้าย ' + Math.round(item.idxCandidate.score * 100) + '%) — ใบราคาเปลี่ยนลำดับ/เปลี่ยนชื่อ? ให้คนเลือก']);
          if (top && top.score >= 0.6) return push(item, 'possible', 'warn', ['ชื่อในไฟล์ "' + name + '" ใกล้เคียงหลายตัว (' + item.candidates.map(function (c) { return c.name + ' ' + Math.round(c.score * 100) + '%'; }).join(' · ') + ') — กำกวม ระบบไม่เดา ให้คนเลือก แล้วจะจำไว้']);
          return push(item, 'unmatched', 'critical', ['ไม่พบสินค้านี้ใน Product Master — เลือก SKU ที่ใช่ (ระบบจะจำชื่อนี้ไว้) หรือเพิ่มสินค้าใหม่']); }
        item.product_id = m.p.id; item.name = m.p.name; item.grp = m.p.grp; item.how = m.how; item.score = m.score; item.prev = m.p.cost; item.changed = cost != null && cost !== m.p.cost;
        if (m.how === 'fuzzy' && m.score < 0.9) { item.candidates = candidatesFor(name, r.grp); return push(item, 'possible', 'warn', ['ชื่อในไฟล์ "' + name + '" น่าจะเป็น "' + m.p.name + '" (คล้าย ' + Math.round(m.score * 100) + '%) — ยืนยัน SKU ก่อน ระบบจะจำไว้']); }
        if (seen[m.p.id]) return push(item, 'duplicate', 'warn', ['ซ้ำกับแถว ' + seen[m.p.id] + ' (' + m.p.name + ') — เลือกว่าจะใช้แถวไหน']);
        seen[m.p.id] = i + 1;
        if (!u.valid) return push(item, 'unit', 'critical', ['หน่วย "' + (r.unit || body.unit) + '" แปลงเป็นบาท/กก. ไม่ได้ — ยืนยันหน่วยก่อน']);
        if (!(cost > 0)) return push(item, 'missing', 'critical', ['ทุนว่าง/เป็น 0 — ' + (raw ? 'อ่านค่า "' + raw + '" ไม่ได้' : 'ไม่มีตัวเลข')]);
        /* ใบรอบเก่า: ไฟล์ที่มีผลก่อนทุนที่ใช้อยู่ (เช่น อัปโหลดใบสัปดาห์ก่อนซ้ำ หรือเล่นซ้ำข้อมูลเก่า) ห้ามทับทุนปัจจุบันเอง — ส่งให้คนยืนยัน */
        var cmE = String(((S.cost_master || {})[m.p.id] || {}).effective_date || '').slice(0, 10);
        if (item.changed && cmE && effective < cmE) return push(item, 'old_sheet', 'warn', ['ไฟล์นี้มีผล ' + effective + ' เก่ากว่าทุนที่ใช้อยู่ (มีผล ' + cmE + ') — น่าจะเป็นใบรอบเก่า ระบบไม่ทับทุนปัจจุบันเอง']);
        var checks = item.changed ? costChecks(m.p, cost) : []; item.checks = checks;   /* ทุนเท่าเดิม = ไม่มีอะไรใหม่ให้ตรวจ */
        if (checks.length) return push(item, 'anomaly', checks.some(function (c) { return c.severity === 'critical'; }) ? 'critical' : 'warn', checks.map(function (c) { return c.text; }));
        item.status = item.changed ? 'auto' : 'unchanged'; out.push(item); (item.changed ? auto : unchanged).push(item);
      });
      var res = { effective_date: effective, source: source, rows: out, auto: auto.length, unchanged: unchanged.length, review: review.length, byKind: byKind, flags: review, problems: problems, problemCount: problems.length,
        ok: auto.length + unchanged.length, changed: auto.length, flagged: review.length, fuzzy: out.filter(function (x) { return x.how === 'fuzzy' || x.how === 'alias'; }).length, alias: out.filter(function (x) { return x.how === 'alias'; }).length };
      if (!commit) return ok(res);
      jobStart('cost-import');
      try {
        var bid = batchId(), applied = 0;
        auto.forEach(function (x) { if (X.setCost(x.product_id, x.cost, source, role, { batch_id: bid, effective_date: effective })) applied++; });
        review.forEach(function (x) { D.cost_flags.unshift({ id: nextId('cf'), at: stamp(), batch_id: bid, import_id: bid, kind: x.kind, kindText: x.kindText, severity: x.severity, product_id: x.product_id || null, name: x.name || x.raw, raw: x.raw, grp: x.grp || null, prev: x.prev == null ? null : x.prev, cost: x.cost, unit: x.unit, candidates: x.candidates || null, reasons: x.reasons, checks: x.checks || [], status: 'pending', row: x.row, source: source }); });
        X.afterCosts();
        var batch = { id: bid, at: stamp(), by: role, source: source, channel: channel, file: body.file || '', effective_date: effective, rows: rows.length, auto: applied, unchanged: unchanged.length, review: review.length, byKind: byKind, problems: problems.length, status: review.length ? 'review' : 'done', matched: out.length,
          exact: out.filter(function (x) { return x.how && x.how !== 'fuzzy'; }).length, byIdx: out.filter(function (x) { return x.how === 'idx'; }).length, fuzzy: out.filter(function (x) { return x.how === 'fuzzy'; }).length, unmatched: byKind.unmatched || 0, applied: applied, flagged: review.length };
        D.cost_batches.unshift(batch); D.cost_imports.unshift(batch); res.batch = batch; res.batch_id = bid; res.import_id = bid; res.applied = applied;
        jobDone('cost-import', bid + ' · Auto Pass ' + applied + ' · Review ' + review.length + ' · ไม่เปลี่ยน ' + unchanged.length);
        if (review.length) alert(review.some(function (x) { return x.severity === 'critical'; }) ? 'bad' : 'warn', 'Batch ' + bid + ' มี ' + review.length + ' รายการรอคนตรวจ', Object.keys(byKind).map(function (k) { return KIND_TEXT[k] + ' ' + byKind[k]; }).join(' · '), 'cost-import');
        X.audit(role, 'import-costs', bid + ' · Auto ' + applied + ' · Review ' + review.length + ' (' + source + ')');
      } catch (e) { jobFail('cost-import', e); return err(500, 'นำเข้าไม่สำเร็จ — ' + e.message); }
      return ok(res);
    }
    function batchRefresh(bid) { var b = D.cost_batches.filter(function (x) { return x.id === bid; })[0]; if (!b) return; var pend = D.cost_flags.filter(function (f) { return f.batch_id === bid && (f.status === 'pending' || f.status === 'hold'); }).length; b.pendingNow = pend; b.status = pend ? 'review' : 'done'; }
    /* STEP 06 Cost Review — confirm (ใช้ตามไฟล์) · correct (แก้เลขแล้วใช้) · hold (พักไว้ ยังไม่อัปเดต Cost Master) · match (เลือก SKU + จำชื่อ) · skip (ไม่ใช้) */
    function decideFlag(role, body) {
      var f = D.cost_flags.filter(function (x) { return x.id === Number(body.id); })[0]; if (!f) return err(404, 'ไม่พบรายการ');
      if (f.status !== 'pending' && f.status !== 'hold') return err(400, 'ตัดสินไปแล้ว (' + f.status + ')');
      var action = body.action || (body.approve === true ? (body.cost != null && body.cost !== '' && num(body.cost) !== f.cost ? 'correct' : 'confirm') : body.approve === false ? 'skip' : '');
      var note = String(body.note || '').trim(), at = stamp();
      var done = function (st, final) { f.status = st; f.final = final == null ? null : final; f.decided_by = role; f.decided_at = at; f.note = note; batchRefresh(f.batch_id); X.afterCosts(); };
      if (action === 'match') {
        var p = product(body.product_id); if (!p) return err(400, 'เลือกสินค้าในระบบก่อน');
        D.sku_aliases[norm(f.raw)] = p.id; MATCH_CACHE = {};
        (D.sku_alias_log = D.sku_alias_log || []).unshift({ raw: f.raw, product_id: p.id, name: p.name, by: role, at: at });
        f.product_id = p.id; f.name = p.name; f.grp = p.grp; f.prev = p.cost;
        var dup = D.cost_flags.some(function (x) { return x !== f && x.batch_id === f.batch_id && x.product_id === p.id && x.status === 'pending'; });
        var checks = f.cost > 0 ? costChecks(p, f.cost) : [{ code: 'missing', severity: 'critical', text: 'ทุนว่าง' }];
        if (dup) checks.unshift({ code: 'duplicate', severity: 'warn', text: 'มีแถวอื่นใน batch นี้ชี้ SKU เดียวกัน' });
        if (checks.length) { f.kind = checks[0].code === 'duplicate' ? 'duplicate' : 'anomaly'; f.kindText = KIND_TEXT[f.kind]; f.severity = checks.some(function (c) { return c.severity === 'critical'; }) ? 'critical' : 'warn'; f.checks = checks; f.reasons = checks.map(function (c) { return c.text; }); f.matched_by = role; X.audit(role, 'sku-match', f.raw + ' → ' + p.name + ' (ยังต้องตรวจทุน)'); return ok({ ok: true, status: 'pending', rematched: true, name: p.name, reasons: f.reasons }); }
        if (f.cost === p.cost) { done('unchanged', f.cost); X.audit(role, 'sku-match', f.raw + ' → ' + p.name + ' (ทุนเท่าเดิม)'); return ok({ ok: true, status: f.status, name: p.name }); }
        X.setCost(p.id, f.cost, f.source + ' (จับคู่โดยคน)', role, { batch_id: f.batch_id }); done('approved', f.cost);
        X.audit(role, 'sku-match', f.raw + ' → ' + p.name + ' · ใช้ทุน ' + f.cost); return ok({ ok: true, status: f.status, name: p.name });
      }
      if (!f.product_id && action !== 'skip') return err(400, 'รายการนี้ยังไม่รู้ว่าเป็น SKU ไหน — เลือก SKU ก่อน');
      if (action === 'confirm' || action === 'correct') {
        var cost = action === 'correct' ? num(body.cost) : f.cost;
        if (!(cost > 0)) return err(400, 'ทุนต้องมากกว่า 0');
        if (action === 'correct' && !note) note = 'แก้จาก ' + f.cost + ' เป็น ' + cost;
        X.setCost(f.product_id, cost, f.source + (action === 'correct' ? ' (แก้แล้วตรวจแล้ว)' : ' (ตรวจแล้ว)'), role, { batch_id: f.batch_id });
        done(action === 'correct' ? 'corrected' : 'approved', cost);
        X.audit(role, 'cost-review', f.name + ' → ' + (action === 'correct' ? 'แก้เป็น ' : 'ยืนยัน ') + cost + (note ? ' · ' + note : ''));
        return ok({ ok: true, status: f.status, cost: cost });
      }
      if (action === 'hold') {
        X.holdCost(f.product_id, { cost: f.cost, batch_id: f.batch_id, flag_id: f.id, reason: note || 'รอยืนยันจากต้นทาง' }, role);
        f.status = 'hold'; f.decided_by = role; f.decided_at = at; f.note = note; batchRefresh(f.batch_id);
        X.audit(role, 'cost-review', f.name + ' → พักไว้ (Waiting for Cost Confirmation)' + (note ? ' · ' + note : ''));
        return ok({ ok: true, status: 'hold' });
      }
      if (action === 'skip') {
        if (f.product_id) { var cm = X.costMasterOf(f.product_id); if (cm && cm.state === 'waiting' && cm.pending && cm.pending.flag_id === f.id) X.releaseCost(f.product_id); }
        done('rejected', null);
        X.audit(role, 'cost-review', (f.name || f.raw) + ' → ไม่ใช้ค่าจากไฟล์' + (note ? ' · ' + note : ''));
        return ok({ ok: true, status: 'rejected' });
      }
      return err(400, 'action ต้องเป็น confirm / correct / hold / match / skip');
    }
    function reviewQueue(q) {
      var rows = D.cost_flags.filter(function (f) { return (!q.status || f.status === q.status) && (!q.batch || f.batch_id === q.batch); });
      var pend = D.cost_flags.filter(function (f) { return f.status === 'pending' || f.status === 'hold'; }), byKind = {}; pend.forEach(function (f) { byKind[f.kind] = (byKind[f.kind] || 0) + 1; });
      return { rows: rows.slice(0, Number(q.limit) || 200), pending: pend.length, byKind: byKind, kindText: KIND_TEXT, imports: D.cost_batches.slice(0, 20), batches: D.cost_batches.slice(0, 20), aliases: Object.keys(D.sku_aliases).length };
    }

    /* ════════ 2 · เทียบตลาด: connector รายวัน · จับคู่ SKU · แนวโน้ม · คะแนนเตือน ════════ */
    function compOf(id) { return D.pricelist.comps.filter(function (c) { return c.id === id; })[0]; }
    function obsByProduct(pid, cid) { return D.market_obs.filter(function (o) { return o.product_id === pid && (!cid || o.competitor_id === cid); }).sort(function (a, b) { return a.observed_at < b.observed_at ? -1 : 1; }); }
    /* รับผลจาก connector (array ของการเห็นราคา) — จับคู่ · เก็บ · อัปเดตราคาคู่แข่งล่าสุด · คิดแนวโน้ม+คำทำนาย */
    function marketSync(role, body) {
      var obs = Array.isArray(body.observations) ? body.observations : [];
      if (!obs.length) return err(400, 'connector ไม่ส่งข้อมูลมา (observations ว่าง)');
      jobStart('market-sync');
      try {
        var dates = obs.map(function (o) { return String(o.observed_at || today()).slice(0, 10); }).sort(), first = dates[0], lastD = dates[dates.length - 1];
        var span = (Date.parse(lastD) - Date.parse(first)) / 864e5, total = { added: 0, matched: {}, unmatched: {} }, tr;
        /* ครั้งแรกที่ได้ประวัติย้อนหลังยาว: เล่นทีละสัปดาห์เหมือนที่ระบบรายวันจะสะสมมา — คำทำนายเก่าจึงมีของจริงให้ตรวจ (ประเมินย้อนหลัง) */
        if (!D.market_obs.length && span > 10) {
          var cut = new Date(first + 'T00:00:00Z');
          while (true) { cut.setUTCDate(cut.getUTCDate() + 7); var c = cut.toISOString().slice(0, 10); if (c >= lastD) c = lastD;
            ingest(obs.filter(function (o) { return String(o.observed_at || today()).slice(0, 10) <= c; }), c, total); tr = computeTrend(true, c); if (c === lastD) break; }
        } else { ingest(obs, lastD > today() ? today() : lastD, total); tr = computeTrend(true, lastD > today() ? today() : lastD); }
        var um = Object.keys(total.unmatched);
        var detail = 'เห็นราคาใหม่ ' + total.added + ' · SKU ที่มีราคา ' + tr.coverage.known + '/' + tr.coverage.total + (um.length ? ' · จับคู่ไม่ได้ ' + um.length : '');
        jobDone('market-sync', detail);
        if (um.length) alert('warn', 'ราคาตลาด ' + um.length + ' รายการจับคู่ SKU ไม่ได้', um.slice(0, 5).join(' · '), 'market-sync');
        return ok({ ok: true, added: total.added, matched: Object.keys(total.matched).length, unmatched: um, coverage: tr.coverage, warnings: tr.warnings.length, score: tr.score.pct });
      } catch (e) { jobFail('market-sync', e); return err(500, 'ดึงราคาตลาดไม่สำเร็จ — ' + e.message); }
    }
    /* เก็บการเห็นราคา (ข้ามที่เคยเก็บแล้ว) และดันราคาล่าสุดต่อคู่แข่งไปตารางราคาตลาดที่ทุกหน้าใช้ */
    function ingest(obs, asOf, total) {
      var latest = {}, keys = {}; D.market_obs.forEach(function (x) { keys[x.key] = 1; });
      obs.forEach(function (o) {
        var cid = o.competitor || o.competitor_id, price = num(String(o.price).replace(/,/g, '')), at = String(o.observed_at || asOf).slice(0, 10);
        if (!compOf(cid) || !(price > 0)) return;
        var m = matchProduct(o.sku || o.name); if (!m) { total.unmatched[o.sku || o.name] = 1; return; }
        var key = cid + '|' + m.p.id + '|' + at; if (keys[key]) return; keys[key] = 1;
        D.market_obs.push({ id: nextId('ob'), key: key, competitor_id: cid, product_id: m.p.id, sku: o.sku || o.name, how: m.how, price: price, unit: o.unit || 'บาท/กก.', observed_at: at, source_url: o.source_url || (compOf(cid).source || ''), ingested_at: stamp(), via: o.via || 'online', by: o.by || 'connector' });
        if (!o.via || o.via === 'online') { var ss = D.source_status[cid] = D.source_status[cid] || {}; ss.mode = 'online'; ss.last_ok = stamp(); ss.fails = 0; }
        total.added++; total.matched[m.p.id] = 1;
        var lk = cid + '|' + m.p.id; if (!latest[lk] || latest[lk].at < at) latest[lk] = { pid: m.p.id, cid: cid, price: price, at: at };
      });
      if (D.market_obs.length > 20000) D.market_obs.splice(0, D.market_obs.length - 20000);
      var items = Object.keys(latest).map(function (k) { return { product_id: latest[k].pid, competitor_id: latest[k].cid, price: latest[k].price, seen: latest[k].at }; });
      if (!items.length) return;
      X.competitorPrices('system', { items: items });
      items.forEach(function (it) { var age = ageDays(it.seen); var fix = function (marks) { (marks || []).forEach(function (m) { if (m.id === it.competitor_id) { m.age = age; m.seen = it.seen; m.state = age > STALE_MARKET_DAYS ? 'expired' : 'fresh'; } }); };
        var P = product(it.product_id); if (P) fix(P.marks); X.desks().forEach(function (d) { d.rows.forEach(function (r) { if (r.id === it.product_id) fix(r.marks); }); }); });
      var pids = {}; items.forEach(function (it) { pids[it.product_id] = 1; }); Object.keys(pids).forEach(function (pid) { X.recalcProduct(pid); });   /* อายุข้อมูลตลาดถูกต้องแล้วค่อยคิด Competitive/แนะนำ */
    }
    function priceAt(list, date) { var v = null; for (var i = 0; i < list.length; i++) { if (list[i].observed_at <= date) v = list[i].price; else break; } return v; }
    function pct(a, b) { return a && b ? r1((b - a) / a * 100) : null; }
    /* แนวโน้มรายหมวด (ย้อนหลังถึง 1 ปี) + คำเตือน + คำทำนาย 7 วันข้างหน้า (บันทึกไว้ให้ตรวจย้อนหลังได้ว่าถูกกี่ครั้ง)
       detailGrp = ขอรายละเอียดราย SKU ของหมวดนั้น (ซีรีส์รายเดือน + ราคาคาดการณ์เมื่อไม่มีการสำรวจ) */
    function monthKey(d) { return String(d).slice(0, 7); }
    function monthsBack(td, n) { var out = [], d = new Date(td.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - n + 1); for (var i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); } return out; }
    function computeTrend(persist, asOf, detailGrp) {
      var td = asOf || today(), days = function (n) { var d = new Date(td + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
      var d7 = days(7), d30 = days(30), d90 = days(90), d365 = days(365), byG = {}, prods = {}, known = 0, MONTHS = monthsBack(td, 12);
      D.market_obs.forEach(function (o) { if (o.observed_at <= td) (prods[o.product_id] = prods[o.product_id] || {})[o.competitor_id] = 1; });
      var med = function (a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; };
      Object.keys(prods).forEach(function (pid) {
        var P = product(pid); if (!P) return; known++;
        Object.keys(prods[pid]).forEach(function (cid) {
          var list = obsByProduct(pid, cid).filter(function (o) { return o.observed_at <= td; }); if (!list.length) return;
          var last = list[list.length - 1], first = list[0], age = Math.round((Date.parse(td) - Date.parse(last.observed_at)) / 864e5);
          var g = byG[P.grp] = byG[P.grp] || { grp: P.grp, c7: [], c30: [], c90: [], c365: [], n: 0, over: 0, under: 0, gapSum: 0, gapN: 0, items: [], ratios: [], months: {}, obs: 0, survey: 0, lastSeen: '' };
          g.n++; g.obs += list.length; g.survey += list.filter(function (o) { return o.via === 'survey'; }).length; if (last.observed_at > g.lastSeen) g.lastSeen = last.observed_at;
          /* ซีรีส์รายเดือน: ราคาเฉลี่ยต่อเดือนของ SKU นี้ แล้วทำเป็นดัชนี (เดือนแรกที่มีข้อมูล = 100) เพื่อรวมข้าม SKU/คู่แข่งได้ */
          var mm = {}; list.forEach(function (o) { var k = monthKey(o.observed_at); (mm[k] = mm[k] || []).push(o.price); });
          var base = null, ser = MONTHS.map(function (k) { if (!mm[k]) return null; var v = mm[k].reduce(function (a, b) { return a + b; }, 0) / mm[k].length; if (base == null) base = v; return v; });
          ser.forEach(function (v, i) { if (v != null && base) (g.months[MONTHS[i]] = g.months[MONTHS[i]] || []).push(v / base * 100); });
          var comp = compOf(cid), fresh = age <= 10;
          var c7 = fresh ? pct(priceAt(list, d7), last.price) : null, c30 = fresh ? pct(priceAt(list, d30) || (first.observed_at >= d30 ? null : first.price), last.price) : null;
          var c90 = pct(priceAt(list, d90) || (first.observed_at >= d90 ? null : first.price), last.price), c365 = pct(priceAt(list, d365) || (first.observed_at > d365 && first.observed_at < d90 ? first.price : null), last.price);
          if (c7 != null) g.c7.push(c7); if (c30 != null) g.c30.push(c30); if (c90 != null) g.c90.push(c90); if (c365 != null) g.c365.push(c365);
          if (comp && comp.tier === 'w' && fresh) { if (P.w2 > last.price) g.over++; else g.under++; g.gapSum += P.w2 - last.price; g.gapN++; }
          if (comp && comp.tier === 'w' && P.w2) g.ratios.push(last.price / P.w2);
          g.items.push({ id: pid, name: P.name, comp: comp ? comp.label : cid, cid: cid, tier: comp ? comp.tier : '', price: last.price, seen: last.observed_at, age: age, via: last.via || 'online', n: list.length, c7: c7, c30: c30, c90: c90, c365: c365, our: P.w2, gap: P.w2 - last.price, series: ser, mm: mm });
        });
      });
      var dir = function (c, th) { th = th || 1; return c == null ? 'unknown' : c > th ? 'up' : c < -th ? 'down' : 'flat'; };
      var groups = Object.keys(byG).map(function (k) { var g = byG[k], c7 = med(g.c7), c30 = med(g.c30), c90 = med(g.c90), c365 = med(g.c365);
        var idx = MONTHS.map(function (m) { return g.months[m] ? Math.round(med(g.months[m]) * 10) / 10 : null; });
        var main = c90 != null ? c90 : c365 != null ? c365 : c30;
        return { grp: g.grp, n: g.n, obs: g.obs, survey: g.survey, lastSeen: g.lastSeen || null, change7: c7, change30: c30, change90: c90, change365: c365, direction: dir(main, 2), momentum: dir(c7, 1.5), over: g.over, under: g.under, gapAvg: g.gapN ? r1(g.gapSum / g.gapN) : null, ratio: med(g.ratios),
          series: { months: MONTHS, idx: idx }, items: g.items.sort(function (a, b) { return (b.c90 || 0) - (a.c90 || 0); }) }; })
        .sort(function (a, b) { return Math.abs(b.change90 != null ? b.change90 : b.change365 || 0) - Math.abs(a.change90 != null ? a.change90 : a.change365 || 0); });
      var costMove = {}; S.products.forEach(function (p) { if (p.cost > 0 && p.prev_cost > 0) { var g = costMove[p.grp] = costMove[p.grp] || []; g.push(pct(p.prev_cost, p.cost)); } });
      var warnings = [];
      groups.forEach(function (g) {
        var cm = med(costMove[g.grp] || []), c = g.change90 != null ? g.change90 : g.change365, horizon = g.change90 != null ? '90 วัน' : '1 ปี';
        if (c != null && c >= 4) warnings.push({ level: 'good', grp: g.grp, text: 'ตลาด' + g.grp + ' ขึ้น ' + c + '% ใน ' + horizon + (g.gapAvg != null && g.gapAvg < 0 ? ' — เราถูกกว่าราคาส่งคู่แข่งเฉลี่ย ' + (-g.gapAvg) + ' ฿ มีช่องขยับราคากลางขึ้น' : ' — ตรวจราคากลางหมวดนี้ก่อนประกาศ') });
        if (c != null && c <= -4) warnings.push({ level: 'bad', grp: g.grp, text: 'ระวัง: ตลาด' + g.grp + ' ลง ' + (-c) + '% ใน ' + horizon + (g.over ? ' — เราแพงกว่าคู่แข่ง ' + g.over + ' รายการ เสี่ยงโดนต่อรอง/เสียลูกค้า' : '') });
        if (cm != null && cm > 3 && (g.change30 == null || g.change30 < cm - 3)) warnings.push({ level: 'warn', grp: g.grp, text: 'margin ' + g.grp + ' กำลังบีบ: ทุนเราขึ้น ' + cm + '% แต่ตลาดขยับ ' + (g.change30 == null ? 'ไม่รู้' : g.change30 + '%') + ' — ขึ้นราคาตามทุนไม่ได้เต็มที่' });
        if (g.momentum !== 'unknown' && g.momentum !== 'flat' && g.direction !== 'unknown' && g.momentum !== g.direction) warnings.push({ level: 'warn', grp: g.grp, text: g.grp + ' 7 วันล่าสุดกลับทิศ (' + (g.momentum === 'up' ? 'ขึ้น' : 'ลง') + ' ' + Math.abs(g.change7) + '%) ต่างจากแนวโน้มระยะยาว — รอดูอีก 1 รอบก่อนปรับราคากลาง' });
        var ageG = g.lastSeen ? Math.round((Date.parse(td) - Date.parse(g.lastSeen)) / 864e5) : null;
        if (ageG != null && ageG > 14) warnings.push({ level: 'warn', grp: g.grp, text: 'หมวด' + g.grp + ' ไม่มีราคาตลาดใหม่มา ' + ageG + ' วัน — ตอนนี้ใช้ราคาคาดการณ์จากแนวโน้ม 1 ปี · ควรส่งคนไปสำรวจ' });
      });
      var sources = D.pricelist.comps.map(function (c) { var l = D.market_obs.filter(function (o) { return o.competitor_id === c.id; }); var lastSeen = l.reduce(function (a, o) { return o.observed_at > a ? o.observed_at : a; }, ''); var age = ageDays(lastSeen);
        if (l.length && age > 3 && !asOf) warnings.push({ level: 'bad', grp: '', text: 'connector ' + c.label + ' ไม่ส่งราคามา ' + age + ' วันแล้ว — ตรวจการเชื่อมต่อ' });
        return { id: c.id, label: c.label, tier: c.tier, count: l.length, skus: Object.keys(l.reduce(function (m, o) { m[o.product_id] = 1; return m; }, {})).length, lastSeen: lastSeen || null, age: age, source: c.source || '' }; });
      if (persist) {
        /* ทำนายเฉพาะหมวดที่แนวโน้ม 90 วันชัด (|Δ| ≥ 3%) → ทิศ 30 วันข้างหน้า · ตรวจเมื่อครบกำหนดด้วยทิศจริงของ 30 วันนั้น */
        groups.forEach(function (g) {
          var c = g.change90; if (c == null || Math.abs(c) < 3) return;
          var open = D.predictions.filter(function (p) { return p.grp === g.grp && !p.resolved; })[0]; if (open) return;
          D.predictions.unshift({ id: nextId('pr'), made_at: td, due_at: days(-30), horizon: 30, grp: g.grp, predicted: c > 0 ? 'up' : 'down', basis: '90 วัน ' + (c > 0 ? '+' : '') + c + '% · 30 วัน ' + (g.change30 == null ? '—' : (g.change30 > 0 ? '+' : '') + g.change30 + '%'), ref: g.items.filter(function (it) { return it.age <= 14; }).map(function (it) { return { id: it.id, comp: it.comp, price: it.price }; }), resolved: false, hit: null, actual: null });
        });
        D.predictions.forEach(function (p) {
          if (p.resolved || p.due_at > td) return;
          var ch = []; p.ref.forEach(function (r) { var comp = D.pricelist.comps.filter(function (c) { return c.label === r.comp; })[0]; var list = obsByProduct(r.id, comp && comp.id); var now = priceAt(list, p.due_at); if (now && list.length && list[list.length - 1].observed_at >= days(Math.round((Date.parse(td) - Date.parse(p.due_at)) / 864e5) + 10)) ch.push(pct(r.price, now)); });
          if (!ch.length) { if ((Date.parse(td) - Date.parse(p.due_at)) / 864e5 > 14) { p.resolved = true; p.hit = null; p.actual = null; p.note = 'ไม่มีข้อมูลตรวจ'; } return; }
          var a = med(ch); p.resolved = true; p.actual = a; p.actual_dir = dir(a, 0.3); p.hit = p.actual_dir === p.predicted; p.resolved_at = td;
          logEvent({ actor: 'system', action: 'trend-verify', entity: 'prediction', entity_id: p.id, detail: p.grp + ' ทำนาย ' + p.predicted + ' จริง ' + p.actual_dir + ' (' + a + '%)', status: p.hit ? 'ok' : 'warn' });
        });
      }
      var res = D.predictions.filter(function (p) { return p.resolved && p.hit != null; }), hits = res.filter(function (p) { return p.hit; }).length;
      var total = D.pricelist.rows.length;
      /* รายละเอียดราย SKU ของหมวดเดียว: ทุก SKU ในหมวด (ที่ไม่มีข้อมูลด้วย) + ราคาคาดการณ์ */
      var detail = null;
      if (detailGrp) {
        var g = groups.filter(function (x) { return x.grp === detailGrp; })[0], idxNow = g ? (function () { for (var i = g.series.idx.length - 1; i >= 0; i--) if (g.series.idx[i] != null) return g.series.idx[i]; return null; })() : null;
        var idxAt = function (date) { if (!g) return null; var m = monthKey(date), i = g.series.months.indexOf(m); for (var k = i; k >= 0; k--) if (g.series.idx[k] != null) return g.series.idx[k]; return null; };
        detail = { grp: detailGrp, ratio: g ? g.ratio : null, skus: D.pricelist.rows.filter(function (r) { return r.grp === detailGrp; }).map(function (r) {
          var its = g ? g.items.filter(function (it) { return it.id === r.id; }) : [], best = its.filter(function (it) { return it.tier === 'w'; })[0] || its[0];
          var est = null;
          if (best && best.age > 7 && idxNow && idxAt(best.seen)) est = { price: Math.round(best.price * idxNow / idxAt(best.seen)), basis: 'ราคาล่าสุด ' + best.price + ' ฿ (' + best.age + ' วันก่อน) × ดัชนีหมวดที่ขยับตั้งแต่นั้น', confidence: best.age <= 30 ? 'กลาง' : 'ต่ำ', from: best.comp };
          else if (!best && g && g.ratio && r.w2) est = { price: Math.round(r.w2 * g.ratio), basis: 'ไม่เคยเห็นราคา — ราคาส่งของเรา ' + r.w2 + ' ฿ × อัตราส่วนตลาด/เราของหมวด (' + r1(g.ratio * 100) / 100 + ')', confidence: 'ต่ำ', from: 'ประมาณจากหมวด' };
          return { id: r.id, name: r.name, our: r.w2, retail: r.retail, cost: r.cost, comps: its.map(function (it) { return { comp: it.comp, cid: it.cid, tier: it.tier, price: it.price, seen: it.seen, age: it.age, via: it.via, n: it.n, c30: it.c30, c90: it.c90, c365: it.c365, series: it.series }; }), est: est,
            status: best ? (best.age <= 7 ? 'fresh' : best.age <= 30 ? 'stale' : 'old') : 'blind' };
        }).sort(function (a, b) { var o = { fresh: 0, stale: 1, old: 2, blind: 3 }; return o[a.status] - o[b.status] || (b.comps[0] ? b.comps[0].n : 0) - (a.comps[0] ? a.comps[0].n : 0); }) };
      }
      groups.forEach(function (g) { g.items = g.items.map(function (it) { var o = {}; for (var k in it) if (k !== 'mm' && k !== 'series') o[k] = it[k]; return o; }); });
      return { asOf: td, months: MONTHS, groups: groups, warnings: warnings, sources: sources, coverage: { known: known, total: total, pct: Math.round(known / total * 100), observations: D.market_obs.length, span: D.market_obs.length ? D.market_obs.reduce(function (a, o) { return o.observed_at < a ? o.observed_at : a; }, '9') : null },
        score: { total: D.predictions.length, open: D.predictions.filter(function (p) { return !p.resolved; }).length, resolved: res.length, hits: hits, pct: res.length ? Math.round(hits / res.length * 100) : null, list: D.predictions.slice(0, 30) },
        costMove: Object.keys(costMove).map(function (g) { return { grp: g, change: med(costMove[g]) }; }), job: D.jobs['market-sync'], detail: detail };
    }
    function marketTrend(q) { return ok(computeTrend(false, null, q && q.grp || null)); }
    /* ราคาตลาดคาดการณ์ต่อ SKU เมื่อไม่มีการสำรวจ/ดึงล่าสุด — หน้า ทุน/ตลาด ใช้เติมช่องว่างแบบติดป้าย "คาด" */
    function marketEstimates() {
      var tr = computeTrend(false), out = {}, byG = {}; tr.groups.forEach(function (g) { byG[g.grp] = g; });
      var idxNow = function (g) { for (var i = g.series.idx.length - 1; i >= 0; i--) if (g.series.idx[i] != null) return g.series.idx[i]; return null; };
      var idxAt = function (g, date) { var m = String(date).slice(0, 7), i = g.series.months.indexOf(m); for (var k = i; k >= 0; k--) if (g.series.idx[k] != null) return g.series.idx[k]; return null; };
      D.pricelist.rows.forEach(function (r) {
        var g = byG[r.grp]; if (!g) return;
        var its = g.items.filter(function (it) { return it.id === r.id; }), best = its.filter(function (it) { return it.tier === 'w'; })[0] || its[0];
        if (best && best.age <= 7) return;
        if (best && idxNow(g) && idxAt(g, best.seen)) out[r.id] = { price: Math.round(best.price * idxNow(g) / idxAt(g, best.seen)), from: best.comp, age: best.age, confidence: best.age <= 30 ? 'กลาง' : 'ต่ำ', basis: 'ล่าสุด ' + best.price + ' × ดัชนีหมวด' };
        else if (!best && g.ratio && r.w2) out[r.id] = { price: Math.round(r.w2 * g.ratio), from: 'หมวด', age: null, confidence: 'ต่ำ', basis: 'ราคาส่งเรา × อัตราส่วนหมวด ' + Math.round(g.ratio * 100) / 100 };
      });
      return ok({ asOf: tr.asOf, estimates: out, n: Object.keys(out).length });
    }
    function marketObservations(q) {
      var list = D.market_obs.slice();
      if (q.sku || q.product_id) { var m = q.product_id ? { p: product(q.product_id) } : matchProduct(q.sku); if (!m || !m.p) return ok({ rows: [], product: null }); list = list.filter(function (o) { return o.product_id === m.p.id; }); return ok({ product: { id: m.p.id, name: m.p.name }, rows: list.sort(function (a, b) { return a.observed_at < b.observed_at ? 1 : -1; }) }); }
      return ok({ rows: list.sort(function (a, b) { return a.observed_at < b.observed_at ? 1 : -1; }).slice(0, Number(q.limit) || 200), total: list.length });
    }

    /* ════════ 3 · ส่งราคาให้ลูกค้าทาง LINE + สถานะใบ ════════ */
    function lineIdOf(cid) { var c = S.customers.filter(function (x) { return x.id === cid; })[0]; return c && c.line_user_id || ''; }
    function updateCustomer(role, cid, body) {
      var c = S.customers.filter(function (x) { return x.id === cid; })[0]; if (!c) return err(404, 'ไม่พบลูกค้า');
      ['line_user_id', 'contact', 'owner', 'note'].forEach(function (k) { if (body[k] != null) c[k] = String(body[k]).trim(); });
      X.audit(role, 'customer-update', c.name + (body.line_user_id != null ? ' · ผูก LINE' : ''));
      return ok({ ok: true, line_user_id: c.line_user_id || '' });
    }
    function enqueue(role, cid, kind, text, meta) {
      var c = custOf(cid), to = lineIdOf(cid);
      var o = Object.assign({ id: nextId('ob2'), at: stamp(), by: role, customer_id: cid, customer: c ? c.name : cid, to: to, kind: kind, text: text, status: to ? 'queued' : 'failed', error: to ? null : 'ยังไม่ได้ผูก LINE ของลูกค้า', attempts: 0, sent_at: null }, meta || {});
      D.outbox.unshift(o); if (D.outbox.length > 2000) D.outbox.length = 2000;
      logEvent({ actor: role, action: 'line-queue', entity: 'customer', entity_id: cid, detail: kind + (to ? '' : ' · ไม่มี LINE'), status: to ? 'ok' : 'fail' });
      return o;
    }
    function lineSend(role, body) {
      var cid = body.customer_id, sh = sheetFor(cid); if (!sh) return err(404, 'ไม่พบลูกค้า');
      var kind = body.kind || 'quote', text = body.text || '';
      if (kind === 'quote') {
        var q = X.quoteFor(cid, 'w2'); if (q.status !== 200) return q;
        var link = sh.link ? sh.link.url : (X.quoteLink(role, { customer_id: cid }, body.origin || '').body || {}).url;
        text = q.body.text + (link ? '\n\nยืนยัน/ขอต่อรองทีละรายการได้ที่ ' + link : '');
      }
      if (kind === 'nudge' && !text) text = nudgeText(sh);
      if (!lineIdOf(cid)) return err(400, 'ยังไม่ได้ผูก LINE ของ ' + sh.customer.name + ' — ใส่ LINE user id ที่กระดานส่งใบราคาก่อน', { needLine: true });
      var o = enqueue(role, cid, kind, text, { label: sh.label });
      if (kind === 'quote') { var c = sendRow(cid); if (c) { if (!c.sentAt) { c.sentAt = stamp(); c.sentBy = role; } c.channel = 'line'; } sh.sent = true; sh.sentAt = sh.sentAt || stamp(); sh.sentChannel = 'line'; rebuildSheet(sh); X.closeNegotiations(cid, role, 'line'); }
      return ok({ ok: true, id: o.id, status: o.status, queued: D.outbox.filter(function (x) { return x.status === 'queued'; }).length });
    }
    function lineSendAll(role, body) {
      var kind = body.kind || 'quote', done = [], skipped = [];
      D.sends.customers.forEach(function (c) {
        var sh = sheetFor(c.id); if (!sh || !c.handedAt) return;
        if (kind === 'quote' && c.sentAt && c.channel === 'line') return skipped.push({ id: c.id, name: c.name, why: 'ส่ง LINE แล้ว' });
        if (!lineIdOf(c.id)) return skipped.push({ id: c.id, name: c.name, why: 'ยังไม่ผูก LINE' });
        var r = lineSend(role, { customer_id: c.id, kind: kind, origin: body.origin }); if (r.status === 200) done.push(c.name); else skipped.push({ id: c.id, name: c.name, why: r.body.error });
      });
      return ok({ ok: true, sent: done.length, done: done, skipped: skipped });
    }
    /* server เรียกเป็นระยะพร้อม transport (async) — ส่งจริงเมื่อมี LINE token · ไม่มี = บันทึกว่าจำลองส่ง เพื่อให้ flow เดินต่อได้ */
    function drainOutbox(transport) {
      var q = D.outbox.filter(function (o) { return o.status === 'queued'; }).slice(-10).reverse(); if (!q.length) return Promise.resolve(0);
      jobStart('line-outbox');
      return q.reduce(function (p, o) { return p.then(function () {
        o.attempts++;
        return Promise.resolve().then(function () { return transport ? transport(o.to, o.text, o) : { simulated: true }; })
          .then(function (r) { o.status = r && r.simulated ? 'simulated' : 'sent'; o.sent_at = stamp(); o.error = null; logEvent({ actor: 'system', action: 'line-send', entity: 'customer', entity_id: o.customer_id, detail: o.kind + ' → ' + o.customer + (o.status === 'simulated' ? ' (จำลอง — ยังไม่ตั้ง LINE token)' : ''), status: 'ok' }); })
          .catch(function (e) { o.error = String(e && e.message || e); if (o.attempts >= 3) { o.status = 'failed'; alert('bad', 'ส่ง LINE ไม่สำเร็จ: ' + o.customer, o.error, 'line-outbox'); } logEvent({ actor: 'system', action: 'line-send', entity: 'customer', entity_id: o.customer_id, detail: o.error, status: 'fail' }); });
      }); }, Promise.resolve()).then(function () { var f = D.outbox.filter(function (o) { return o.status === 'failed'; }).length; jobDone('line-outbox', 'ส่ง ' + q.length + ' ข้อความ' + (f ? ' · ล้มเหลวสะสม ' + f : '')); return q.length; });
    }
    function retryOutbox(role, body) { var n = 0; D.outbox.forEach(function (o) { if (o.status === 'failed' && (!body.id || o.id === Number(body.id))) { if (!o.to) o.to = lineIdOf(o.customer_id); if (o.to) { o.status = 'queued'; o.attempts = 0; o.error = null; n++; } } }); return ok({ ok: true, requeued: n }); }
    /* LINE webhook (ข้อความจากลูกค้า): "ยืนยัน/ตกลง/โอเค" = รับทั้งใบ · "ขอ <สินค้า> <ราคา>" = คำขอต่อรอง · อื่นๆ = บันทึกไว้ให้เซลล์อ่าน */
    function lineWebhook(body) {
      var evs = Array.isArray(body.events) ? body.events : [], handled = [];
      evs.forEach(function (ev) {
        var uid = ev.source && ev.source.userId, text = ev.message && ev.message.text || '';
        var c = S.customers.filter(function (x) { return x.line_user_id && x.line_user_id === uid; })[0];
        if (!c) {
          var mc = text.match(/^ทุน\s+(.+?)\s+(\d+(?:\.\d+)?)\s*$/), ms = text.match(/^ตลาด\s+(\S+)\s+(.+)$/);
          if (mc) { var ic = importCosts('line', { rows: [{ product: mc[1], cost: mc[2] }], commit: true, source: 'LINE ทุน', channel: 'line' }); return handled.push({ uid: uid, result: ic.status === 200 ? 'cost ' + (ic.body.applied || 0) + (ic.body.flagged ? ' flagged ' + ic.body.flagged : '') : ic.body.error }); }
          if (ms) { var st0 = D.pricelist.comps.filter(function (x) { return x.label.toLowerCase() === ms[1].toLowerCase() || x.id === ms[1]; })[0]; if (st0) { var pr0 = parseSurvey(ms[2], st0.id).filter(function (r) { return r.ok; }); var sr0 = surveySubmit('line', { store: st0.id, rows: pr0, mode: 'line' }); return handled.push({ uid: uid, result: sr0.status === 200 ? 'survey ' + pr0.length : sr0.body.error }); } }
          logEvent({ actor: 'customer', kind: 'customer', action: 'line-inbound', detail: 'ไม่รู้จัก LINE ' + uid + ': ' + text.slice(0, 80), status: 'warn' }); return handled.push({ uid: uid, result: 'unknown' }); }
        var sh = sheetFor(c.id), res = 'noted';
        var mk = text.match(/^ตลาด\s+(\S+)\s+(.+)$/); if (mk) { var st = D.pricelist.comps.filter(function (x) { return x.label.toLowerCase() === mk[1].toLowerCase() || x.id === mk[1]; })[0]; if (st) { var pr = parseSurvey(mk[2], st.id).filter(function (r) { return r.ok; }); var sr2 = surveySubmit('line', { store: st.id, rows: pr, mode: 'line' }); res = sr2.status === 200 ? 'survey ' + pr.length : sr2.body.error; } }
        if (/^(ยืนยัน|ตกลง|โอเค|ok|รับ)/i.test(text.trim()) && sh && sh.sent) { var r = X.quoteResponse('customer', { customer_id: c.id, kind: 'accept', all: true }); res = r.status === 200 ? 'accepted ' + r.body.n : r.body.error; }
        else { var m = text.match(/ขอ\s*(.+?)\s*(\d+)\s*(บาท|฿)?/); if (m && sh) { var mp = matchProduct(m[1]); if (mp) { var rr = X.priceRequest('customer', { customer_id: c.id, product_id: mp.p.id, want: Number(m[2]), reason: 'ขอผ่าน LINE: ' + text.slice(0, 60) }); res = rr.status === 200 ? 'request ' + mp.p.name + ' ' + m[2] : rr.body.error; } } }
        var sr = sendRow(c.id); if (sr && !sr.opened) sr.opened = stamp();
        logEvent({ actor: 'customer', kind: 'customer', action: 'line-inbound', entity: 'customer', entity_id: c.id, detail: c.name + ': "' + text.slice(0, 80) + '" → ' + res });
        handled.push({ customer: c.name, result: res });
      });
      return ok({ ok: true, handled: handled });
    }

    /* ── สถานะใบราคาของแต่ละเจ้า (ใช้ทั้งกระดานเซลล์ · dashboard · follow-up) ── */
    var STAGES = [['draft', 'รอ Pricing'], ['ready', 'พร้อมส่ง'], ['sent', 'ส่งแล้ว รอตอบ'], ['waiting', 'ต่อรอง รอ Pricing'], ['partial', 'ตอบบางส่วน'], ['agreed', 'ตอบครบ'], ['won', 'ปิดดีลได้'], ['lost', 'เสียไป'], ['invoiced', 'ออก invoice แล้ว']];
    var STAGE_LABEL = {}; STAGES.forEach(function (s) { STAGE_LABEL[s[0]] = s[1]; });
    function stageOf(cid) {
      var c = sendRow(cid), sh = sheetFor(cid), deal = D.deals.filter(function (d) { return d.customer_id === cid && d.label === D.sends.label; })[0];
      if (!c || !sh) return { stage: 'draft' };
      var st = !c.handedAt ? 'draft' : (sh.invoices || []).length ? 'invoiced' : deal ? deal.outcome : !c.sentAt ? 'ready' : c.waiting ? 'waiting'
        : (c.accepted + c.declined) >= (c.offerLines || 1) && c.accepted ? 'agreed' : (c.accepted + c.declined) > 0 ? 'partial' : 'sent';
      var lastFu = D.followups.filter(function (f) { return f.customer_id === cid; })[0];
      var silentSince = c.sentAt && st === 'sent' ? (lastFu && lastFu.at > c.sentAt ? lastFu.at : c.sentAt) : null;
      var silentDays = silentSince ? Math.floor((Date.now() - Date.parse(silentSince + '+07:00')) / 864e5) : 0;
      var due = st === 'sent' && silentDays >= (lastFu && lastFu.next_in_days || FOLLOW_DAYS);
      var ob = D.outbox.filter(function (o) { return o.customer_id === cid; })[0];
      return { stage: st, label: STAGE_LABEL[st], silentDays: silentDays, followupDue: !!due, lastFollowup: lastFu || null, line: !!lineIdOf(cid), lineStatus: ob ? ob.status : null, channel: c.channel || (c.sentAt ? 'manual' : null), opened: c.opened || null, deal: deal || null };
    }
    function board(role, scope) {
      var rows = D.sends.customers.filter(function (c) { return X.inScope(scope, c.id); }).map(function (c) {
        var s = stageOf(c.id), sh = sheetFor(c.id), ow = X.ownerOf(c.id), owr = X.repOf(ow);
        return { id: c.id, name: c.name, owner: ow, ownerName: owr ? owr.name : '', stage: s.stage, label: s.label, lines: c.lines, offerLines: c.offerLines, handedAt: c.handedAt, sentAt: c.sentAt, sentBy: c.sentBy, channel: s.channel, lineStatus: s.lineStatus, line: s.line, opened: s.opened,
          accepted: c.accepted, declined: c.declined, waiting: c.waiting, revised: c.revised, invoiced: c.invoiced, silentDays: s.silentDays, followupDue: s.followupDue, lastFollowup: s.lastFollowup ? { at: s.lastFollowup.at, channel: s.lastFollowup.channel, note: s.lastFollowup.note } : null,
          outcome: s.deal ? { outcome: s.deal.outcome, at: s.deal.at, reason: s.deal.reason, value: s.deal.value } : null, link: sh && sh.link ? sh.link.url : null };
      });
      var counts = {}; STAGES.forEach(function (s) { counts[s[0]] = 0; }); rows.forEach(function (r) { counts[r.stage]++; });
      return ok({ label: D.sends.label, today: today(), stages: STAGES.map(function (s) { return { key: s[0], label: s[1], n: counts[s[0]] }; }), rows: rows, followupDue: rows.filter(function (r) { return r.followupDue; }).length, lineReady: rows.filter(function (r) { return r.stage === 'ready' && r.line; }).length, lineMissing: rows.filter(function (r) { return r.stage !== 'draft' && !r.line; }).length, followDays: FOLLOW_DAYS });
    }

    /* ════════ 4 · ต่อรองจนจบ: ตามเจ้าที่เงียบ · บันทึกผล ════════ */
    function nudgeText(sh) { return 'สวัสดีครับ ' + sh.customer.name + ' ใบราคา Freshour รอบ ' + sh.label + ' ที่ส่งไป ยังไม่ได้รับคำตอบครับ ' + (sh.link ? 'ยืนยัน/ขอต่อรองได้ที่ ' + sh.link.url : 'ตอบกลับทางไลน์นี้ได้เลยครับ') + ' ขอบคุณครับ'; }
    function followups(role, scope) {
      var b = board(role, scope).body, due = b.rows.filter(function (r) { return r.followupDue; }).sort(function (a, c) { return c.silentDays - a.silentDays; });
      return ok({ today: today(), afterDays: FOLLOW_DAYS, due: due, silent: b.rows.filter(function (r) { return r.stage === 'sent'; }).length, log: D.followups.slice(0, 50) });
    }
    function followup(role, body) {
      var cid = body.customer_id, c = custOf(cid); if (!c) return err(404, 'ไม่พบลูกค้า');
      var f = { id: nextId('fu'), at: stamp(), by: role, customer_id: cid, customer: c.name, channel: body.channel || 'โทร', note: body.note || '', next_in_days: Math.max(1, num(body.next_in_days) || FOLLOW_DAYS), result: body.result || '' };
      D.followups.unshift(f);
      if (f.channel === 'line') { var sh = sheetFor(cid); var r = lineSend(role, { customer_id: cid, kind: 'nudge', text: body.note || nudgeText(sh) }); if (r.status !== 200) return r; }
      X.audit(role, 'followup', c.name + ' · ' + f.channel);
      return ok({ ok: true, id: f.id });
    }
    function followupAuto(role, scope) {
      var due = followups(role, scope).body.due, sent = [], skipped = [];
      due.forEach(function (r) { if (!r.line) return skipped.push(r.name); var x = followup(role, { customer_id: r.id, channel: 'line' }); (x.status === 200 ? sent : skipped).push(r.name); });
      return ok({ ok: true, sent: sent, skipped: skipped });
    }
    /* งานระบบรายวัน: เจ้าที่เงียบเกินกำหนด → มี LINE = ส่งข้อความตามให้เอง · ไม่มี = ขึ้นเป็นงานค้างของเซลล์คนนั้น · ทุกเจ้าลง log */
    function followupTick() {
      jobStart('followup-check');
      try {
        var due = followups('system', null).body.due, sent = [], todo = [];
        due.forEach(function (r) { if (r.line) { var x = followup('system', { customer_id: r.id, channel: 'line' }); (x.status === 200 ? sent : todo).push(r.name); } else todo.push(r.name); });
        if (todo.length) alert('warn', 'ลูกค้าเงียบ ' + todo.length + ' เจ้า ไม่มี LINE ให้ระบบตาม — เซลล์ต้องโทร', todo.slice(0, 6).join(' · '), 'followup-check');
        jobDone('followup-check', 'เงียบเกินกำหนด ' + due.length + ' เจ้า · ส่ง LINE ตามให้ ' + sent.length + ' · รอคนตาม ' + todo.length);
        return { due: due.length, sent: sent, todo: todo };
      } catch (e) { jobFail('followup-check', e); return { error: String(e && e.message || e) }; }
    }
    function dealClose(role, body) {
      var cid = body.customer_id, sh = sheetFor(cid), c = custOf(cid); if (!sh || !c) return err(404, 'ไม่พบลูกค้า');
      var outcome = body.outcome; if (outcome !== 'won' && outcome !== 'lost') return err(400, 'ผลต้องเป็น won หรือ lost');
      if (outcome === 'lost' && !String(body.reason || '').trim()) return err(400, 'เสียลูกค้าต้องบอกเหตุผล — จะได้รู้ว่าเสียเพราะราคาหรือบริการ');
      var inOffer = sh.rows.filter(function (r) { return r.inOffer; }); if (!inOffer.length) return err(400, 'ใบนี้ยังไม่มีราคาที่ส่งลูกค้า');
      var vol = {}; (D.board.lines || []).forEach(function (l) { vol[l.id] = l.vol || 0; });
      var lines = inOffer.map(function (r) { var P = product(r.pid) || {}; var agreed = outcome === 'won' ? (r.accepted != null ? r.accepted : r.offer) : null;
        return { pid: r.pid, name: r.name, offer: r.offer, agreed: agreed, accepted: r.response === 'accept', cost: P.cost || 0, vol: vol[r.pid] || 0, margin: agreed ? mg(agreed, P.cost || 0) : null }; });
      var won = lines.filter(function (l) { return l.agreed; }), value = Math.round(won.reduce(function (a, l) { return a + l.agreed * (l.vol || 1); }, 0)), gp = Math.round(won.reduce(function (a, l) { return a + (l.agreed - l.cost) * (l.vol || 1); }, 0));
      var central = Math.round(lines.reduce(function (a, l) { return a + (l.offer || 0) * (l.vol || 1); }, 0));
      var prev = D.deals.filter(function (d) { return d.customer_id === cid && d.label === sh.label; })[0];
      var deal = { id: prev ? prev.id : nextId('dl'), at: stamp(), by: role, customer_id: cid, customer: c.name, label: sh.label, outcome: outcome, reason: body.reason || '', lost_to: body.lost_to || '', lines: lines, n: lines.length, agreedN: won.length,
        value: value, gp: gp, margin: value ? r1(gp / value * 100) : null, centralValue: central, discount: central && value ? r1((central - value) / central * 100) : null };
      if (prev) D.deals[D.deals.indexOf(prev)] = deal; else D.deals.unshift(deal);
      sh.deal.outcome = outcome; sh.deal.closedAt = deal.at;
      if (outcome === 'lost') { sh.rows.forEach(function (r) { if (r.inOffer && !r.response) r.response = 'decline'; }); }
      rebuildSheet(sh);
      X.audit(role, 'deal-close', c.name + ' → ' + (outcome === 'won' ? 'ได้ ' + value + ' ฿ (margin ' + deal.margin + '%)' : 'เสีย: ' + deal.reason));
      return ok({ ok: true, id: deal.id, outcome: outcome, value: value, margin: deal.margin, agreedN: won.length });
    }
    function dealsView(role, scope) {
      var label = D.sends.label, cur = D.deals.filter(function (d) { return d.label === label && X.inScope(scope, d.customer_id); }), custN = D.sends.customers.filter(function (c) { return X.inScope(scope, c.id); }).length, won = cur.filter(function (d) { return d.outcome === 'won'; }), lost = cur.filter(function (d) { return d.outcome === 'lost'; });
      var value = won.reduce(function (a, d) { return a + d.value; }, 0), gp = won.reduce(function (a, d) { return a + d.gp; }, 0);
      var reasons = {}; lost.forEach(function (d) { var k = d.reason.split(/[·,/]/)[0].trim() || 'ไม่ระบุ'; reasons[k] = (reasons[k] || 0) + 1; });
      var sale = LVL[role] < 2;
      return ok({ label: label, summary: { customers: custN, won: won.length, lost: lost.length, open: custN - cur.length, value: value, gp: sale ? undefined : gp, margin: sale ? undefined : (value ? r1(gp / value * 100) : null), lostValue: lost.reduce(function (a, d) { return a + d.centralValue; }, 0),
        reasons: Object.keys(reasons).map(function (k) { return { reason: k, n: reasons[k] }; }).sort(function (a, b) { return b.n - a.n; }) },
        deals: D.deals.filter(function (d) { return X.inScope(scope, d.customer_id); }).slice(0, 100).map(function (d) { var o = clone(d); if (sale) { delete o.gp; delete o.margin; o.lines.forEach(function (l) { delete l.cost; delete l.margin; }); } return o; }) });
    }

    /* ════════ 6 · DASHBOARD แยกตามคน ════════ */
    function dashboard(role, origin, req, q) {
      q = q || {}; var scope = X.repScope(role, req && req.rep, q), salesView = LVL[role] < 2 || q.view === 'sales';
      var td = today(), b = board(role, salesView ? scope : null).body, dv = dealsView(role, salesView ? scope : null).body, h = health(), stale = {};
      var oldCost = S.products.filter(function (p) { return p.cost > 0 && (!p.cost_src_at || ageDays(p.cost_src_at) > STALE_COST_DAYS); }).length;
      var noCost = D.pricelist.rows.filter(function (r) { return !(r.cost > 0); }).length;
      var mk = D.pricelist.rows.filter(function (r) { return (r.marks || []).some(function (m) { return m.price > 0 && m.state === 'fresh'; }); }).length;
      var mkOld = D.pricelist.rows.filter(function (r) { return (r.marks || []).some(function (m) { return m.price > 0; }) && !(r.marks || []).some(function (m) { return m.price > 0 && m.state === 'fresh'; }); }).length;
      var common = { today: td, round: D.sends.label, stages: b.stages, alerts: h.alerts.slice(0, 5), health: { ok: h.ok, jobs: h.jobs.map(function (j) { return { key: j.key, label: j.label, status: j.status, stale: j.stale, last_run: j.last_run, detail: j.detail }; }), outbox: h.outbox } };
      if (salesView) {
        /* แดชบอร์ดของเซลล์ = งานขาย: ลูกค้าของฉันอยู่ขั้นไหน · วันนี้ค้างอะไร · 7 วันทำอะไรไปแล้ว · ช่องทางถึงลูกค้า — ไม่มีทุน/margin */
        var reqs = D['price-requests'].rows.filter(function (rq) { return !rq.closed && X.inScope(scope, rq.customer_id); });
        var d7 = (function () { var d = new Date(td + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();
        var ev7 = D.events.filter(function (e) { return e.at >= d7 && (!scope || e.rep === scope || (e.kind === 'customer' && X.inScope(scope, e.entity_id))); });
        var cnt = function (re, kind) { return ev7.filter(function (e) { return re.test(e.action) && (!kind || e.kind === kind) && e.status !== 'fail'; }).length; };
        var todo = { send: b.rows.filter(function (r) { return r.stage === 'ready'; }).length, follow: b.rows.filter(function (r) { return r.followupDue; }).length,
          inform: reqs.filter(function (rq) { return rq.status !== 'open' && rq.status !== 'cancelled'; }).length, waitingPricing: reqs.filter(function (rq) { return rq.status === 'open'; }).length,
          close: b.rows.filter(function (r) { return r.stage === 'agreed'; }).length, bindLine: b.rows.filter(function (r) { return !r.line && r.stage !== 'draft'; }).length };
        todo.total = todo.send + todo.follow + todo.inform + todo.close;
        var done7 = { sent: cnt(/^(line\/send|line\/send-all|quote-sent|line-send)$/), follow: cnt(/^followups?$/), closed: cnt(/^deal-close$/), replied: cnt(/quote-response|line-inbound|public-respond|respond/, 'customer') + cnt(/^quote-response$/, 'human'), requests: cnt(/^price-request$/) };
        var repsSum = LVL[role] >= 2 ? (S.sales_reps || []).map(function (r) { var rows = D.sends.customers.filter(function (c) { return X.ownerOf(c.id) === r.id; }); var st = rows.map(function (c) { return stageOf(c.id); });
          return { id: r.id, name: r.name, customers: rows.length, due: st.filter(function (x) { return x.followupDue; }).length, ready: st.filter(function (x) { return x.stage === 'ready'; }).length, won: st.filter(function (x) { return x.stage === 'won' || x.stage === 'invoiced'; }).length, lost: st.filter(function (x) { return x.stage === 'lost'; }).length }; }) : undefined;
        return ok(Object.assign(common, { role: 'sale', viewer: role, rep: X.repOf(scope), scope: scope, reps: repsSum, provisional: S.customers.some(function (c) { return c.owner_src === 'auto'; }),
          customers: b.rows, followupDue: b.rows.filter(function (r) { return r.followupDue; }), lineMissing: b.rows.filter(function (r) { return !r.line; }).length, lineReady: b.rows.filter(function (r) { return r.stage === 'ready' && r.line; }).length, lineOA: h.line, outbox: h.outbox,
          deals: dv.summary, followDays: FOLLOW_DAYS, requests: todo.waitingPricing, revised: b.rows.reduce(function (a, r) { return a + (r.revised || 0); }, 0), todo: todo, done7: done7 }));
      }
      var cc = D.desk.centralCount || {}, flags = D.cost_flags.filter(function (f) { return f.status === 'pending' || f.status === 'hold'; });
      var tr = computeTrend(false);
      var ops = { central: cc, sheetsOpen: D.desk.customers.filter(function (c) { return !c.handed && c.work > 0; }).length, sheetsHanded: D.desk.customers.filter(function (c) { return c.handed; }).length, requestsOpen: D['price-requests'].open, flagsPending: flags.length, flags: flags.slice(0, 8),
        stale: { costOld: oldCost, costOldDays: STALE_COST_DAYS, noCost: noCost, marketFresh: mk, marketOld: mkOld, marketBlind: D.pricelist.rows.length - mk - mkOld, total: D.pricelist.rows.length, lastCost: CFG.cost_updated, lastMarket: (tr.sources.reduce(function (a, s) { return s.lastSeen > a ? s.lastSeen : a; }, '') || null) },
        trendWarnings: tr.warnings.slice(0, 4), trendScore: tr.score, lastImport: D.cost_imports[0] || null, jobs: h.jobs,
        batches: D.cost_batches.slice(0, 5), reviewQueue: (function () { var p = D.cost_flags.filter(function (f) { return f.status === 'pending' || f.status === 'hold'; }), k = {}; p.forEach(function (f) { k[f.kind] = (k[f.kind] || 0) + 1; }); return { total: p.length, byKind: k, kindText: KIND_TEXT, critical: p.filter(function (f) { return f.severity === 'critical'; }).length, hold: p.filter(function (f) { return f.status === 'hold'; }).length }; })(),
        policy: { version: S.policy.version, groups: Object.keys(S.policy.groups).length }, waitingCost: Object.keys(S.cost_master || {}).filter(function (k) { return S.cost_master[k].state === 'waiting'; }).length };
      var CGd = D['category-guard'];
      ops.history = D.history.slice(0, 12).reverse().map(function (h) { return { label: h.label, at: h.dispatched_at, cost_avg: h.cost_avg, margin_avg: h.margin_avg, profit_week: h.profit_week }; });
      ops.categories = CGd.groups.map(function (g) { return { key: g.key, name: g.name, margin: g.margin, target: g.effective, lo: g.lo, hi: g.hi, n: g.n, state: g.state }; });
      ops.groups = D.pricelist.grps.map(function (g) { var rows = D.pricelist.rows.filter(function (r) { return r.grp === g.grp && r.cost > 0; }); var fresh = rows.filter(function (r) { return r.marks.some(function (m) { return m.price > 0 && m.state === 'fresh'; }); }).length; var mgs = rows.map(function (r) { return r.margin; }).filter(function (x) { return x != null; });
        return { grp: g.grp, n: g.n, fresh: fresh, margin: mgs.length ? Math.round(mgs.reduce(function (a, b) { return a + b; }, 0) / mgs.length * 10) / 10 : null, costAvg: rows.length ? Math.round(rows.reduce(function (a, r) { return a + r.cost; }, 0) / rows.length) : null }; });
      ops.priceSheets = { total: D.desk.customers.filter(function (c) { return c.lines > 0; }).length, done: D.desk.customers.filter(function (c) { return c.lines > 0 && c.work === 0; }).length, handed: D.desk.customers.filter(function (c) { return c.handed; }).length };
      if (role === 'ops') return ok(Object.assign(common, { role: 'ops' }, ops, { board: { followupDue: b.followupDue, rows: b.rows } }));
      /* boss: ผลลัพธ์ — ปิดได้กี่เจ้า margin จริงเท่าไหร่ */
      var inv = D.invoices.ytd || {}, G = D.guard;
      var centralMargin = (function () { var rows = D.pricelist.rows.filter(function (r) { return r.cost > 0; }); var vol = {}; (D.board.lines || []).forEach(function (l) { vol[l.id] = l.vol || 0; }); var rev = 0, gp = 0; rows.forEach(function (r) { var v = vol[r.id] || 0; rev += r.w2 * v; gp += (r.w2 - r.cost) * v; }); return rev ? r1(gp / rev * 100) : null; })();
      return ok(Object.assign(common, { role: 'boss', deals: dv.summary, recentDeals: dv.deals.slice(0, 8), realMargin: dv.summary.margin, centralMargin: centralMargin, contractMargin: G.customers.length ? r1(G.customers.reduce(function (a, c) { return a + (c.margin || 0); }, 0) / G.customers.length) : null,
        invoices: { n: inv.invoices || 0, revenue: inv.revenue || 0, gp: inv.gp || 0, margin: inv.margin || 0 }, ar: { outstanding: D.ar.outstanding, overdue: D.ar.overdue }, ops: ops, followupDue: b.followupDue, lineMissing: b.lineMissing }));
    }

    /* ════════ 2b · แหล่งข้อมูล: สถานะ connector · สำรวจหน้าร้านรายสัปดาห์ (พิมพ์/พูด/ถ่ายรูป) ════════ */
    function sourceFail(cid, why) { var ss = D.source_status[cid] = D.source_status[cid] || {}; ss.fails = (ss.fails || 0) + 1; ss.last_error = why; ss.last_try = stamp(); if (ss.fails >= 2) ss.mode = 'survey'; if (ss.fails === 2) alert('warn', 'ดึงราคาออนไลน์ ' + (compOf(cid) || {}).label + ' ไม่ได้ — สลับเป็นโหมดสำรวจหน้าร้าน', why, 'market-sync'); return ss; }
    function sourceStatus() {
      return D.pricelist.comps.map(function (c) { var ss = D.source_status[c.id] || {}, obs = D.market_obs.filter(function (o) { return o.competitor_id === c.id; });
        var lastOnline = obs.filter(function (o) { return o.via !== 'survey'; }).reduce(function (a, o) { return o.observed_at > a ? o.observed_at : a; }, ''), lastSurvey = obs.filter(function (o) { return o.via === 'survey'; }).reduce(function (a, o) { return o.observed_at > a ? o.observed_at : a; }, '');
        var mode = ss.mode || (lastOnline ? 'online' : 'survey');
        return { id: c.id, label: c.label, tier: c.tier, source: c.source || '', mode: mode, fails: ss.fails || 0, last_error: ss.last_error || null, lastOnline: lastOnline || null, lastSurvey: lastSurvey || null, onlineAge: ageDays(lastOnline), surveyAge: ageDays(lastSurvey), skus: Object.keys(obs.reduce(function (m, o) { m[o.product_id] = 1; return m; }, {})).length }; });
    }
    function weekKey(d) { return (function (x) { var dt = new Date(x + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay()); return dt.toISOString().slice(0, 10); })(d || today()); }
    /* แผนสำรวจสัปดาห์นี้: ร้านละไม่เกิน 15 SKU — ไม่เคยรู้ราคา (ขายเยอะก่อน) → ราคาเก่าเกิน 7 วัน → ตัวที่ตลาดขยับแรง */
    function surveyPlan() {
      var wk = weekKey(), vol = {}; (D.board.lines || []).forEach(function (l) { vol[l.id] = l.vol || 0; });
      var subs = D.surveys.filter(function (s) { return s.week === wk; });
      var stores = sourceStatus().map(function (src) {
        var seen = {}; D.market_obs.forEach(function (o) { if (o.competitor_id === src.id) { if (!seen[o.product_id] || seen[o.product_id] < o.observed_at) seen[o.product_id] = o.observed_at; } });
        var cands = D.pricelist.rows.filter(function (r) { return r.cost > 0; }).map(function (r) { var last = seen[r.id] || null, age = ageDays(last);
          var why = !last ? 'ไม่เคยรู้ราคา' : age > 7 ? 'ราคาเก่า ' + age + ' วัน' : null; return { id: r.id, name: r.name, grp: r.grp, vol: vol[r.id] || 0, lastSeen: last, age: age, why: why }; })
          .filter(function (x) { return x.why; }).sort(function (a, b) { return (a.lastSeen ? 1 : 0) - (b.lastSeen ? 1 : 0) || b.vol - a.vol; }).slice(0, 15);
        var done = {}; subs.filter(function (s) { return s.store === src.id; }).forEach(function (s) { s.rows.forEach(function (r) { done[r.product_id] = r.price; }); });
        cands.forEach(function (c) { c.done = done[c.id] || null; });
        var due = new Date(wk + 'T00:00:00Z'); due.setUTCDate(due.getUTCDate() + 6);
        return { competitor_id: src.id, label: src.label, tier: src.tier, mode: src.mode, needed: src.mode !== 'online' || !cands.length ? src.mode !== 'online' : false, assignee: src.tier === 'r' ? 'เซลล์' : 'แอดมิน', due: due.toISOString().slice(0, 10), targets: cands, total: cands.length, done: cands.filter(function (c) { return c.done; }).length, submissions: subs.filter(function (s) { return s.store === src.id; }).length };
      });
      return { week: wk, today: today(), stores: stores, recent: D.surveys.slice(0, 20), rules: { per: 'สัปดาห์ละ 1 ครั้ง', due: 'ภายในวันเสาร์ ก่อนรอบทุนวันอังคาร', modes: ['พิมพ์', 'พูด', 'ถ่ายรูปป้าย'] } };
    }
    /* แปลงข้อความอิสระ (พิมพ์/เสียง/OCR) → รายการ [สินค้า, ราคา] แล้วจับคู่ SKU ให้มากที่สุด */
    function parseSurvey(text, store) {
      var lines = String(text || '').replace(/[,·;|]/g, '\n').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean), out = [];
      lines.forEach(function (ln) {
        var m = ln.match(/^(.*?)[\s:=]*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:บาท|฿|บ\.?|b)?\s*(?:\/|ต่อ)?\s*(?:กก\.?|กิโล|kg|โล)?\s*\.?$/i) || ln.match(/^(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:บาท|฿)?\s+(.+)$/);
        if (!m) return out.push({ raw: ln, ok: false, reason: 'ไม่เจอราคา' });
        var name = (m[2] && /^\d/.test(m[1]) ? m[2] : m[1]).replace(/^(ราคา|ตลาด|makro|betagro|แม็คโคร|เบทาโกร)\s*/i, '').trim(), price = num(String(/^\d/.test(m[1]) ? m[1] : m[2]).replace(',', '.'));
        if (!name || !(price > 0)) return out.push({ raw: ln, ok: false, reason: 'ไม่เจอชื่อสินค้า' });
        var mt = matchProduct(name);
        if (!mt) { var alts = D.pricelist.rows.filter(function (r) { return r.name.indexOf(name.slice(0, 3)) >= 0; }).slice(0, 4).map(function (r) { return { id: r.id, name: r.name }; }); return out.push({ raw: ln, name: name, price: price, ok: false, reason: 'จับคู่ SKU ไม่ได้', alts: alts }); }
        var P = mt.p, sane = P.w2 ? price > P.w2 * 0.4 && price < P.w2 * 2.5 : true;
        out.push({ raw: ln, name: name, price: price, ok: true, product_id: P.id, product: P.name, grp: P.grp, how: mt.how, score: mt.score, our: P.w2, warn: sane ? null : 'ราคาห่างจากของเรา (' + P.w2 + ' ฿) ผิดปกติ — ตรวจหน่วย/ทศนิยม' });
      });
      return out;
    }
    function surveySubmit(role, body) {
      var store = body.store, c = compOf(store); if (!c) return err(400, 'ไม่รู้จักร้าน ' + store);
      var rows = Array.isArray(body.rows) ? body.rows : [], td = String(body.observed_at || today()).slice(0, 10), okRows = [], bad = [];
      rows.forEach(function (r) { var P = r.product_id && product(r.product_id), price = num(r.price); if (!P || !(price > 0)) return bad.push(r.raw || r.name || '?'); okRows.push({ product_id: P.id, name: P.name, price: price, raw: r.raw || '' }); });
      if (!okRows.length) return err(400, 'ไม่มีรายการที่จับคู่ SKU ได้ — แก้ชื่อหรือเลือกสินค้าจากรายการก่อน');
      var total = { added: 0, matched: {}, unmatched: {} };
      ingest(okRows.map(function (r) { return { competitor: store, sku: r.name, price: r.price, observed_at: td, source_url: 'survey:' + (body.branch || c.label), via: 'survey', by: role }; }), td, total);
      var sub = { id: nextId('ob2'), at: stamp(), week: weekKey(td), store: store, label: c.label, branch: body.branch || '', by: role, mode: body.mode || 'type', photos: Number(body.photos) || 0, note: body.note || '', rows: okRows, n: okRows.length, unmatched: bad };
      D.surveys.unshift(sub); if (D.surveys.length > 500) D.surveys.length = 500;
      var ss = D.source_status[store] = D.source_status[store] || {}; ss.last_survey = stamp();
      computeTrend(true);
      X.audit(role, 'survey', c.label + ' · ' + okRows.length + ' รายการ (' + (body.mode || 'พิมพ์') + ')');
      return ok({ ok: true, id: sub.id, added: total.added, n: okRows.length, unmatched: bad });
    }
    /* ════════ mini dashboard: ระบบช่วยรับทุน/อ่านตลาดได้แค่ไหน ════════ */
    function intakePerf() {
      var td = today(), d30 = (function () { var d = new Date(td + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 30); return d.toISOString().slice(0, 10); })(), d7 = (function () { var d = new Date(td + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();
      var ent = (D.cost_entries || []).filter(function (e) { return e.at >= d30; });
      var ch = function (e) { return /ไฟล์|inbox|AL|pdf|excel/i.test(e.src) ? 'file' : /ตรวจแล้ว/.test(e.src) ? 'flag' : /ปรับทุกตัว/.test(e.src) ? 'bulk' : /LINE|ไลน์/i.test(e.src) ? 'line' : 'manual'; };
      var by = { file: 0, manual: 0, bulk: 0, flag: 0, line: 0 }; ent.forEach(function (e) { by[ch(e)]++; });
      var auto = by.file + by.flag + by.line, flags = D.cost_flags, decided = flags.filter(function (f) { return f.status !== 'pending'; });
      var caught = decided.filter(function (f) { return f.status === 'rejected' || f.status === 'corrected' || f.status === 'hold' || (f.status === 'approved' && f.final != null && f.final !== f.cost); }).length;
      var imps = D.cost_imports, exact = imps.reduce(function (a, i) { return a + (i.exact || 0); }, 0), fuzzy = imps.reduce(function (a, i) { return a + (i.fuzzy || 0); }, 0), unm = imps.reduce(function (a, i) { return a + (i.unmatched != null ? i.unmatched : i.problems || 0); }, 0);
      var noCost = D.pricelist.rows.filter(function (r) { return !(r.cost > 0); }).length, oldCost = S.products.filter(function (p) { return p.cost > 0 && (!p.cost_src_at || ageDays(p.cost_src_at) > 7); }).length;
      var op = D['ops-perf'] || {}, stepNow = ((op.summary || {}).steps || []).filter(function (s) { return s.key === 'cost'; })[0] || {};
      var obs30 = D.market_obs.filter(function (o) { return o.observed_at >= d30; }), obs7 = D.market_obs.filter(function (o) { return o.observed_at >= d7; });
      var known = {}, fresh = {}; D.market_obs.forEach(function (o) { known[o.product_id] = 1; if (o.observed_at >= d7) fresh[o.product_id] = 1; });
      var ages = Object.keys(known).map(function (pid) { var l = obsByProduct(pid); return ageDays(l[l.length - 1].observed_at); }).sort(function (a, b) { return a - b; });
      var tr = computeTrend(false), plan = surveyPlan(), wkSubs = D.surveys.filter(function (s) { return s.week === plan.week; });
      var survRows = wkSubs.reduce(function (a, s) { return a + s.n; }, 0), survUnm = wkSubs.reduce(function (a, s) { return a + s.unmatched.length; }, 0);
      var alerts30 = D.events.filter(function (e) { return e.action === 'alert' && e.at >= d30; }).length;
      /* ชุดเทียบ 30 วันก่อนหน้า + อนุกรมสำหรับกราฟเล็กในการ์ด (ระบบช่วยได้แค่ไหน) */
      var dAgo = function (n) { var d = new Date(td + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }, d60 = dAgo(60), d14 = dAgo(14);
      var entPrev = (D.cost_entries || []).filter(function (e) { return e.at >= d60 && e.at < d30; }), byP = { file: 0, manual: 0, bulk: 0, flag: 0, line: 0 }; entPrev.forEach(function (e) { byP[ch(e)]++; });
      var autoPrevPct = entPrev.length ? Math.round((byP.file + byP.flag + byP.line) / entPrev.length * 100) : null;
      var batches = D.cost_batches.slice(0, 8).reverse().map(function (b) { return { id: b.id, at: String(b.at || '').slice(5, 10), auto: b.auto || 0, review: b.review || 0, unchanged: b.unchanged || 0, rows: b.rows || 0, by: b.by, source: b.source }; });
      var mix = { exact: 0, alias: 0, fuzzy: 0, possible: 0, unmatched: 0 };
      D.cost_batches.forEach(function (b) { mix.exact += (b.exact || 0) - (b.alias || 0); mix.alias += b.alias || 0; mix.fuzzy += b.fuzzy || 0; mix.possible += (b.byKind || {}).possible || 0; mix.unmatched += (b.byKind || {}).unmatched || 0; });
      var daily = {}; for (var di = 13; di >= 0; di--) daily[dAgo(di)] = 0; D.market_obs.forEach(function (o) { if (o.observed_at in daily) daily[o.observed_at]++; });
      var obsDaily = Object.keys(daily).map(function (k) { return { d: k.slice(5), n: daily[k] }; });
      var freshPrev = {}; D.market_obs.forEach(function (o) { if (o.observed_at >= d14 && o.observed_at < d7) freshPrev[o.product_id] = 1; });
      var byM = {}; D.predictions.forEach(function (p) { if (!p.resolved || p.hit == null) return; var k = String(p.due_at).slice(0, 7); byM[k] = byM[k] || { n: 0, hit: 0 }; byM[k].n++; if (p.hit) byM[k].hit++; });
      var scoreSeries = Object.keys(byM).sort().slice(-8).map(function (k) { return { m: k.slice(2).replace('-', '/'), n: byM[k].n, pct: Math.round(byM[k].hit / byM[k].n * 100) }; });
      var mkStale = D.pricelist.rows.filter(function (r) { return (r.marks || []).some(function (m) { return m.price > 0; }) && !(r.marks || []).some(function (m) { return m.price > 0 && (m.age == null || m.age <= 30); }); }).length;
      var mkUsable = D.pricelist.rows.filter(function (r) { return (r.marks || []).some(function (m) { return m.price > 0 && m.age != null && m.age >= 7 && m.age <= 30; }) && !(r.marks || []).some(function (m) { return m.price > 0 && m.age != null && m.age < 7; }); }).length;
      return { today: td,
        prev: { autoPct: autoPrevPct, fresh7: Object.keys(freshPrev).length, entries: entPrev.length },
        queueByKind: (function () { var k = {}; D.cost_flags.forEach(function (f) { if (f.status === 'pending' || f.status === 'hold') k[f.kind] = (k[f.kind] || 0) + 1; }); return k; })(), kindText: KIND_TEXT,
        policy: { version: S.policy.version }, policyGroups: S.policy.groups,
        series: { batches: batches, mix: mix, obsDaily: obsDaily, score: scoreSeries, freshness: { fresh: Object.keys(fresh).length, usable: mkUsable, stale: mkStale, blind: D.pricelist.rows.length - Object.keys(known).length } },
        cost: { entries30: ent.length, byChannel: by, autoPct: ent.length ? Math.round(auto / ent.length * 100) : null, imports: imps.length, lastImport: imps[0] || null,
          match: { exact: exact, fuzzy: fuzzy, unmatched: unm, pct: exact + fuzzy + unm ? Math.round((exact + fuzzy) / (exact + fuzzy + unm) * 100) : null },
          flags: { total: flags.length, pending: flags.filter(function (f) { return f.status === 'pending' || f.status === 'hold'; }).length, decided: decided.length, caught: caught, precision: decided.length ? Math.round(caught / decided.length * 100) : null, aliases: Object.keys(D.sku_aliases).length, batches: D.cost_batches.length, autoRows: D.cost_batches.reduce(function (a, b) { return a + (b.auto || 0); }, 0), reviewRows: D.cost_batches.reduce(function (a, b) { return a + (b.review || 0); }, 0) },
          noCost: noCost, oldCost: oldCost, total: D.pricelist.rows.length, minutesNow: stepNow.now == null ? null : stepNow.now, minutesBefore: stepNow.before == null ? null : stepNow.before, inbox: D.inbox.slice(0, 5), job: D.jobs['cost-import'] },
        market: { coverage: tr.coverage, fresh7: Object.keys(fresh).length, medianAge: ages.length ? ages[Math.floor(ages.length / 2)] : null, obs7: obs7.length, obs30: obs30.length, online7: obs7.filter(function (o) { return o.via !== 'survey'; }).length, survey7: obs7.filter(function (o) { return o.via === 'survey'; }).length,
          sources: sourceStatus(), survey: { week: plan.week, stores: plan.stores.map(function (s) { return { label: s.label, mode: s.mode, done: s.done, total: s.total, due: s.due }; }), rows: survRows, unmatched: survUnm, matchPct: survRows + survUnm ? Math.round(survRows / (survRows + survUnm) * 100) : null },
          score: tr.score, warnings: tr.warnings.length, alerts30: alerts30, job: D.jobs['market-sync'] } };
    }
    /* ════════ AI Pricing Performance — ตัวเลขบนสุดของหน้าตั้งราคา: ระบบทำแทนคนไปเท่าไร · คนต้องตัดสินเองกี่รายการ · เวลาที่ประหยัด
       ทุกค่านับจากข้อมูลจริงในระบบ (cost_batches · cost_master · central_prices · market_obs · ops-perf) · "เวลาที่ประหยัด" มี 2 แบบ:
       measured = นาทีที่จับได้จริง (ops-perf ก่อน/หลังมีระบบ) · estimate = ประมาณจากจำนวนงานที่ระบบทำแทน × นาทีต่อชิ้น (สมมติฐานประกาศไว้ แก้ได้ที่ EST_MIN) ════════ */
    var EST_MIN = { costRow: 0.5, priceSku: 1.5, marketSku: 2 };
    function aiPerf() {
      var ip = intakePerf(), td = ip.today, rows = D.desk.rows, CM = S.cost_master || {}, CP = S.central_prices || {};
      /* ── ราคา: AI เตรียมให้กี่ SKU · คนยืนยันตามที่เสนอ/แก้เอง · ต้องตัดสินเอง (ต่ำกว่า Floor · ทุนกระโดด >15% · นโยบายเปลี่ยน) · ไม่มีตลาด = หมายเหตุ · รอทุน ── */
      var ready = 0, waiting = 0, approved = 0, accepted = 0, edited = 0, decide = 0, belowFloor = 0, noMarket = 0, costJump = 0, policyChanged = 0;
      rows.forEach(function (r) {
        var v = r.v21 || {};
        if (v.ready !== 'ok' || !v.rec) { waiting++; return; }
        ready++;
        var c = v.central || {};
        if (c.state === 'approved') { approved++; if (c.recommended != null && Math.round(c.price) === Math.round(c.recommended)) accepted++; else edited++; }
        if (c.state === 'policy_changed') policyChanged++;
        var bf = v.rec.state === 'below_min', nm = !!(v.goals && v.goals.competitive && v.goals.competitive.disabled), cj = r.costPrev > 0 && Math.abs(r.costJump || 0) / r.costPrev > 0.15;
        if (bf) belowFloor++; if (nm) noMarket++; if (cj) costJump++;
        if (bf || cj || c.state === 'policy_changed') decide++;   /* ไม่มีตลาด = หมายเหตุ ไม่ใช่งานที่คนต้องตัดสิน (ระบบยังแนะนำจากทุน+นโยบายได้) */
      });
      /* ── ทุน: มาจากไฟล์/ระบบ กี่ SKU · batch จริงที่ผ่านเอง vs ส่งคนตรวจ ── */
      var fromFile = 0, manual = 0; Object.keys(CM).forEach(function (k) { var src = String(CM[k].source || ''); if (/พิมพ์|มือ|manual/i.test(src)) manual++; else fromFile++; });
      var B = D.cost_batches || [], bRows = 0, bAuto = 0, bReview = 0, bUnch = 0; B.forEach(function (b) { bRows += b.rows || 0; bAuto += b.auto || 0; bReview += b.review || 0; bUnch += b.unchanged || 0; });
      var fl = ip.cost.flags || {}, last = B[0] || null;
      /* ── ตลาด: ดึงเอง vs คนสำรวจ · SKU ที่ยังต้องไปดูเอง ── */
      var m = ip.market, fr = (ip.series || {}).freshness || {}, total = rows.length;
      var onlineSku = {}, surveySku = {}; (D.market_obs || []).forEach(function (o) { if (ageDays(o.observed_at) <= 30) (o.via === 'survey' ? surveySku : onlineSku)[o.product_id] = 1; });
      /* ── เวลา: วัดจริง (ops-perf) + ประมาณการจากงานที่ระบบทำแทน ── */
      var op = D['ops-perf'] || {}, sm = op.summary || {}, steps = (sm.steps || []).map(function (s) { return { key: s.key, label: s.label, now: s.now, before: s.before }; });
      var units = { cost: bAuto + bUnch, price: ready, market: Object.keys(onlineSku).length };
      var est = { cost: Math.round(units.cost * EST_MIN.costRow), price: Math.round(units.price * EST_MIN.priceSku), market: Math.round(units.market * EST_MIN.marketSku) };
      est.total = est.cost + est.price + est.market;
      var humanRows = bReview + decide + edited, machineRows = bAuto + bUnch + (ready - decide) + Object.keys(onlineSku).length;
      return { today: td, round: D.sends.label || null,
        pricing: { total: total, ready: ready, waiting: waiting, approved: approved, accepted: accepted, edited: edited, decide: decide, belowFloor: belowFloor, noMarket: noMarket, costJump: costJump, policyChanged: policyChanged, pct: total ? Math.round(ready / total * 100) : null },
        cost: { total: Object.keys(CM).length, fromFile: fromFile, manual: manual, batches: B.length, rows: bRows, auto: bAuto, review: bReview, unchanged: bUnch, autoPct: bRows ? Math.round((bAuto + bUnch) / bRows * 100) : null, pending: fl.pending || 0, decided: fl.decided || 0, aliases: fl.aliases || 0, entries30: ip.cost.entries30, manual30: (ip.cost.byChannel || {}).manual || 0, oldCost: ip.cost.oldCost, noCost: ip.cost.noCost,
          last: last ? { id: last.id, at: String(last.at || '').slice(0, 10), rows: last.rows || 0, auto: last.auto || 0, review: last.review || 0, unchanged: last.unchanged || 0, source: last.source || '' } : null,
          series: (ip.series || {}).batches || [] },
        market: { total: total, known: (m.coverage || {}).known || 0, fresh: fr.fresh || 0, usable: fr.usable || 0, stale: fr.stale || 0, blind: fr.blind != null ? fr.blind : total, online7: m.online7, survey7: m.survey7, obs30: m.obs30, onlineSku: Object.keys(onlineSku).length, surveySku: Object.keys(surveySku).length, sources: (m.sources || []).length, job: m.job || null },
        time: { week: sm.week || null, steps: steps, now: sm.totalNow == null ? null : sm.totalNow, before: sm.totalBefore == null ? null : sm.totalBefore, savedMin: sm.totalBefore != null && sm.totalNow != null ? Math.round(sm.totalBefore - sm.totalNow) : null, units: units, est: est, assumptions: EST_MIN },
        load: { human: humanRows, machine: machineRows, humanPct: humanRows + machineRows ? Math.round(humanRows / (humanRows + machineRows) * 100) : null } };
    }
    /* ── เส้นทางของส่วนขยาย — คืน undefined ถ้าไม่ใช่ของตัวเอง ── */
    function route(method, path, q, body, role, need, req) {
      var cm = path.match(/^\/api\/customers\/([^/]+)$/);
      if (cm && method === 'POST') { need(1); if (LVL[role] < 2) body = { line_user_id: body.line_user_id, contact: body.contact }; return updateCustomer(role, cm[1], body); }   /* เซลล์ผูก LINE/ผู้ติดต่อได้ · ชื่อ/เจ้าของ ต้อง ops ขึ้นไป */
      if (path === '/api/line/webhook' && method === 'POST') return lineWebhook(body);   /* ของจริงตรวจลายเซ็นที่ server */
      if (method === 'GET') switch (path) {
        case '/api/health': return ok(health());
        case '/api/events': need(1); var evScope = X.repScope(role, req.rep, q); var list = D.events.filter(function (e) { return (!evScope || e.rep === evScope || (e.entity === 'customer' && X.inScope(evScope, e.entity_id))) && (!q.actor || e.actor === q.actor) && (!q.kind || e.kind === q.kind) && (!q.step || e.step === q.step) && (!q.status || e.status === q.status) && (!q.q || (e.detail + ' ' + e.action + ' ' + e.entity_id).indexOf(q.q) >= 0); });
          if (LVL[role] < 2) list = list.filter(function (e) { return !/cost|import|central|config|category/.test(e.action); });
          return ok({ total: list.length, rows: list.slice(0, Number(q.limit) || 200), steps: ['ทุนเข้า', 'เทียบตลาด', 'ตั้งราคา', 'ส่งราคา', 'ต่อรอง', 'ปิดรอบ', 'บริการ', 'ระบบ'] });
        case '/api/alerts': need(1); return ok({ rows: D.alerts.slice(0, 100) });
        case '/api/dashboard': need(1); return dashboard(role, req.origin, req, q);
        case '/api/board': if (q.view === 'sales') { need(1); return board(role, X.repScope(role, req.rep, q)); } return undefined;
        case '/api/sales-board': need(1); return board(role);
        case '/api/followups': need(1); return followups(role, X.repScope(role, req.rep, q));
        case '/api/deals': need(1); return dealsView(role, X.repScope(role, req.rep, q));
        case '/api/outbox': need(1); return ok({ rows: D.outbox.slice(0, 100).map(function (o) { var x = clone(o); if (LVL[role] < 2) x.text = x.text.slice(0, 80); return x; }), queued: D.outbox.filter(function (o) { return o.status === 'queued'; }).length });
        case '/api/cost-flags': need(2); return ok(reviewQueue(q));
        case '/api/cost-batches': need(2); return ok({ rows: D.cost_batches.slice(0, Number(q.limit) || 50), aliases: D.sku_alias_log || [] });
        case '/api/market-trend': need(2); return marketTrend(q);
        case '/api/market-estimates': need(2); return marketEstimates();
        case '/api/market-observations': need(2); return marketObservations(q);
        case '/api/market-sync/status': need(2); return ok(D.jobs['market-sync']);
        case '/api/intake-perf': need(2); return ok(intakePerf());
        case '/api/ai-perf': need(2); return ok(aiPerf());
        case '/api/sources': need(1); return ok({ sources: sourceStatus(), inbox: D.inbox.slice(0, 30), imports: D.cost_imports.slice(0, 10) });
        case '/api/survey': need(1); return ok(surveyPlan());
      }
      else switch (path) {
        case '/api/import/costs': need(2); return importCosts(role, body);
        case '/api/survey/parse': need(1); return ok({ rows: parseSurvey(body.text, body.store) });
        case '/api/survey/submit': need(1); return surveySubmit(role, body);
        case '/api/sources/fail': need(2); return ok(sourceFail(body.competitor_id, body.why || 'ดึงไม่ได้'));
        case '/api/inbox/note': need(2); D.inbox.unshift({ at: stamp(), file: body.file, status: body.status || 'ok', detail: body.detail || '' }); if (D.inbox.length > 200) D.inbox.length = 200; return ok();
        case '/api/cost-flags/decide': need(2); return decideFlag(role, body);
        case '/api/market-sync/run': need(2); return marketSync(role, body);
        case '/api/line/send': need(1); body.origin = req.origin; return lineSend(role, body);
        case '/api/line/send-all': need(1); body.origin = req.origin; return lineSendAll(role, body);
        case '/api/line/retry': need(2); return retryOutbox(role, body);
        case '/api/followups': need(1); return followup(role, body);
        case '/api/followups/auto': need(1); return followupAuto(role, X.repScope(role, req.rep));
        case '/api/followups/tick': need(4); return ok(followupTick());
        case '/api/deal-close': need(1); return dealClose(role, body);
        case '/api/alerts/ack': need(1); var a = D.alerts.filter(function (x) { return x.id === Number(body.id); })[0]; if (!a) return err(404, 'ไม่พบ'); a.acked = true; a.acked_by = role; a.acked_at = stamp(); return ok();
        case '/api/log': need(1); return ok(logEvent({ actor: role, kind: 'human', action: body.action || 'note', entity: body.entity, entity_id: body.entity_id, detail: body.detail, status: body.status }));
      }
      return undefined;
    }
    return { route: route, logEvent: logEvent, alert: alert, health: health, drainOutbox: drainOutbox, followupTick: followupTick, marketSync: marketSync, computeTrend: computeTrend, stageOf: stageOf, board: board, matchProduct: matchProduct, costChecks: costChecks, importCosts: importCosts, decideFlag: decideFlag, normUnit: normUnit, STAGES: STAGES, parseSurvey: parseSurvey, sourceFail: sourceFail, intakePerf: intakePerf };
  };
});
