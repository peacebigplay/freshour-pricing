/* ══════════════════════════════════════════════════════════════════
   นำเข้าไฟล์ทุน AL (หน้า ทุน/ตลาด) — คอมเมนต์ผู้ใช้: "ไฟล์ทุน AL จากพี่หมิงยังต้องมีคนพิมพ์ทุนเข้าระบบเอง
   ที่ขาดคือตัวอ่านไฟล์อัตโนมัติ และตัวเช็กตัวเลขแปลก เช่น ทุน 3 บาท"
   เลือกไฟล์ (CSV/Excel) → เดาคอลัมน์ชื่อ/ทุน → ระบบจับคู่ SKU + ตรวจตัวเลข (ยังไม่เขียน) → ดูรายงาน → บันทึก
   ตัวที่ติดด่าน (ทุน ≤10 · กระโดด ≥30% · สูงกว่าราคาขาย · ต่ำกว่าครึ่งของหมวด) จะไม่ถูกใช้ จนกว่าพี่จุ๋มกดยืนยันทีละตัว
   ══════════════════════════════════════════════════════════════════ */
window.CostImport = (function () {
  var esc = PX.esc, TBL = null, REP = null;
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, i, c; text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) { c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c; }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = function () { ok(window.XLSX); }; s.onerror = function () { no(new Error('โหลดตัวอ่าน Excel ไม่ได้ — บันทึกไฟล์เป็น CSV แล้วลองใหม่')); }; document.head.appendChild(s); });
  }
  /* PDF จากโรงงาน: อ่านข้อความทุกหน้า จัดกลุ่มเป็นบรรทัดตามแนวตั้ง → บรรทัดที่ลงท้ายด้วยตัวเลข = [ชื่อ, ทุน] */
  function loadPDF() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); }; s.onerror = function () { no(new Error('โหลดตัวอ่าน PDF ไม่ได้ (ต้องต่อเน็ต) — ส่งเป็น Excel/CSV แทนได้')); }; document.head.appendChild(s); });
  }
  function pdfRows(pdf) {
    var pages = []; for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }));
    return Promise.all(pages).then(function (tcs) {
      var out = [['สินค้า', 'ทุน']];
      tcs.forEach(function (tc) {
        var lines = {}; tc.items.forEach(function (it) { if (!it.str.trim()) return; var y = Math.round(it.transform[5] / 3) * 3; (lines[y] = lines[y] || []).push({ x: it.transform[4], s: it.str }); });
        Object.keys(lines).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
          var txt = lines[y].sort(function (a, b) { return a.x - b.x; }).map(function (t) { return t.s; }).join(' ').replace(/\s+/g, ' ').trim();
          var m = txt.match(/^(.*?[ก-๙A-Za-z].*?)\s+(\d{1,4}(?:[.,]\d{1,2})?)(?:\s*(?:บาท|฿|\/กก\.?|บ\.))?\s*$/) || txt.match(/^(.*?[ก-๙A-Za-z].*?)\s+(\d{1,4}(?:[.,]\d{1,2})?)\s+\d/);
          if (m && !/รวม|total|หน้า|page|วันที่|เลขที่/i.test(m[1])) out.push([m[1].replace(/^\d+[.)]\s*/, '').trim(), m[2].replace(',', '.')]);
        });
      });
      if (out.length < 2) throw new Error('ไม่เจอบรรทัด "ชื่อสินค้า ตัวเลข" ใน PDF — ถ้าเป็น PDF สแกน ให้ถ่ายรูป/พิมพ์แทน');
      return out;
    });
  }
  function readTable(file) {
    if (/\.pdf$/i.test(file.name)) return loadPDF().then(function (L) { return file.arrayBuffer().then(function (b) { return L.getDocument({ data: b }).promise; }).then(pdfRows); });
    if (/\.(xlsx|xls)$/i.test(file.name)) return loadXLSX().then(function (X) { return file.arrayBuffer().then(function (b) { var wb = X.read(b, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]]; return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }); }); });
    return file.text().then(parseCSV);
  }
  /* เดาคอลัมน์: ชื่อสินค้า = คอลัมน์ที่เป็นข้อความไทยมากสุด · ทุน = คอลัมน์ตัวเลขที่หัวมีคำว่า ทุน/ราคา/cost */
  function guess(tbl) {
    var head = tbl[0].map(function (h) { return String(h).toLowerCase(); }), body = tbl.slice(1, 30), n = tbl[0].length, name = -1, cost = -1;
    head.forEach(function (h, i) { if (name < 0 && /สินค้า|รายการ|ชื่อ|product|item|sku/.test(h)) name = i; if (cost < 0 && /ทุน|cost|ราคา|price|บาท/.test(h)) cost = i; });
    if (name < 0) { var best = -1, bs = 0; for (var i = 0; i < n; i++) { var s = body.filter(function (r) { return /[ก-๙]/.test(String(r[i] || '')); }).length; if (s > bs) { bs = s; best = i; } } name = best; }
    if (cost < 0) { for (var j = 0; j < n; j++) { if (j === name) continue; var num = body.filter(function (r) { return r[j] !== '' && isFinite(Number(String(r[j]).replace(/,/g, ''))); }).length; if (num > body.length * 0.6) { cost = j; break; } } }
    return { name: name, cost: cost, hasHeader: name >= 0 && !/[0-9]/.test(String(tbl[0][cost] || '')) && !/[ก-๙]{3,}/.test(String(tbl[0][cost] || '')) ? true : !isFinite(Number(String(tbl[0][cost] || '').replace(/,/g, ''))) };
  }
  function rowsFrom(map, hasHeader) { return (hasHeader ? TBL.slice(1) : TBL).map(function (r) { return { product: String(r[map.name] || '').trim(), cost: String(r[map.cost] || '').trim() }; }).filter(function (r) { return r.product; }); }
  function open() {
    TBL = null; REP = null;
    var m = PX.modal({ title: 'นำเข้าไฟล์ทุน AL', sub: 'ไฟล์จากโรงงานที่พี่หมิงส่งมา (PDF / Excel / CSV) · ระบบจับคู่ชื่อกับสินค้าในระบบเอง และกันตัวเลขแปลกไว้ให้ตรวจก่อนใช้',
      html: '<label class="fld"><span>ไฟล์</span><input type="file" id="ciFile" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf"></label><div id="ciMap"></div><div id="ciRep"></div>' +
        '<p class="hint">ไม่มีไฟล์? <a href="#" class="lnk2" id="ciSample">ดาวน์โหลดแม่แบบ CSV</a> · หรือใช้ "วางทุนจาก Excel" สำหรับคัดลอก-วาง</p>',
      okText: 'ตรวจไฟล์', note: 'ตรวจก่อน ยังไม่เขียนอะไรจนกว่าจะกด "บันทึก"',
      onOk: function (v, close) {
        if (!TBL) { PX.toast('เลือกไฟล์ก่อน', 'bad'); return false; }
        var map = { name: +m.el.querySelector('[data-ci="name"]').value, cost: +m.el.querySelector('[data-ci="cost"]').value }, hh = m.el.querySelector('#ciHead').checked;
        if (!(map.name >= 0) || !(map.cost >= 0) || map.name === map.cost) { PX.toast('เลือกคอลัมน์ชื่อสินค้าและทุนให้ต่างกัน', 'bad'); return false; }
        var rows = rowsFrom(map, hh), okBtn = m.el.querySelector('.mdl-o'), rep = m.el.querySelector('#ciRep'), src = (m.el.querySelector('#ciSrc') || {}).value || 'ไฟล์ทุน AL';
        var commit = REP && okBtn.dataset.mode === 'commit';
        okBtn.disabled = true; okBtn.textContent = commit ? 'กำลังบันทึก…' : 'กำลังตรวจ…';
        PX.post('/api/import/costs', { rows: rows, commit: commit, source: src, channel: /\.pdf$/i.test((m.el.querySelector('#ciFile').files[0] || {}).name || '') ? 'pdf' : 'upload' }).then(function (r) {
          okBtn.disabled = false; REP = r;
          if (commit) { close(); PX.toast('บันทึกทุน <b>' + r.applied + '</b> รายการ' + (r.flagged ? ' · กันไว้ตรวจ <b>' + r.flagged + '</b>' : '') + (r.problemCount ? ' · จับคู่ไม่ได้ ' + r.problemCount : '')); if (typeof reload === 'function') reload(); if (window.CostImport.onDone) window.CostImport.onDone(); return; }
          rep.innerHTML = report(r);
          var can = r.changed > 0 || r.flagged > 0;
          okBtn.textContent = can ? 'บันทึก ' + r.changed + ' รายการ' + (r.flagged ? ' (กัน ' + r.flagged + ' ไว้ตรวจ)' : '') : 'ไม่มีอะไรเปลี่ยน'; okBtn.dataset.mode = can ? 'commit' : ''; okBtn.disabled = !can;
        }).catch(function (e) { okBtn.disabled = false; okBtn.textContent = 'ตรวจไฟล์'; PX.toast('ไม่สำเร็จ — ' + esc(e.message), 'bad'); });
        return false;
      } });
    m.el.querySelector('#ciSample').onclick = function (e) { e.preventDefault(); PX.csv('ทุน-AL-แม่แบบ.csv', [['สินค้า', 'ทุน (บาท/กก.)'], ['มันแข็งหมู', '65'], ['หมูบด มัน 20%', '101']]); };
    m.el.querySelector('#ciFile').onchange = function () {
      var f = this.files[0]; if (!f) return;
      readTable(f).then(function (t) {
        if (!t.length) throw new Error('ไฟล์ว่าง');
        TBL = t; var g = guess(t), n = t[0].length, opt = function (sel) { var o = ''; for (var i = 0; i < n; i++) o += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>คอลัมน์ ' + (i + 1) + ': ' + esc(String(t[0][i] || '').slice(0, 24)) + '</option>'; return o; };
        m.el.querySelector('#ciMap').innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="fld"><span>ชื่อสินค้า</span><select data-ci="name" style="font-family:var(--ff);padding:8px;border:1px solid var(--line);border-radius:10px">' + opt(g.name) + '</select></label>' +
          '<label class="fld"><span>ทุน (บาท/กก.)</span><select data-ci="cost" style="font-family:var(--ff);padding:8px;border:1px solid var(--line);border-radius:10px">' + opt(g.cost) + '</select></label></div>' +
          '<label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="ciHead" ' + (g.hasHeader ? 'checked' : '') + '><span>แถวแรกเป็นหัวตาราง</span></label>' +
          '<label class="fld"><span>ที่มา (จะติดไปกับทุกรายการ)</span><input id="ciSrc" value="' + esc('ไฟล์ทุน AL ' + f.name.replace(/\.[^.]+$/, '')) + '"></label>' +
          '<p class="hint">อ่านได้ ' + (t.length - (g.hasHeader ? 1 : 0)) + ' แถว · กด "ตรวจไฟล์" เพื่อให้ระบบจับคู่และตรวจตัวเลข</p>';
        m.el.querySelector('#ciRep').innerHTML = ''; REP = null; var ok = m.el.querySelector('.mdl-o'); ok.textContent = 'ตรวจไฟล์'; ok.dataset.mode = ''; ok.disabled = false;
      }).catch(function (e) { PX.toast('อ่านไฟล์ไม่ได้ — ' + esc(e.message), 'bad'); });
    };
  }
  function report(r) {
    var h = '<div class="pre" style="background:var(--blue-l);border-color:var(--blue-b);margin-top:8px"><b>จับคู่ได้ ' + r.rows.length + ' รายการ</b> · เปลี่ยนจริง ' + r.changed + ' · เดาชื่อ ' + r.fuzzy + ' · <b style="color:' + (r.flagged ? 'var(--red)' : 'var(--green)') + '">ตัวเลขแปลก ' + r.flagged + '</b>' + (r.problemCount ? ' · <b style="color:var(--red)">จับคู่ไม่ได้ ' + r.problemCount + '</b>' : '') + '</div>';
    if (r.flags.length) h += '<p class="hint" style="margin:10px 0 4px"><b>ติดด่าน — จะไม่ถูกใช้จนกว่าจะยืนยันทีละตัว (ในหน้าแรก/ด้านล่าง)</b></p><div class="sc"><table class="g" style="min-width:0"><tbody>' + r.flags.map(function (f) { return '<tr><td><b>' + esc(f.name) + '</b>' + (f.raw !== f.name ? '<div class="rnote">ในไฟล์: ' + esc(f.raw) + '</div>' : '') + '</td><td class="rt">' + (f.prev || '—') + ' → <b style="color:var(--red)">' + f.cost + '</b></td><td style="white-space:normal;font-size:11px;color:var(--tx-2)">' + esc(f.checks.map(function (c) { return c.text; }).join(' · ')) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    var fz = r.rows.filter(function (x) { return x.how === 'fuzzy' && !x.checks.length; });
    if (fz.length) h += '<p class="hint" style="margin:10px 0 4px"><b>ชื่อไม่ตรงเป๊ะ — ระบบเดาให้ (ตรวจสายตา)</b></p><div class="sc"><table class="g" style="min-width:0"><tbody>' + fz.slice(0, 12).map(function (f) { return '<tr><td>' + esc(f.raw) + ' → <b>' + esc(f.name) + '</b></td><td class="rt">' + (f.prev || '—') + ' → ' + f.cost + '</td><td class="rt">' + Math.round(f.score * 100) + '%</td></tr>'; }).join('') + (fz.length > 12 ? '<tr><td colspan="3" class="rnote">…อีก ' + (fz.length - 12) + '</td></tr>' : '') + '</tbody></table></div>';
    if (r.problems.length) h += '<p class="hint" style="margin:10px 0 4px"><b style="color:var(--red)">จับคู่ไม่ได้ (จะข้าม)</b></p><div class="pre">' + r.problems.slice(0, 15).map(function (p) { return 'แถว ' + p.row + ': ' + esc(p.name || '') + ' — ' + esc(p.reason); }).join('\n') + (r.problems.length > 15 ? '\n…อีก ' + (r.problems.length - 15) : '') + '</div>';
    return h;
  }
  /* การ์ดรายการที่รอตรวจ (วางท้ายหน้า ทุน/ตลาด) */
  function flagsCard(j) {
    var pend = (j.rows || []).filter(function (f) { return f.status === 'pending'; });
    return '<div class="card" id="flags" style="margin-top:14px"><h3>ทุนจากไฟล์ที่ติดด่านตรวจ <span class="sub">' + (pend.length ? pend.length + ' รายการรอตัดสิน' : 'ไม่มีค้าง') + ' · นำเข้าล่าสุด ' + (j.imports && j.imports[0] ? PX.ago(j.imports[0].at) + ' (' + j.imports[0].applied + ' ใช้แล้ว)' : '—') + '</span></h3>' +
      '<p class="hint">ระบบไม่ใช้ตัวเลขที่แปลกเอง — ทุน ≤10 บาท · กระโดด ≥30% · สูงกว่าราคาขาย · ต่ำกว่าครึ่งของหมวด ต้องให้คนดูก่อน</p>' +
      (pend.length ? '<div class="sc"><table class="g" style="min-width:640px"><thead><tr><th>สินค้า</th><th class="rt">เดิม → ไฟล์</th><th>ทำไมถึงติด</th><th></th></tr></thead><tbody>' + pend.map(function (f) { return '<tr><td><b>' + esc(f.name) + '</b>' + (f.raw !== f.name ? '<div class="rnote">ในไฟล์: ' + esc(f.raw) + '</div>' : '') + '<div class="rnote">' + PX.ago(f.at) + '</div></td><td class="rt">' + (f.prev || '—') + ' → <b style="color:var(--red)">' + f.cost + ' ฿</b></td><td style="white-space:normal;font-size:11.5px">' + esc(f.reasons.join(' · ')) + '</td>' +
        '<td style="white-space:nowrap"><button class="btn pri" style="padding:4px 10px;font-size:11px" onclick="CostImport.decide(' + f.id + ',true,' + f.cost + ',' + JSON.stringify(f.name).replace(/"/g, '&quot;') + ')">ใช้ค่านี้</button> <button class="btn" style="padding:4px 10px;font-size:11px" onclick="CostImport.decide(' + f.id + ',false)">ไม่ใช้</button></td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      (j.rows && j.rows.some(function (f) { return f.status !== 'pending'; }) ? '<p class="rnote" style="margin-top:8px">ตัดสินแล้ว: ' + j.rows.filter(function (f) { return f.status !== 'pending'; }).slice(0, 6).map(function (f) { return esc(f.name) + ' ' + (f.status === 'approved' ? '✓ ใช้ ' + f.final : '✗ ไม่ใช้'); }).join(' · ') + '</p>' : '') + '</div>';
  }
  function decide(id, approve, cost, name) {
    var go = function (c) { return PX.post('/api/cost-flags/decide', { id: id, approve: approve, cost: c }).then(function () { PX.toast(approve ? 'ใช้ทุน ' + esc(name) + ' = ' + c + ' ฿' : 'ไม่ใช้ค่าจากไฟล์'); if (typeof reload === 'function') reload(); }).catch(function (e) { PX.toast('ไม่สำเร็จ — ' + esc(e.message), 'bad'); }); };
    if (!approve) return go();
    PX.modal({ title: 'ใช้ทุนนี้ · ' + name, fields: [{ k: 'cost', label: 'ทุนที่จะใช้ (แก้ได้ถ้าไฟล์พิมพ์ผิด)', type: 'num', value: cost }], okText: 'ใช้ค่านี้', onOk: function (v, close) { var c = Number(v.cost); if (!(c > 0)) { PX.toast('ทุนต้องมากกว่า 0', 'bad'); return false; } close(); return go(c); } });
  }
  function mountFlags() { PX.get('/api/cost-flags').then(function (j) { var old = document.getElementById('flags'); var html = flagsCard(j); if (old) old.outerHTML = html; else document.getElementById('main').insertAdjacentHTML('beforeend', html); if (location.hash === '#flags') { var el = document.getElementById('flags'); if (el) el.scrollIntoView({ behavior: 'smooth' }); } }).catch(function () {}); }
  return { open: open, decide: decide, mountFlags: mountFlags };
})();
