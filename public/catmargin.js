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
    var tot = pol.groups.reduce(function (a, g) { return a + g.n; }, 0), rev = pol.groups.reduce(function (a, g) { return a + (g.review || 0); }, 0), wait = pol.groups.reduce(function (a, g) { return a + (g.waiting || 0); }, 0);
    return '<div class="card catm" id="policyCard"><h3>Margin Policy รายกลุ่มสินค้า <span class="sub">Policy v' + pol.version + ' · ' + pol.groups.length + ' กลุ่ม · ' + tot + ' SKU' + (rev ? ' · <b style="color:var(--amber)">ต้องตรวจราคาใหม่ ' + rev + '</b>' : '') + (wait ? ' · <b style="color:var(--red)">รอทุน ' + wait + '</b>' : '') + '</span></h3>' +
      '<p class="hint"><b>Target</b> = margin ที่อยากได้ → Recommended Price = ทุน ÷ (1 − Target) · <b>Minimum</b> = ต่ำสุดที่ยอมรับ → Safety Floor = ทุน ÷ (1 − Minimum) · ต่ำกว่า Minimum ต้องมีเหตุผล/อนุมัติ · ' +
      'แก้ค่ากลุ่มไหน ระบบคิดใหม่ทุก SKU ในกลุ่มทันทีและขึ้น "Pricing Policy Changed" ให้คนตรวจ · ค่าเริ่มต้นถอดจากใบราคา AL (median ของกลุ่ม) — <b>ค่าจริงต้องให้ Freshour ยืนยัน</b></p>' +
      '<div class="sc"><table class="g" style="min-width:760px"><thead><tr><th>กลุ่มสินค้า</th><th class="rt">Target</th><th class="rt">Minimum</th><th class="rt">margin ตอนนี้</th><th>สถานะ</th><th>SKU ตามสถานะ</th><th>ที่มา</th><th></th></tr></thead><tbody>' +
      pol.groups.map(function (g) {
        var t = TONE[g.state] || TONE.unknown, st = g.states || {};
        return '<tr><td><b>' + esc(g.grp) + '</b><div class="rnote">' + g.n + ' SKU · รู้ทุน ' + g.withCost + (g.review ? ' · <span style="color:var(--amber)">ตรวจราคาใหม่ ' + g.review + '</span>' : '') + (g.waiting ? ' · <span style="color:var(--red)">รอทุน ' + g.waiting + '</span>' : '') + '</div></td>' +
          '<td class="rt"><b>' + g.target + '%</b></td><td class="rt"><b>' + g.min + '%</b></td>' +
          '<td class="rt"><b>' + (g.margin == null ? '—' : g.margin + '%') + '</b></td>' +
          '<td><span class="pill2 ' + t[0] + '">' + t[1] + '</span></td>' +
          '<td style="font-size:11px;color:var(--tx-2)">' + (st.healthy ? '<span style="color:var(--green)">สูงกว่าเป้า ' + st.healthy + '</span> · ' : '') + (st.on_target ? 'ตรงเป้า ' + st.on_target + ' · ' : '') + (st.below_target ? '<span style="color:var(--amber)">ต่ำกว่าเป้า ' + st.below_target + '</span> · ' : '') + (st.below_min ? '<span style="color:var(--red)">ต่ำกว่าขั้นต่ำ ' + st.below_min + '</span>' : '') + '</td>' +
          '<td style="font-size:11px;color:var(--tx-3)">' + esc(g.source || '') + (g.updated_by && g.updated_by !== 'system' ? ' · ' + esc(g.updated_by) + ' ' + esc(String(g.updated_at || '').slice(0, 10)) : '') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn" style="padding:4px 10px;font-size:11px" onclick="CatMargin.edit(' + jsq(g.grp) + ')">แก้เป้า</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (pol.log && pol.log.length ? '<p class="rnote" style="margin-top:8px"><a href="#" class="lnk2" onclick="CatMargin.toggleLog();return false">ประวัติการแก้นโยบาย ' + pol.log.length + ' ครั้ง ' + (OPEN_LOG ? '▴' : '▾') + '</a>' +
        (OPEN_LOG ? '<br>' + pol.log.map(function (l) { return 'v' + l.v + ' · ' + esc(l.at) + ' · ' + esc(l.grp) + ' target ' + l.from.target + '→' + l.to.target + '% · min ' + l.from.min + '→' + l.to.min + '% · ' + esc(l.by) + (l.reason ? ' · ' + esc(l.reason) : ''); }).join('<br>') : '') + '</p>' : '') +
      '</div>';
  }
  function toggleLog() { OPEN_LOG = !OPEN_LOG; if (ON) ON(); }
  function edit(grp) {
    var g = (POL.groups || []).filter(function (x) { return x.grp === grp; })[0]; if (!g) return;
    PX.modal({ title: 'Margin Policy · ' + grp, sub: g.n + ' SKU · margin ตอนนี้ ' + (g.margin == null ? '—' : g.margin + '%') + ' · แก้แล้วทุก SKU ในกลุ่มถูกคิดใหม่และต้องตรวจราคาอีกครั้ง',
      fields: [{ k: 'target', label: 'Target margin % (ที่อยากได้ — ใช้คิด Recommended)', type: 'num', value: g.target }, { k: 'min', label: 'Minimum margin % (ต่ำสุดที่ยอมรับ — Guard Rail)', type: 'num', value: g.min }, { k: 'reason', label: 'เหตุผล (ลง log นโยบาย)', value: '' }],
      okText: 'บันทึกนโยบาย', onOk: function (v, close) {
        var t = Number(v.target), m = Number(v.min);
        if (!(m >= 0 && t >= m && t < 90)) { PX.toast('Target ต้องไม่ต่ำกว่า Minimum และอยู่ระหว่าง 0–90%', 'bad'); return false; }
        return PX.post('/api/policy', { grp: grp, target: t, min: m, reason: v.reason }).then(function (r) { close(); PX.toast('Policy v' + r.version + ' · ' + esc(grp) + ' → Target ' + t + '% / Min ' + m + '% · คิดใหม่ ' + r.changed + ' SKU'); if (ON) ON(); }).catch(function (e) { PX.toast('ไม่สำเร็จ — ' + esc(e.message), 'bad'); return false; });
      } });
  }
  /* หน้าที่ใช้: โหลดเอง */
  function load() { return PX.get('/api/policy'); }
  return { html: html, edit: edit, toggleLog: toggleLog, load: load };
})();
