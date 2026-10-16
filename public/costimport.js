/* ══════════════════════════════════════════════════════════════════
   นำเข้าไฟล์ทุน AL (หน้า ทุน/ตลาด) — คอมเมนต์ผู้ใช้: "ไฟล์ทุน AL จากพี่หมิงยังต้องมีคนพิมพ์ทุนเข้าระบบเอง
   ที่ขาดคือตัวอ่านไฟล์อัตโนมัติ และตัวเช็กตัวเลขแปลก เช่น ทุน 3 บาท"
   เลือกไฟล์ (CSV/Excel) → เดาคอลัมน์ชื่อ/ทุน → ระบบจับคู่ SKU + ตรวจตัวเลข (ยังไม่เขียน) → ดูรายงาน → บันทึก
   ตัวที่ติดด่าน (ทุน ≤10 · กระโดด ≥30% · สูงกว่าราคาขาย · ต่ำกว่าครึ่งของหมวด) จะไม่ถูกใช้ จนกว่าพี่จุ๋มกดยืนยันทีละตัว
   ══════════════════════════════════════════════════════════════════ */
window.CostImport = (function () {
  var esc = PX.esc, TBL = null, REP = null, GMAP = { unit: -1, retail: -1 };
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, i, c; text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) { c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c; }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function loadScript(urls) { return new Promise(function (ok, no) { var i = 0; (function next() { if (i >= urls.length) return no(new Error('โหลดไม่ได้')); var sc = document.createElement('script'); sc.src = urls[i++]; sc.onload = function () { ok(sc.src); }; sc.onerror = next; document.head.appendChild(sc); })(); }); }
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return loadScript(['/vendor/xlsx.full.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js']).then(function () { return window.XLSX; }, function () { throw new Error('โหลดตัวอ่าน Excel ไม่ได้ — บันทึกไฟล์เป็น CSV แล้วลองใหม่'); });
  }
  /* PDF ใบราคาขาย+ทุน (AL): อ่านข้อความทุกหน้าพร้อมตำแหน่ง x/y → จัดบรรทัดตาม y → แบ่งคอลัมน์ตามตำแหน่งหัวตาราง
     (ลำดับ · รายการสินค้า · สเปค · ปริมาณ · หน่วย · ทุนรอบก่อน · ทุนรอบนี้ · +/- · ปลีก · ส่ง 2kg · 5kg · 10kg)
     ถ้าไม่เจอหัวตาราง ใช้ตำแหน่งมาตรฐานของใบ AL · ส่วน "แช่แข็ง" ด้านท้าย ลำดับ 1-3 → 901-903 · บรรทัดที่ไม่มีลำดับ = ไม่ใช่สินค้า */
  function loadPDF() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return loadScript(['/vendor/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js']).then(function (src) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = src.indexOf('/vendor/') >= 0 ? '/vendor/pdf.worker.min.js' : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; return window.pdfjsLib; }, function () { throw new Error('โหลดตัวอ่าน PDF ไม่ได้ — ใช้ Excel/CSV แทน'); });
  }
  function pdfRows(pdf) {
    var pages = []; for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }));
    return Promise.all(pages).then(function (tcs) {
      var out = window.ALParse.parse(tcs.map(function (tc) { return { items: tc.items.map(function (it) { return { x: it.transform[4], y: it.transform[5], w: it.width || 0, s: it.str }; }) }; }));
      if (!out || out.length < 2) throw new Error('ไม่เจอแถวสินค้า (ลำดับ · ชื่อ · ทุน) ใน PDF — ถ้าเป็น PDF สแกน ให้ถ่ายรูป/พิมพ์แทน');
      return out;
    });
  }
  function readTable(file) {
    if (/\.pdf$/i.test(file.name)) return loadPDF().then(function (L) { return file.arrayBuffer().then(function (b) { return L.getDocument({ data: b }).promise; }).then(pdfRows); });
    if (/\.(xlsx|xls)$/i.test(file.name)) return loadXLSX().then(function (X) { return file.arrayBuffer().then(function (b) { var wb = X.read(b, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]]; return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }); }); });
    return file.text().then(parseCSV);
  }
  /* เดาคอลัมน์: ลำดับ / ชื่อสินค้า / ทุนรอบนี้ (คอลัมน์วันที่ขวาสุด หรือหัวที่มีคำว่า ทุน) / หน่วย / ปลีก · ใช้ได้ทั้ง PDF ที่แยกคอลัมน์แล้ว · Excel ใบ AL · CSV ทั่วไป */
  function guess(tbl) {
    var head = tbl[0].map(function (h) { return String(h).replace(/\s+/g, ' ').trim().toLowerCase(); }), body = tbl.slice(1, 40), n = tbl[0].length, map = { idx: -1, name: -1, cost: -1, unit: -1, retail: -1 };
    head.forEach(function (h, i) { if (map.idx < 0 && /ลำดับ|^ลา\s*ดับ|^no\.?$|^#$/.test(h)) map.idx = i; if (map.name < 0 && /รายการ|สินค้า|ชื่อ|product|item|sku/.test(h)) map.name = i; if (map.unit < 0 && /หน่วย|unit/.test(h)) map.unit = i; if (map.retail < 0 && /ปลีก|retail/.test(h)) map.retail = i; });
    var dates = []; head.forEach(function (h, i) { if (/\d{1,2}-\d{1,2}\/\d{1,2}\/\d{2,4}/.test(h) || /^ทุน$|ทุนรอบนี้|ทุนใหม่|cost/.test(h)) dates.push(i); });
    if (dates.length) map.cost = dates[dates.length - 1];
    if (map.cost < 0) head.forEach(function (h, i) { if (map.cost < 0 && /ทุน|ราคา|price|บาท/.test(h)) map.cost = i; });
    if (map.name < 0) { var best = -1, bs = 0; for (var i = 0; i < n; i++) { var sc = body.filter(function (r) { return /[ก-๙]/.test(String(r[i] || '')); }).length; if (sc > bs) { bs = sc; best = i; } } map.name = best; }
    if (map.cost < 0) { for (var jx = 0; jx < n; jx++) { if (jx === map.name || jx === map.idx) continue; var num = body.filter(function (r) { return r[jx] !== '' && isFinite(Number(String(r[jx]).replace(/,/g, ''))); }).length; if (num > body.length * 0.6) { map.cost = jx; break; } } }
    if (map.idx < 0) { var c0 = body.filter(function (r) { return /^\d{1,3}$/.test(String(r[0] || '').trim()); }).length; if (c0 > body.length * 0.7 && map.name !== 0 && map.cost !== 0) map.idx = 0; }
    map.hasHeader = tbl.meta ? true : (map.name >= 0 && !/[0-9]/.test(String(tbl[0][map.cost] || '')) && !/[ก-๙]{3,}/.test(String(tbl[0][map.cost] || '')) ? true : !isFinite(Number(String(tbl[0][map.cost] || '').replace(/,/g, ''))));
    return map;
  }
  function rowsFrom(map, hasHeader) {
    return (hasHeader ? TBL.slice(1) : TBL).map(function (r) { var o = { product: String(r[map.name] || '').trim(), cost: String(r[map.cost] || '').trim() };
      if (map.idx >= 0) { var ix = String(r[map.idx] || '').trim(); o.idx = /^\d{1,3}$/.test(ix) ? Number(ix) : null; }
      if (map.unit >= 0) o.unit = String(r[map.unit] || '').trim(); if (map.retail >= 0) o.retail = String(r[map.retail] || '').trim(); return o; })
      .filter(function (r) { return r.product && /[ก-๙A-Za-z]/.test(r.product) && (map.idx < 0 || r.idx != null); });
  }
  function open() {
    TBL = null; REP = null;
    var m = PX.modal({ title: 'นำเข้าไฟล์ทุน AL', sub: 'ไฟล์จากโรงงานที่พี่หมิงส่งมา (PDF / Excel / CSV) · ระบบจับคู่ชื่อกับสินค้าในระบบเอง และกันตัวเลขแปลกไว้ให้ตรวจก่อนใช้',
      html: '<label class="fld"><span>ไฟล์</span><input type="file" id="ciFile" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf"></label><div id="ciMap"></div><div id="ciRep"></div>' +
        '<p class="hint">ไม่มีไฟล์? <a href="#" class="lnk2" id="ciSample">ดาวน์โหลดแม่แบบ CSV</a> · หรือใช้ "วางทุนจาก Excel" สำหรับคัดลอก-วาง</p>',
      okText: 'ตรวจไฟล์', note: 'ตรวจก่อน ยังไม่เขียนอะไรจนกว่าจะกด "บันทึก"',
      onOk: function (v, close) {
        if (!TBL) { PX.toast('เลือกไฟล์ก่อน', 'bad'); return false; }
        var map = { name: +m.el.querySelector('[data-ci="name"]').value, cost: +m.el.querySelector('[data-ci="cost"]').value, idx: m.el.querySelector('[data-ci="idx"]') ? +m.el.querySelector('[data-ci="idx"]').value : -1, unit: GMAP.unit, retail: GMAP.retail }, hh = m.el.querySelector('#ciHead').checked;
        if (!(map.name >= 0) || !(map.cost >= 0) || map.name === map.cost) { PX.toast('เลือกคอลัมน์ชื่อสินค้าและทุนให้ต่างกัน', 'bad'); return false; }
        var rows = rowsFrom(map, hh), okBtn = m.el.querySelector('.mdl-o'), rep = m.el.querySelector('#ciRep'), src = (m.el.querySelector('#ciSrc') || {}).value || 'ไฟล์ทุน AL';
        var commit = REP && okBtn.dataset.mode === 'commit';
        okBtn.disabled = true; okBtn.textContent = commit ? 'กำลังบันทึก…' : 'กำลังตรวจ…';
        PX.post('/api/import/costs', { rows: rows, commit: commit, source: src, effective_date: (m.el.querySelector('#ciEff') || {}).value || undefined, channel: /\.pdf$/i.test((m.el.querySelector('#ciFile').files[0] || {}).name || '') ? 'pdf' : 'upload', file: (m.el.querySelector('#ciFile').files[0] || {}).name || '' }).then(function (r) {
          okBtn.disabled = false; REP = r;
          if (commit) { close(); PX.toast('Batch ' + esc(r.batch_id || '') + ' · Auto Pass <b>' + r.applied + '</b> รายการ' + (r.flagged ? ' · Review Queue <b>' + r.flagged + '</b>' : '') + (r.problemCount ? ' · จับคู่ไม่ได้ ' + r.problemCount : '')); if (typeof reload === 'function') reload(); if (window.CostImport.onDone) window.CostImport.onDone(); return; }
          rep.innerHTML = report(r);
          var can = r.changed > 0 || r.flagged > 0;
          okBtn.textContent = can ? 'รับทุน Auto Pass ' + r.changed + ' รายการ' + (r.flagged ? ' · ส่ง Review ' + r.flagged : '') : 'ไม่มีอะไรเปลี่ยน'; okBtn.dataset.mode = can ? 'commit' : ''; okBtn.disabled = !can;
        }).catch(function (e) { okBtn.disabled = false; okBtn.textContent = 'ตรวจไฟล์'; PX.toast('ไม่สำเร็จ — ' + esc(e.message), 'bad'); });
        return false;
      } });
    m.el.querySelector('#ciSample').onclick = function (e) { e.preventDefault(); PX.csv('ทุน-AL-แม่แบบ.csv', [['สินค้า', 'ทุน (บาท/กก.)'], ['มันแข็งหมู', '65'], ['หมูบด มัน 20%', '101']]); };
    m.el.querySelector('#ciFile').onchange = function () {
      var f = this.files[0]; if (!f) return;
      readTable(f).then(function (t) {
        if (!t.length) throw new Error('ไฟล์ว่าง');
        TBL = t; var g = guess(t); GMAP = g; var n = t[0].length, opt = function (sel, none) { var o = none ? '<option value="-1"' + (sel < 0 ? ' selected' : '') + '>— ไม่มี —</option>' : ''; for (var i = 0; i < n; i++) o += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>คอลัมน์ ' + (i + 1) + ': ' + esc(String(t[0][i] || '').slice(0, 24)) + '</option>'; return o; };
        var eff = (t.meta && t.meta.effective_date) || (function () { var mm = f.name.match(/(\d{1,2})-\d{1,2}\.(\d{1,2})\.(\d{2,4})/); if (!mm) return ''; var y = Number(mm[3]); if (y < 100) y += 2500; if (y > 2400) y -= 543; return y + '-' + ('0' + mm[2]).slice(-2) + '-' + ('0' + mm[1]).slice(-2); })();
        m.el.querySelector('#ciMap').innerHTML = (t.meta && t.meta.layout === 'AL' ? '<div class="pre" style="background:var(--green-l);border-color:var(--green-b,#BBF7D0);margin:0 0 8px">อ่านเป็นใบราคาขาย+ทุน AL ได้ <b>' + t.meta.rows + '</b> รายการ (ลำดับ · ชื่อ · สเปค · หน่วย · ทุนรอบก่อน/รอบนี้ · ปลีก · ส่ง 2/5/10kg)' + (eff ? ' · ราคามีผล <b>' + esc(eff) + '</b>' : '') + ' — จับคู่ SKU ด้วยเลขลำดับ + ชื่อ</div>' : '') +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><label class="fld"><span>ลำดับ (ถ้ามี)</span><select data-ci="idx" style="font-family:var(--ff);padding:8px;border:1px solid var(--line);border-radius:10px">' + opt(g.idx, true) + '</select></label><label class="fld"><span>ชื่อสินค้า</span><select data-ci="name" style="font-family:var(--ff);padding:8px;border:1px solid var(--line);border-radius:10px">' + opt(g.name) + '</select></label>' +
          '<label class="fld"><span>ทุนรอบนี้ (บาท/กก.)</span><select data-ci="cost" style="font-family:var(--ff);padding:8px;border:1px solid var(--line);border-radius:10px">' + opt(g.cost) + '</select></label></div>' +
          '<label class="fld"><span>วันที่ราคามีผล</span><input id="ciEff" type="date" value="' + esc(eff) + '"></label>' +
          '<label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="ciHead" ' + (g.hasHeader ? 'checked' : '') + '><span>แถวแรกเป็นหัวตาราง</span></label>' +
          '<label class="fld"><span>ที่มา (จะติดไปกับทุกรายการ)</span><input id="ciSrc" value="' + esc('ไฟล์ทุน AL ' + f.name.replace(/\.[^.]+$/, '')) + '"></label>' +
          '<p class="hint">อ่านได้ ' + (t.length - (g.hasHeader ? 1 : 0)) + ' แถว · กด "ตรวจไฟล์" เพื่อให้ระบบจับคู่และตรวจตัวเลข</p>';
        m.el.querySelector('#ciRep').innerHTML = ''; REP = null; var ok = m.el.querySelector('.mdl-o'); ok.textContent = 'ตรวจไฟล์'; ok.dataset.mode = ''; ok.disabled = false;
      }).catch(function (e) { PX.toast('อ่านไฟล์ไม่ได้ — ' + esc(e.message), 'bad'); });
    };
  }
  var KIND = { anomaly: 'ทุนผิดปกติ', unmatched: 'ไม่พบ SKU', possible: 'จับคู่ไม่มั่นใจ', duplicate: 'ซ้ำในไฟล์', missing: 'ไม่มีทุน', unit: 'หน่วยไม่รู้จัก' };
  function report(r) {
    var h = '<div class="pre" style="background:var(--blue-l);border-color:var(--blue-b);margin-top:8px"><b>Auto Pass ' + r.auto + '</b> รายการ (ระบบรับทุนเอง) · ไม่เปลี่ยน ' + r.unchanged + ' · <b style="color:' + (r.review ? 'var(--amber)' : 'var(--green)') + '">Need Human Review ' + r.review + '</b>' + (r.alias ? ' · ใช้ชื่อที่เคยจับคู่ไว้ ' + r.alias : '') + (r.problemCount ? ' · แถวว่าง ' + r.problemCount : '') +
      '<br><span class="rnote">วันมีผล ' + esc(r.effective_date) + ' · หน่วยมาตรฐาน บาท/กก. · คนตรวจเฉพาะรายการที่ติด ไม่ต้องไล่ทุกบรรทัด</span></div>';
    if (r.flags.length) h += '<p class="hint" style="margin:10px 0 4px"><b>Review Queue — ยังไม่เข้า Cost Master จนกว่าจะตัดสินทีละรายการ</b> · ' + Object.keys(r.byKind).map(function (k) { return esc(KIND[k] || k) + ' ' + r.byKind[k]; }).join(' · ') + '</p><div class="sc"><table class="g" style="min-width:0"><thead><tr><th>แถว</th><th>ชื่อในไฟล์ → SKU</th><th class="rt">เดิม → ไฟล์</th><th>ติดเพราะ</th></tr></thead><tbody>' +
      r.flags.slice(0, 30).map(function (f) { return '<tr><td>' + f.row + '</td><td><b>' + esc(f.raw) + '</b>' + (f.name && f.name !== f.raw ? '<div class="rnote">→ ' + esc(f.name) + '</div>' : '') + '</td><td class="rt">' + (f.prev == null ? '—' : f.prev) + ' → <b style="color:' + (f.severity === 'critical' ? 'var(--red)' : 'var(--amber)') + '">' + (f.cost == null ? '—' : f.cost) + '</b></td><td style="font-size:11px;white-space:normal"><span class="pill2 ' + (f.severity === 'critical' ? 'r' : 'a') + '">' + esc(KIND[f.kind] || f.kind) + '</span> ' + esc(f.reasons.join(' · ')) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    var auto = r.rows.filter(function (x) { return x.status === 'auto'; });
    if (auto.length) h += '<p class="hint" style="margin:10px 0 4px"><b>Auto Pass</b> (SKU ตรง + ตัวเลขอยู่ในช่วงปกติ): ' + auto.slice(0, 12).map(function (x) { return esc(x.name) + ' ' + x.prev + '→' + x.cost; }).join(' · ') + (auto.length > 12 ? ' · +' + (auto.length - 12) : '') + '</p>';
    if (r.problems.length) h += '<p class="hint" style="margin:10px 0 4px"><b style="color:var(--red)">แถวไม่มีชื่อสินค้า (ข้าม)</b> ' + r.problems.slice(0, 10).map(function (p) { return 'แถว ' + p.row; }).join(', ') + '</p>';
    return h;
  }
  /* การ์ด Cost Review Queue — อ่านง่าย: ชื่อสินค้า · เดิม→ไฟล์ · เหตุผลสั้น 1 บรรทัด · ปุ่มทำทันที · กรองตามชนิด · 20 รายการ/หน้า */
  var QPAGE = 0, QPER = 20, QKIND = '', QOPEN = {};
  var SHORT = { tiny: 'ทุน ≤10 ฿', jump: 'ทุนกระโดด', 'above-price': 'สูงกว่าราคาขาย', history: 'นอกช่วงประวัติ', 'group-low': 'ถูกกว่ากลุ่มมาก', 'group-high': 'แพงกว่ากลุ่มมาก', missing: 'ไม่มีทุน', duplicate: 'ซ้ำในไฟล์', unit: 'หน่วยไม่รู้จัก', unmatched: 'ไม่พบ SKU', possible: 'ชื่อไม่ตรง' };
  function pctTxt(prev, cost) { if (!(prev > 0) || cost == null) return ''; var pc = Math.round((cost - prev) / prev * 100); return (pc > 0 ? '+' : '') + pc + '%'; }
  function shortWhy(f) {
    if (f.kind === 'anomaly') { var codes = (f.checks || []).map(function (c) { return c.code; }); var main = codes.indexOf('jump') >= 0 ? 'jump' : codes[0]; var t = SHORT[main] || 'ทุนผิดปกติ'; if (main === 'jump') t += ' ' + pctTxt(f.prev, f.cost); if (codes.length > 1) t += ' +' + (codes.length - 1); return t; }
    if (f.kind === 'possible') return (f.idx != null ? 'ลำดับ ' + f.idx + ' ' : '') + 'ชื่อไม่ตรง' + (f.candidates && f.candidates[0] ? ' → ' + f.candidates[0].name + ' ' + Math.round(f.candidates[0].score * 100) + '%' : '');
    if (f.kind === 'unmatched') return 'ไม่พบ SKU' + (f.candidates && f.candidates[0] ? ' · ใกล้สุด ' + f.candidates[0].name : '');
    return SHORT[f.kind] || f.kindText || f.kind;
  }
  function flagsCard(j) {
    var pendAll = (j.rows || []).filter(function (f) { return f.status === 'pending' || f.status === 'hold'; }), KT = j.kindText || KIND;
    var kinds = {}; pendAll.forEach(function (f) { kinds[f.kind] = (kinds[f.kind] || 0) + 1; });
    if (QKIND && !kinds[QKIND]) QKIND = '';
    var pend = QKIND ? pendAll.filter(function (f) { return f.kind === QKIND; }) : pendAll;
    var pages = Math.max(1, Math.ceil(pend.length / QPER)); if (QPAGE >= pages) QPAGE = pages - 1; var pageRows = pend.slice(QPAGE * QPER, (QPAGE + 1) * QPER);
    var batches = (j.batches || []).slice(0, 5), B = 'class="btn" style="padding:4px 9px;font-size:11px"';
    var h = '<div class="card" id="flags" style="margin-top:14px"><h3>Cost Review Queue <span class="sub">' + (pendAll.length ? '<b style="color:var(--amber)">' + pendAll.length + ' รอตัดสิน</b>' : 'ไม่มีค้าง — ระบบรับทุนปกติให้เองแล้ว') + '</span></h3>' +
      '<p class="hint" style="margin:0 0 8px">คนตัดสินเฉพาะรายการที่ระบบกันไว้ · <b>ใช้</b> = เลขถูกจริง · <b>แก้</b> = ไฟล์ผิด · <b>พัก</b> = รอต้นทาง (SKU นั้นตั้งราคาไม่ได้ชั่วคราว) · <b>เลือก SKU</b> = ระบบจำชื่อให้ครั้งหน้า</p>';
    if (pendAll.length) h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px"><button class="tab' + (!QKIND ? ' on' : '') + '" onclick="CostImport.kind(\'\')">ทั้งหมด ' + pendAll.length + '</button>' + Object.keys(kinds).sort(function (a, b) { return kinds[b] - kinds[a]; }).map(function (k) { return '<button class="tab' + (QKIND === k ? ' on' : '') + '" onclick="CostImport.kind(' + JSON.stringify(k).replace(/"/g, '&quot;') + ')">' + esc(KT[k] || k) + ' ' + kinds[k] + '</button>'; }).join('') + '</div>';
    if (pageRows.length) h += '<div class="sc"><table class="g" style="min-width:680px"><thead><tr><th>สินค้า</th><th class="rt">เดิม → ไฟล์</th><th>ทำไมถึงติด</th><th></th></tr></thead><tbody>' + pageRows.map(function (f) {
      var crit = f.severity === 'critical', known = !!f.product_id, why = shortWhy(f), full = (f.reasons || []).join(' · ');
      var acts = known ? '<button class="btn pri" style="padding:4px 9px;font-size:11px" title="ใช้ทุนตามไฟล์" onclick="CostImport.act(' + f.id + ',\'confirm\')">ใช้ ' + (f.cost == null ? '' : f.cost) + '</button> <button ' + B + ' onclick="CostImport.act(' + f.id + ',\'correct\')">แก้</button> ' + (f.status === 'hold' ? '' : '<button ' + B + ' onclick="CostImport.act(' + f.id + ',\'hold\')">พัก</button> ') : '';
      acts += (!known || f.kind === 'possible' ? '<button class="btn pri" style="padding:4px 9px;font-size:11px" onclick="CostImport.pick(' + f.id + ')">เลือก SKU</button> ' : '') + '<button class="lnk3" onclick="CostImport.act(' + f.id + ',\'skip\')">ไม่ใช้</button>';
      return '<tr><td style="white-space:normal;min-width:220px"><b>' + esc(f.name || f.raw) + '</b>' + (f.name && f.raw && f.name !== f.raw ? '<div class="rnote">ในไฟล์: ' + esc(f.raw) + '</div>' : '') + (f.status === 'hold' ? '<div class="rnote" style="color:var(--red)">⏸ พักไว้' + (f.note ? ' · ' + esc(f.note) : '') + '</div>' : '') + '<div class="rnote" style="font-size:10px">' + esc(f.batch_id || '') + ' · ' + esc(String(f.at || '').slice(5, 16).replace('T', ' ')) + '</div></td>' +
        '<td class="rt" style="white-space:nowrap">' + (f.prev == null ? '—' : f.prev) + ' → <b style="color:' + (crit ? 'var(--red)' : 'var(--amber)') + '">' + (f.cost == null ? '—' : f.cost) + '</b>' + (f.kind === 'anomaly' && pctTxt(f.prev, f.cost) ? '<div class="rnote">' + pctTxt(f.prev, f.cost) + '</div>' : '') + '</td>' +
        '<td style="white-space:normal;min-width:200px;max-width:320px"><span class="pill2 ' + (crit ? 'r' : 'a') + '" title="' + esc(full) + '">' + esc(why) + '</span>' + (QOPEN[f.id] ? '<div class="rnote" style="margin-top:4px;line-height:1.5">' + esc(full) + '</div>' : '') + ' <a href="#" class="lnk2" style="font-size:11px" onclick="CostImport.more(' + f.id + ');return false">' + (QOPEN[f.id] ? 'ซ่อน' : 'ทำไม?') + '</a></td>' +
        '<td style="white-space:nowrap">' + acts + '</td></tr>'; }).join('') + '</tbody></table></div>';
    if (pend.length > QPER) h += '<div class="pgb" style="margin-top:8px"><span>หน้า ' + (QPAGE + 1) + '/' + pages + ' · แสดง ' + (QPAGE * QPER + 1) + '–' + Math.min((QPAGE + 1) * QPER, pend.length) + ' จาก ' + pend.length + '</span><span class="sp2"><button ' + (QPAGE === 0 ? 'disabled' : '') + ' onclick="CostImport.page(' + (QPAGE - 1) + ')">← ก่อนหน้า</button>' + (PX.pageNums ? PX.pageNums(QPAGE, pages).map(function (i) { return i < 0 ? '<span style="padding:0 4px;color:var(--tx-3)">…</span>' : '<button class="' + (i === QPAGE ? 'on' : '') + '" onclick="CostImport.page(' + i + ')">' + (i + 1) + '</button>'; }).join('') : '') + '<button ' + (QPAGE >= pages - 1 ? 'disabled' : '') + ' onclick="CostImport.page(' + (QPAGE + 1) + ')">ถัดไป →</button></span></div>';
    if (batches.length) h += '<h3 style="margin-top:14px;font-size:13px">Batch ล่าสุด</h3><div class="sc"><table class="g" style="min-width:560px"><thead><tr><th>Batch</th><th>ที่มา</th><th class="rt">แถว</th><th class="rt">Auto</th><th class="rt">Review</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
      batches.map(function (b) { var pn = b.pendingNow != null ? b.pendingNow : (b.status === 'done' ? 0 : b.review); return '<tr><td><b>' + esc(b.id) + '</b><div class="rnote">' + esc(String(b.at || '').slice(5, 16).replace('T', ' ')) + ' · ' + esc(b.by || 'system') + ' · มีผล ' + esc(b.effective_date || '') + '</div></td><td style="font-size:11px">' + esc(b.source) + (b.file ? '<div class="rnote">' + esc(b.file) + '</div>' : '') + '</td><td class="rt">' + b.rows + '</td><td class="rt" style="color:var(--green)"><b>' + b.auto + '</b></td><td class="rt" style="color:' + (b.review ? 'var(--amber)' : 'var(--tx-3)') + '"><b>' + b.review + '</b></td><td><span class="pill2 ' + (pn ? 'a' : 'g') + '">' + (pn ? 'รอตรวจ ' + pn : 'เสร็จ') + '</span></td><td style="white-space:nowrap">' + (pn ? '<button class="lnk3" onclick="CostImport.skipBatch(' + JSON.stringify(b.id).replace(/"/g, '&quot;') + ',' + pn + ')">ไม่ใช้ที่ค้างทั้ง batch</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return h + '</div>';
  }
  function render() { var old = document.getElementById('flags'); var html = flagsCard(LAST); if (old) old.outerHTML = html; else document.getElementById('main').insertAdjacentHTML('beforeend', html); }
  function page(n) { QPAGE = Math.max(0, n); render(); var el = document.getElementById('flags'); if (el) el.scrollIntoView({ block: 'start' }); }
  function kind(k) { QKIND = k || ''; QPAGE = 0; render(); }
  function more(id) { QOPEN[id] = !QOPEN[id]; render(); }
  function skipBatch(bid, n) {
    PX.modal({ title: 'ไม่ใช้รายการที่ค้างทั้ง batch', sub: bid + ' · ' + n + ' รายการที่ยังรอตัดสินจะถูกปิดด้วย "ไม่ใช้" (ทุนเดิมใน Cost Master ไม่เปลี่ยน)', fields: [{ k: 'note', label: 'เหตุผล', value: 'ไฟล์ทดสอบ / นำเข้าผิดคอลัมน์' }], okText: 'ไม่ใช้ทั้งหมด',
      onOk: function (v, close) { close(); var ids = (LAST.rows || []).filter(function (f) { return f.batch_id === bid && (f.status === 'pending' || f.status === 'hold'); }).map(function (f) { return f.id; }), done = 0;
        PX.toast('กำลังปิด ' + ids.length + ' รายการ…');
        return ids.reduce(function (pr, id) { return pr.then(function () { return PX.post('/api/cost-flags/decide', { id: id, action: 'skip', note: v.note }).then(function () { done++; }, function () {}); }); }, Promise.resolve()).then(function () { after('ปิดแล้ว ' + done + '/' + ids.length + ' รายการใน ' + esc(bid)); }); } });
  }
  var LAST = {};
  function after(msg) { PX.toast(msg); if (typeof reload === 'function') reload(); else mountFlags(); if (typeof CostImport.onDone === 'function') CostImport.onDone(); }
  function fail(e) { PX.toast('ไม่สำเร็จ — ' + esc(e.message), 'bad'); return false; }
  function act(id, action) {
    var f = (LAST.rows || []).filter(function (x) { return x.id === id; })[0] || {};
    if (action === 'correct') return PX.modal({ title: 'แก้ทุน · ' + esc(f.name || ''), sub: 'ไฟล์ว่า ' + f.cost + ' ฿ · เดิม ' + (f.prev == null ? '—' : f.prev) + ' ฿ · ' + esc((f.reasons || []).join(' · ')), fields: [{ k: 'cost', label: 'ทุนที่ถูกต้อง (บาท/กก.)', type: 'num', value: f.cost }, { k: 'note', label: 'เหตุผล', value: '' }], okText: 'ใช้ค่านี้',
      onOk: function (v, close) { return PX.post('/api/cost-flags/decide', { id: id, action: 'correct', cost: v.cost, note: v.note }).then(function () { close(); after('แก้ทุน ' + esc(f.name) + ' เป็น ' + v.cost + ' ฿ แล้ว · ราคาคิดใหม่ทุกใบ'); }).catch(fail); } });
    if (action === 'hold') return PX.modal({ title: 'พักไว้ก่อน · ' + esc(f.name || ''), sub: 'ยังไม่อัปเดต Cost Master · SKU นี้จะขึ้น "Waiting for Cost" และตั้งราคาใหม่ไม่ได้จนกว่าจะยืนยัน', fields: [{ k: 'note', label: 'รออะไร (เช่น รอเฮียหมิงยืนยัน)', value: '' }], okText: 'พักไว้',
      onOk: function (v, close) { return PX.post('/api/cost-flags/decide', { id: id, action: 'hold', note: v.note }).then(function () { close(); after('พัก ' + esc(f.name) + ' ไว้ — Waiting for Cost Confirmation'); }).catch(fail); } });
    return PX.post('/api/cost-flags/decide', { id: id, action: action }).then(function () { after(action === 'confirm' ? 'ยืนยันทุน ' + esc(f.name) + ' = ' + f.cost + ' ฿ · ราคาคิดใหม่ทุกใบ' : 'ไม่ใช้ค่าจากไฟล์'); }).catch(fail);
  }
  /* เลือก SKU ให้ชื่อที่จับไม่ได้ — ระบบจำ mapping ไว้ ครั้งหน้าไม่ถาม */
  function pick(id) {
    var f = (LAST.rows || []).filter(function (x) { return x.id === id; })[0] || {};
    PX.get('/api/pricelist').then(function (pl) {
      var rows = pl.rows, cands = f.candidates || [];
      var opt = function (list) { return list.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + ' · ' + esc(r.grp) + '</option>'; }).join(''); };
      var m = PX.modal({ title: 'เลือก SKU · "' + esc(f.raw || '') + '"', sub: 'ทุนในไฟล์ ' + (f.cost == null ? '—' : f.cost + ' ฿') + ' · เลือกแล้วระบบจะจำว่าชื่อนี้ = SKU นี้ ครั้งหน้าจับให้เอง', okText: 'ใช้ SKU นี้ (จำไว้)',
        html: (cands.length ? '<p class="hint">ใกล้เคียงที่สุด (กดเพื่อเลือก):</p><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' + cands.map(function (c) { return '<button type="button" class="opt2" data-pk="' + esc(c.id) + '"><b>' + esc(c.name) + '</b><i>' + Math.round(c.score * 100) + '% · ' + esc(c.grp) + ' · ทุน ' + c.cost + '</i></button>'; }).join('') + '</div>' : '') +
          '<label class="fld"><span>ค้นหา</span><input id="pkQ" placeholder="พิมพ์ชื่อสินค้า…"></label><label class="fld"><span>SKU</span><select id="pkSel" style="font-family:var(--ff);padding:8px;border:1px solid var(--line);border-radius:10px">' + opt(rows) + '</select></label>',
        onOk: function (v, close) { var pid = m.el.querySelector('#pkSel').value; return PX.post('/api/cost-flags/decide', { id: id, action: 'match', product_id: pid }).then(function (r) { close(); after('จับคู่ "' + esc(f.raw) + '" → ' + esc(r.name) + (r.rematched ? ' แล้ว · แต่ตัวเลขยังต้องตรวจ' : r.status === 'approved' ? ' · ใช้ทุน ' + f.cost + ' ฿' : ' แล้ว')); }).catch(fail); } });
      var sel = m.el.querySelector('#pkSel'); if (cands.length) sel.value = cands[0].id;
      Array.prototype.forEach.call(m.el.querySelectorAll('[data-pk]'), function (b) { b.onclick = function () { sel.innerHTML = opt(rows); sel.value = b.getAttribute('data-pk'); }; });
      m.el.querySelector('#pkQ').oninput = function () { var q = this.value.trim().toLowerCase(); sel.innerHTML = opt(rows.filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0; }).slice(0, 80)); };
    });
  }
  function decide(id, approve) { return act(id, approve ? 'confirm' : 'skip'); }   /* ปุ่มเดิมในหน้าแรกยังใช้ได้ */
  function mountFlags() { return PX.get('/api/cost-flags?limit=1000').then(function (j) { LAST = j; render(); if (location.hash === '#flags') { var el = document.getElementById('flags'); if (el) el.scrollIntoView(); } }); }
  return { open: open, decide: decide, act: act, pick: pick, mountFlags: mountFlags, page: page, kind: kind, more: more, skipBatch: skipBatch, last: function () { return REP; }, table: function () { return TBL; } };
})();
