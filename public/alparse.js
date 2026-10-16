/* ══ ALParse — อ่านใบราคาขาย+ทุน หมูอนามัย (AL) จากข้อความ PDF ที่มีตำแหน่ง x/y (pdf.js หรือ pdfplumber)
   ใช้ได้ทั้งในเบราว์เซอร์ (window.ALParse) และ Node (module.exports) — เทสต์ด้วยไฟล์จริง
   หลัก: จัดบรรทัดตาม y (≤3.2pt) → หาหัวตาราง (รายการสินค้า + วันที่ทุน) เพื่อตั้งแถบ x ของแต่ละคอลัมน์ → แถวสินค้า = เริ่มด้วยเลขลำดับที่ x<32
   คอลัมน์: ลำดับ · ชื่อ · สเปค · ปริมาณ · หน่วย · ทุนรอบก่อน · ทุนรอบนี้ · +/- · ปลีก · ส่ง 2kg · 5kg · 10kg · ส่วน "แช่แข็ง" ท้ายใบ ลำดับ 1-3 → 901-903 */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ALParse = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  var HEAD = ['ลำดับ', 'สินค้า', 'สเปค', 'ปริมาณ', 'หน่วย', 'ทุนรอบก่อน', 'ทุน', '+/-', 'ปลีก', 'ส่ง 2kg', '5kg', '10kg'];
  var DEFAULT = { name: 32, spec: 168, qty: 305, unit: 322, cost_old: 343, cost_new: 376, diff: 416, retail: 446, w2: 480, s5: 508, s10: 536 };
  var COLS = ['name', 'spec', 'qty', 'unit', 'cost_old', 'cost_new', 'diff', 'retail', 'w2', 's5', 's10'];
  function thaiDate(txt) { var m = String(txt || '').match(/(\d{1,2})(?:-\d{1,2})?\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; var y = Number(m[3]); if (y < 100) y += 2500; if (y > 2400) y -= 543; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  function tidy(t) { return t.replace(/\s+/g, ' ').replace(/\s+([.,%)])/g, '$1').replace(/\(\s+/g, '(').trim(); }
  /* pages = [{items:[{x,y,w,s}]}] · y = แกนตั้งของ pdf.js (จากล่างขึ้นบน) — pdfplumber ให้แปลง top → height−top ก่อน */
  function parse(pages) {
    var rows = [], bands = null, section = 0, effective = null, seenMain = false, period = null;
    pages.forEach(function (pg) {
      var items = (pg.items || []).filter(function (it) { return String(it.s || '').trim(); }).map(function (it) { return { x: +it.x, y: +it.y, w: +it.w || 0, s: String(it.s) }; }).sort(function (a, b) { return b.y - a.y || a.x - b.x; });
      var lines = []; items.forEach(function (it) { var L = lines[lines.length - 1]; if (L && Math.abs(L.y - it.y) < 3.2) L.items.push(it); else lines.push({ y: it.y, items: [it] }); });
      lines.forEach(function (L) {
        var its = L.items.sort(function (a, b) { return a.x - b.x; }), text = its.map(function (t) { return t.s; }).join(' ');
        if (!effective) { var em = text.match(/ราคามีผล[^\d]*(\d{1,2}-\d{1,2}\/\d{1,2}\/\d{2,4})/); if (em) { effective = thaiDate(em[1]); period = em[1]; } }
        var hdr = {}; its.forEach(function (t) { var st = t.s.replace(/\s/g, '');
          if (/รายการ/.test(st)) hdr.name = t.x; else if (/^สเปค/.test(st)) hdr.spec = t.x; else if (/ปริมาณ/.test(st)) hdr.qty = t.x; else if (/^หน่วย/.test(st)) hdr.unit = t.x;
          else if (/^\d{1,2}-\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(st)) { if (hdr.cost_old == null) hdr.cost_old = t.x; else hdr.cost_new = t.x; }
          else if (/Column|^\+\/-|ส่วนต่าง/.test(st)) hdr.diff = t.x; else if (/ปลีก/.test(st)) hdr.retail = t.x; else if (/^2kg/i.test(st)) hdr.w2 = t.x; else if (/^5kg/i.test(st)) hdr.s5 = t.x; else if (/^10kg/i.test(st)) hdr.s10 = t.x; });
        if (hdr.name != null && (hdr.cost_new != null || hdr.cost_old != null)) {
          var B = Object.assign({}, bands || DEFAULT); B.name = 32;
          if (hdr.spec != null) B.spec = hdr.spec - 50; if (hdr.qty != null) B.qty = hdr.qty - 8; if (hdr.unit != null) B.unit = hdr.unit - 6;
          if (hdr.cost_old != null) B.cost_old = hdr.cost_old - 4; if (hdr.cost_new != null) B.cost_new = hdr.cost_new - 4; if (hdr.diff != null) B.diff = hdr.diff - 12; if (hdr.retail != null) B.retail = hdr.retail - 8;
          if (hdr.cost_new == null && hdr.cost_old != null) { B.cost_new = B.cost_old; B.cost_old = -1; }
          if (hdr.qty == null && hdr.unit == null && hdr.spec != null) { B.qty = -1; B.unit = hdr.spec + 60; }   /* ตารางแช่แข็ง: สเปค · การบรรจุ · ทุน */
          bands = B; if (/แช่แข็ง|แช่แขง็/.test(text) && seenMain) section = 900; return;
        }
        if (bands && hdr.w2 != null) { bands.w2 = hdr.w2 - 6; if (hdr.s5 != null) bands.s5 = hdr.s5 - 6; if (hdr.s10 != null) bands.s10 = hdr.s10 - 6; return; }
        var first = its[0]; if (!first || first.x > 32 || !/^\d{1,3}$/.test(first.s.trim())) return;
        var Bd = bands || DEFAULT, idx = Number(first.s) + section, cells = {}; COLS.forEach(function (k) { cells[k] = []; });
        var order = COLS.filter(function (k) { return Bd[k] != null && Bd[k] >= 0; }).sort(function (a, b) { return Bd[a] - Bd[b]; });
        its.slice(1).forEach(function (t) { var k = null; order.forEach(function (c) { if (t.x >= Bd[c] - 0.5) k = c; }); if (k) cells[k].push(t.s); });
        var j = function (k) { return tidy(cells[k].join(' ')); }, num = function (k) { var v = j(k).replace(/[,฿\s]/g, ''); return v !== '' && isFinite(Number(v)) ? v : ''; };
        var name = tidy(j('name').replace(/กก\.?\s*ละ/g, '').replace(/\*\*\s*NEW\s*\*\*/gi, ''));
        if (!name) return;
        if (section === 0) seenMain = true;
        rows.push([idx, name, j('spec'), j('qty'), j('unit'), num('cost_old'), num('cost_new'), num('diff'), num('retail'), num('w2'), num('s5'), num('s10')]);
      });
    });
    if (!rows.length) return null;
    var out = [HEAD].concat(rows); out.meta = { layout: 'AL', rows: rows.length, effective_date: effective, period: period }; return out;
  }
  return { parse: parse, HEAD: HEAD, thaiDate: thaiDate };
});
