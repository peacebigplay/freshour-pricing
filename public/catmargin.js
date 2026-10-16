/* ══ Pricing Policy รายกลุ่มสินค้า — Target margin (ที่อยากได้ · ใช้คิด Recommended) แยกจาก Minimum margin (ต่ำสุดที่ยอมรับ · Guard Rail)
   ชิ้นเดียวใช้ร่วมหน้า "ตั้งราคา" และ "Margin Guard" · ข้อมูลจาก /api/policy · แก้ผ่าน POST /api/policy
   แก้ค่ากลุ่มใด → ทุก SKU ในกลุ่มถูก mark "Pricing Policy Changed" และคิด Target/Minimum ใหม่ทั้งกลุ่ม ไม่ต้องแก้ทีละสินค้า
   ค่าเริ่มต้นถอดจากใบราคา AL ล่าสุด (median margin ของกลุ่ม) — ค่าจริงต้องมาจาก Freshour */
window.CatMargin = (function () {
  var esc = PX.esc;
  var jsq = function (v) { return JSON.stringify(String(v == null ? '' : v)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var POL = null, ON = null, OPEN_LOG = false;
  var TONE = { below_min: ['r', 'ต่ำกว่าขั้นต่ำ'], below_target: ['a', 'ต่ำกว่าเป้า'], on_target: ['g', 'ตรงเป้า'], healthy: ['g', 'สูงกว่าเป้า'], unknown: ['n', 'ไม่มีข้อมูล'] };
  function html(pol, onChange) {
    POL = pol; ON = onChange || null;
    if (!pol || !pol.groups) return '';
    var lo = Math.min.apply(null, pol.groups.map(function (g) { return g.min; })), tlo = Math.min.apply(null, pol.groups.map(function (g) { return g.target; })), thi = Math.max.apply(null, pol.groups.map(function (g) { return g.target; }));
    return '<div class="card catm" id="policyCard"><h3>เป้า margin รายกลุ่มสินค้า <span class="sub">Floor ต่ำสุด ' + lo + '% · Target ' + tlo + '–' + thi + '% · Policy v' + pol.version + '</span></h3>' +
      '<p class="hint">Floor = ต่ำสุดที่ยอมรับ (ป้องกันกำไร = ทุน ÷ (1 − Floor)) · Target = ที่อยากได้ (กำไรตามเป้า = ทุน ÷ (1 − Target)) · แก้กลุ่มไหน ทุก SKU ในกลุ่มคิดใหม่ทันที · ค่าเริ่มต้นถอดจากใบ AL รอ Freshour ยืนยัน</p>' +
      '<div class="sc"><table class="g" style="min-width:680px"><thead><tr><th>กลุ่มสินค้า</th><th class="rt">Floor%</th><th class="rt">Target%</th><th class="rt">ตอนนี้</th><th>สถานะ</th><th>ที่มาของตัวเลข</th><th></th></tr></thead><tbody>' +
      pol.groups.map(function (g) {
        var t = TONE[g.state] || TONE.unknown, human = g.updated_by && g.updated_by !== 'system';
        return '<tr><td><b>' + esc(g.grp) + '</b><div class="rnote">' + g.n + ' SKU' + (g.review ? ' · <span style="color:var(--amber)">ตรวจราคาใหม่ ' + g.review + '</span>' : '') + (g.waiting ? ' · <span style="color:var(--red)">รอทุน ' + g.waiting + '</span>' : '') + '</div></td>' +
          '<td class="rt"><b>' + g.min + '%</b></td><td class="rt"><b>' + g.target + '%</b></td>' +
          '<td class="rt"><b>' + (g.margin == null ? '—' : g.margin + '%') + '</b></td>' +
          '<td><span class="pill2 ' + t[0] + '">' + t[1] + '</span></td>' +
          '<td style="font-size:11px;color:var(--tx-3)">' + (g.margin == null ? 'ไม่มีรายการที่รู้ทุน' : 'ถ่วงปริมาณขาย · รู้ทุน ' + g.withCost + '/' + g.n + ' รายการ') + (human ? ' · แก้โดย ' + esc(g.updated_by) + ' ' + esc(String(g.updated_at || '').slice(0, 10)) : ' · จากใบ AL') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn" style="padding:4px 10px;font-size:11px" onclick="CatMargin.edit(' + jsq(g.grp) + ')">แก้เป้า</button> <button class="btn" style="padding:4px 10px;font-size:11px" onclick="CatMargin.items(' + jsq(g.grp) + ')">สินค้า ' + g.n + ' →</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (pol.log && pol.log.length ? '<p class="rnote" style="margin-top:8px"><a href="#" class="lnk2" onclick="CatMargin.toggleLog();return false">ประวัติการแก้เป้า ' + pol.log.length + ' ครั้ง ' + (OPEN_LOG ? '▴' : '▾') + '</a>' +
        (OPEN_LOG ? '<br>' + pol.log.map(function (l) { return 'v' + l.v + ' · ' + esc(l.at) + ' · ' + esc(l.grp) + ' Floor ' + l.from.min + '→' + l.to.min + '% · Target ' + l.from.target + '→' + l.to.target + '% · ' + esc(l.by) + (l.reason ? ' · ' + esc(l.reason) : ''); }).join('<br>') : '') + '</p>' : '') +
      '</div>';
  }
  /* "สินค้า N →" = เปิดตั้งราคากลาง กรองกลุ่มนั้น */
  function items(grp) { if (typeof window.openBoard === 'function') { window.G = grp; window.PAGE = 0; window.openBoard(); } else location.href = '/pricing'; }
  function toggleLog() { OPEN_LOG = !OPEN_LOG; if (ON) ON(); }
  function edit(grp) {
    var g = (POL.groups || []).filter(function (x) { return x.grp === grp; })[0]; if (!g) return;
    PX.modal({ title: 'Margin Policy · ' + grp, sub: g.n + ' SKU · margin ตอนนี้ ' + (g.margin == null ? '—' : g.margin + '%') + ' · แก้แล้วทุก SKU ในกลุ่มถูกคิดใหม่และต้องตรวจราคาอีกครั้ง',
      fields: [{ k: 'min', label: 'Floor % (ต่ำสุดที่ยอมรับ — ป้องกันกำไร = ทุน ÷ (1 − Floor))', type: 'num', value: g.min }, { k: 'target', label: 'Target % (ที่อยากได้ — กำไรตามเป้า = ทุน ÷ (1 − Target))', type: 'num', value: g.target }, { k: 'reason', label: 'เหตุผล (ลง log นโยบาย)', value: '' }],
      okText: 'บันทึกนโยบาย', onOk: function (v, close) {
        var t = Number(v.target), m = Number(v.min);
        if (!(m >= 0 && t >= m && t < 90)) { PX.toast('Target ต้องไม่ต่ำกว่า Floor และอยู่ระหว่าง 0–90%', 'bad'); return false; }
        return PX.post('/api/policy', { grp: grp, target: t, min: m, reason: v.reason }).then(function (r) { close(); PX.toast('Policy v' + r.version + ' · ' + esc(grp) + ' → Target ' + t + '% / Min ' + m + '% · คิดใหม่ ' + r.changed + ' SKU'); if (ON) ON(); }).catch(function (e) { PX.toast('ไม่สำเร็จ — ' + esc(e.message), 'bad'); return false; });
      } });
  }
  /* หน้าที่ใช้: โหลดเอง */
  function load() { return PX.get('/api/policy'); }
  return { html: html, edit: edit, items: items, toggleLog: toggleLog, load: load };
})();
