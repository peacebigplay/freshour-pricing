/* ══ เป้า margin รายหมวด + รายสินค้า — ชิ้นเดียวใช้ร่วมหน้า "ตั้งราคา" และ "Margin Guard" ══════════════
   พีช 30 ก.ย.: "ส่วนนี้ต้องเป็นข้อมูลเดียวกันกับหน้า margin guard · แต่ละหมวดปรับแก้ไข item ได้ว่าต้องได้กำไรเท่าไหร่"
   ข้อมูลมาจาก /api/category-guard + /api/category-items · แก้ผ่าน /api/category-targets + /api/sku-category
   เป้าทุกตัวต่ำกว่า floor 12% ไม่ได้ (เครื่องคิดราคาใช้ 12% แทน) — หน้าเว็บบอกตรงๆ ไม่ซ่อน */
window.CatMargin = (function () {
  var esc = PX.esc;
  var jsq = function (v) { return JSON.stringify(String(v == null ? '' : v)).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CAT = null, ON = null, IT = null, IPG = 0, IPER = 20, CHANGED = false, OPEN = false;
  var TONE = { bad: ['r', 'ต่ำกว่าเป้า'], warn: ['a', 'เฉียดเป้า'], good: ['g', 'ถึงเป้า'], unknown: ['n', 'ไม่มีข้อมูล'] };
  var tgtText = function (g) { return g.lo === g.hi ? g.lo + '%' : g.lo + '–' + g.hi + '%'; };
  function basis(x) {
    return x.margin == null ? 'ไม่มีรายการที่รู้ทุน'
      : x.basis === 'volume' ? 'ถ่วงปริมาณขาย · รู้ปริมาณ ' + x.known + '/' + x.n + ' รายการ'
      : 'เฉลี่ยตามรายการ ' + x.n + ' ตัว · ยังไม่รู้ปริมาณขาย';
  }
  /* ตารางหมวด — คืน HTML (หน้าไหนก็วางได้) · onChange = หน้าจะโหลดตัวเลขใหม่หลังแก้ */
  function html(cat, onChange) {
    CAT = cat; ON = onChange || null;
    if (!cat) return '';
    return '<div class="card catm"><h3>เป้า margin รายหมวด <span class="sub">floor รวม ' + cat.floorPct + '% · ทิศทางรวม ' + tgtText(cat.portfolio) + '</span></h3>' +
      '<p class="hint">สินค้าแต่ละหมวดทำกำไรได้ไม่เท่ากัน — ตั้งเป้าแยกหมวด ไม่ใช่ค่าเดียวเหมาทั้งพอร์ต · "ใช้คิดราคา" = ขั้นต่ำที่ราคาแนะนำทุก Goal ใช้จริง ' +
      '(ต่ำกว่า floor ' + cat.floorPct + '% ไม่ได้) · กด "สินค้า" เพื่อดู/ย้ายหมวด หรือตั้งเป้าเฉพาะตัว</p>' +
      '<div class="sc"><table class="g" style="min-width:720px"><thead><tr><th>หมวด</th><th class="rt">ช่วงเป้า</th><th class="rt">ใช้คิดราคา</th>' +
      '<th class="rt">ตอนนี้</th><th>สถานะ</th><th>ที่มาของตัวเลข</th><th></th></tr></thead><tbody>' +
      [cat.portfolio].concat(cat.groups).map(function (g) {
        var t = TONE[g.state] || TONE.unknown, isP = g === cat.portfolio;
        return '<tr><td><b>' + esc(g.name) + '</b>' + (g.examples ? '<div class="rnote">' + esc(g.examples) + '</div>' : '') + '</td>' +
          '<td class="rt"><b>' + tgtText(g) + '</b></td>' +
          '<td class="rt">' + (isP ? '<span style="color:var(--tx-3)">เป้ารวม</span>' : '<b>' + g.effective + '%</b>' +
            (g.target < cat.floorPct ? '<div class="rnote">ตั้งไว้ ' + g.target + '% → ใช้ floor ' + cat.floorPct + '%</div>' : '')) + '</td>' +
          '<td class="rt"><b>' + (g.margin == null ? '—' : g.margin + '%') + '</b></td>' +
          '<td><span class="pill2 ' + t[0] + '">' + t[1] + '</span></td>' +
          '<td style="white-space:normal;font-size:11px;color:var(--tx-3)">' + esc(basis(g)) + '</td>' +
          '<td style="white-space:nowrap"><button class="btn" style="padding:4px 10px;font-size:11px" onclick="CatMargin.editTarget(' + jsq(isP ? 'portfolio' : g.key) + ')">แก้เป้า</button>' +
          (isP ? '' : ' <button class="btn" style="padding:4px 10px;font-size:11px" onclick="CatMargin.items(' + jsq(g.key) + ')">สินค้า ' + g.n + ' →</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function editTarget(key) {
    var g = key === 'portfolio' ? CAT.portfolio : CAT.groups.filter(function (x) { return x.key === key; })[0]; if (!g) return;
    PX.modal({
      title: 'แก้เป้า margin · ' + g.name,
      sub: 'ช่วงต่ำสุด–สูงสุด = ใช้วัดผล · "เป้าที่ใช้คิดราคา" = ดันราคาแนะนำทุก Goal จริง (ไม่ต่ำกว่า ' + CAT.floorPct + '%)',
      fields: [
        { k: 'lo', label: 'ต่ำสุดที่ยอมรับ (%)', type: 'num', value: g.lo, hint: 'ต่ำกว่านี้ถือว่าหลุดเป้า' },
        { k: 'hi', label: 'เป้าสูงสุด (%)', type: 'num', value: g.hi, hint: 'ถ้าเป้าค่าเดียว ให้ใส่เท่ากับต่ำสุด' }
      ].concat(key === 'portfolio' ? [] : [{ k: 'target', label: 'เป้าที่ใช้คิดราคา (%)', type: 'num', value: g.target,
        hint: 'ราคาแนะนำทุก Goal ห้ามต่ำกว่านี้ · ต่ำกว่า ' + CAT.floorPct + '% ระบบใช้ ' + CAT.floorPct + '% แทน' }]),
      okText: 'บันทึกเป้า',
      onOk: function (v, close) {
        return PX.post('/api/category-targets', { key: key, lo: Number(v.lo), hi: Number(v.hi), target: v.target != null ? Number(v.target) : undefined }, 'PUT')
          .then(function () { close(); PX.toast('บันทึกเป้า ' + esc(g.name) + ' แล้ว — ราคาแนะนำทุกหน้าคิดใหม่'); if (ON) ON(); });
      }
    });
  }
  /* สินค้าในหมวด: margin ตอนนี้ เทียบเป้าที่ใช้จริง · ย้ายหมวด / ตั้งเป้าเฉพาะตัว (หน้าละ 20 รายการ) */
  function items(key) {
    PX.get('/api/category-items?key=' + encodeURIComponent(key)).then(function (j) { IT = j; IPG = 0; CHANGED = false; OPEN = true; showItems(); })
      .catch(function (e) { PX.toast('เปิดรายการไม่ได้ — ' + esc(e.message), 'bad'); });
  }
  function itemsHtml() {
    var j = IT, pages = Math.max(1, Math.ceil(j.items.length / IPER)); if (IPG >= pages) IPG = 0;
    var page = j.items.slice(IPG * IPER, IPG * IPER + IPER);
    var opt = function (sel) { return j.categories.map(function (c) { return '<option value="' + esc(c.key) + '"' + (c.key === sel ? ' selected' : '') + '>' + esc(c.name) + ' (' + c.target + '%)</option>'; }).join(''); };
    return '<p class="hint">เรียงจากตัวที่ต่ำกว่าเป้ามากสุดก่อน · ราคา = ' + esc((j.items[0] || {}).priceBasis || 'ราคาร่าง') + ' · ' +
      'เป้าเฉพาะตัวเว้นว่าง = ใช้เป้าหมวด · ตั้งต่ำกว่า Floor หมวด ' + (j.catFloor || j.floorPct) + '% ไม่ได้ ระบบใช้ ' + (j.catFloor || j.floorPct) + '%</p>' +
      '<div class="sc"><table class="g" style="min-width:680px"><thead><tr><th>สินค้า</th><th class="rt">ทุน</th><th class="rt">ราคา</th>' +
      '<th class="rt">margin</th><th class="rt">เป้าที่ใช้</th><th>หมวด</th><th>เป้าเฉพาะตัว (%)</th><th></th></tr></thead><tbody>' +
      (page.length ? page.map(function (x) {
        var low = x.margin != null && x.margin < x.effective;
        return '<tr><td><b>' + esc(x.name) + '</b><div class="rnote">' + esc(x.grp) + (x.moved ? ' · ย้ายหมวดเอง' : '') + '</div></td>' +
          '<td class="rt">' + (x.cost || '—') + '</td><td class="rt">' + (x.price || '—') + '</td>' +
          '<td class="rt" style="color:' + (low ? 'var(--red)' : 'var(--green)') + '"><b>' + (x.margin == null ? '—' : x.margin + '%') + '</b></td>' +
          '<td class="rt"><b>' + x.effective + '%</b>' + (x.itemTarget ? '<div class="rnote">' + (x.target < x.floor ? 'ตั้งไว้ ' + x.target + '% → ใช้ Floor หมวด ' + x.floor + '%' : 'เฉพาะตัว (หมวด ' + x.catTarget + '%)') + '</div>' : '') + '</td>' +
          '<td><select class="cmk" data-p="' + esc(x.id) + '">' + opt(j.key) + '</select></td>' +
          '<td><input class="cmt" data-p="' + esc(x.id) + '" inputmode="decimal" style="width:70px" value="' + (x.itemTarget ? x.target : '') + '" placeholder="' + x.catTarget + '"></td>' +
          '<td style="white-space:nowrap"><button class="btn" style="padding:4px 10px;font-size:11px" onclick="CatMargin.saveItem(' + jsq(x.id) + ')">บันทึก</button>' +
          ((x.moved || x.itemTarget) ? ' <button class="lnk3" onclick="CatMargin.resetItem(' + jsq(x.id) + ')">คืนค่าเดิม</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="8" style="color:var(--tx-3)">ไม่มีสินค้าในหมวดนี้</td></tr>') + '</tbody></table></div>' +
      (pages > 1 ? '<div class="pgb"><span>หน้า ' + (IPG + 1) + '/' + pages + ' · ' + j.items.length + ' รายการ</span><span class="sp2">' +
        PX.pageNums(IPG, pages).map(function (i) { return i < 0 ? '<span style="padding:0 4px;color:var(--tx-3)">…</span>'
          : '<button class="' + (i === IPG ? 'on' : '') + '" onclick="CatMargin.itemPage(' + i + ')">' + (i + 1) + '</button>'; }).join('') + '</span></div>' : '');
  }
  var MD = null;
  function showItems() {
    MD = PX.modal({ title: 'สินค้าในหมวด · ' + IT.name, sub: IT.items.length + ' รายการ · ย้ายหมวด หรือตั้งเป้าเฉพาะตัวได้ทีละรายการ',
      html: '<div id="cmItems">' + itemsHtml() + '</div>', okText: 'ปิด', onOk: function (v, close) { close(); },
      /* รีวิว Codex 30 ก.ย.: เดิมรีเฟรชหน้าแม่เฉพาะปุ่ม "ปิด" — ปิดด้วย X/ยกเลิก หลังบันทึกไปแล้ว = หน้าแม่ค้างตัวเลขเก่า */
      onClose: function () { OPEN = false; if (CHANGED) { CHANGED = false; if (ON) ON(); } } });
  }
  function redraw() { var el = document.getElementById('cmItems'); if (el) el.innerHTML = itemsHtml(); }
  function itemPage(i) { IPG = i; redraw(); }
  function send(pid, key, target) {
    return PX.post('/api/sku-category', { product_id: pid, category_key: key, target_pct: target })
      .then(function (r) {
        /* ปิดหน้าต่างไปก่อนที่บันทึกจะเสร็จ (VERIFY6) = onClose ผ่านไปแล้ว → แจ้งหน้าแม่ตอนนี้เลย */
        if (OPEN) CHANGED = true; else if (ON) ON();
        PX.toast('บันทึกแล้ว — เป้าที่ใช้ ' + r.effective + '%');
        return PX.get('/api/category-items?key=' + encodeURIComponent(IT.key)).then(function (j) { IT = j; redraw(); });
      }).catch(function (e) { PX.toast('บันทึกไม่ได้ — ' + esc(e.message), 'bad'); });
  }
  function saveItem(pid) {
    var sel = document.querySelector('.cmk[data-p="' + pid + '"]'), inp = document.querySelector('.cmt[data-p="' + pid + '"]');
    var t = inp && String(inp.value).trim() !== '' ? Number(inp.value) : null;
    if (t != null && !(isFinite(t) && t >= 0 && t <= 90)) { PX.toast('เป้าต้องอยู่ระหว่าง 0–90%', 'bad'); return; }
    return send(pid, sel ? sel.value : '', t);
  }
  function resetItem(pid) { return send(pid, '', null); }
  return { html: html, editTarget: editTarget, items: items, itemPage: itemPage, saveItem: saveItem, resetItem: resetItem };
})();
