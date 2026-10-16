/* ══ AI Pricing Performance — บล็อกบนสุดของหน้าตั้งราคา
   ตอบ 4 คำถามใน 1 แถว: ประหยัดเวลาได้เท่าไร · ทุนเข้าเองกี่ % · AI เตรียมราคาให้กี่ SKU (คนต้องตัดสินเองกี่รายการ) · ราคาตลาดดึงเองได้กี่ SKU
   ข้อมูลจาก /api/ai-perf (นับจากของจริงในระบบ) · ตัวเลข "เวลา" แยก 2 แบบชัด: วัดจริง (ops-perf) กับ ประมาณการ (จำนวนงาน × นาที/ชิ้น ตามสมมติฐานที่ประกาศไว้)
   ไม่มีทุน/margin ใน payload นี้ → ไม่หลุดให้เซลล์ แต่ API ยังกันที่ ops ขึ้นไป */
window.AIPerf = (function () {
  var esc = PX.esc, DATA = null, AT = 0, LOADING = false, BLUE = '#2563EB', AMBER = '#D97706', GREEN = '#16A34A', GREY = '#CBD5E1';
  var CSS = '<style id="apCss">' +
    '.ap{margin:14px 0 6px}.ap .aph{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 8px}.ap .aph b{font-size:15px}.ap .aph span{font-size:12px;color:var(--tx-3)}.ap .aph .apl{margin-left:auto;font-size:12px;color:var(--tx-2);background:var(--card);border:1px solid var(--line);border-radius:99px;padding:3px 10px}.ap .aph .apl b{font-size:12px;color:var(--blue)}' +
    '.ap .apg{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}' +
    '.ap .ac{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:15px 17px 13px;display:flex;flex-direction:column;min-height:172px;min-width:0;box-shadow:0 1px 2px rgba(15,23,42,.03);text-align:left;font:inherit;color:inherit;cursor:pointer;transition:box-shadow .15s}.ap .ac:hover{box-shadow:0 4px 14px rgba(15,23,42,.08)}' +
    '.ap .ac .ah{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--tx-2);gap:8px}.ap .ac .ah span{display:flex;align-items:center;gap:5px;min-width:0}.ap .ac .ah .why{font-style:normal;color:var(--tx-3);font-size:12px}.ap .ac .ah em{font-style:normal;color:var(--blue);font-size:14px;line-height:1;flex:none}' +
    '.ap .ac .av{display:flex;align-items:baseline;gap:7px;margin:6px 0 4px;flex-wrap:wrap}.ap .ac .av b{font-family:var(--fn);font-size:32px;font-weight:700;letter-spacing:-.04em;line-height:1.05}.ap .ac .av small{font-size:13px;color:var(--tx-3);font-weight:600}.ap .ac .av .ad{font-size:12px;font-weight:700}.ap .ac .ad.up{color:var(--green)}.ap .ac .ad.dn{color:var(--red)}.ap .ac .ad.fl{color:var(--tx-3)}' +
    '.ap .ac .as{font-size:11px;color:var(--tx-3);margin-top:auto;padding-top:8px;line-height:1.45}' +
    '.ap .ac.lead{background:var(--blue);color:#fff;border-color:var(--blue)}.ap .ac.lead .ah,.ap .ac.lead .as,.ap .ac.lead .av small,.ap .ac.lead .why{color:rgba(255,255,255,.82)}.ap .ac.lead .ah em{color:#fff}.ap .ac.lead .ad.up{color:#BBF7D0}.ap .ac.lead .ad.fl{color:rgba(255,255,255,.75)}' +
    /* แท่งนอน 3 บรรทัด (เวลา) */
    '.ap .tb{display:grid;gap:5px;margin-top:4px}.ap .tb div{display:grid;grid-template-columns:92px 1fr 54px;align-items:center;gap:8px;font-size:11px}.ap .tb div em{font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ap .tb div i{display:block;height:8px;border-radius:99px;background:rgba(255,255,255,.22);overflow:hidden}.ap .tb div i b{display:block;height:100%;background:#fff;border-radius:99px}.ap .tb div small{text-align:right;font-weight:700;font-size:11px;color:#fff}' +
    /* แท่งตั้ง batch */
    '.ap .bb{display:flex;align-items:flex-end;gap:6px;height:62px;margin-top:4px}.ap .bb div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;height:100%;min-width:0}.ap .bb div span{display:flex;flex-direction:column-reverse;height:46px;border-radius:5px;overflow:hidden;background:var(--line-2)}.ap .bb div span i{display:block;width:100%}.ap .bb div em{font-style:normal;font-size:9.5px;color:var(--tx-3);text-align:center;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    /* ชิป */
    '.ap .ch{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.ap .ch span{font-size:11px;padding:3px 8px;border-radius:99px;background:var(--line-2);color:var(--tx-2);white-space:nowrap}.ap .ch span b{font-family:var(--fn);margin-left:3px}.ap .ch span.g{background:var(--green-l);color:var(--green)}.ap .ch span.a{background:var(--amber-l);color:var(--amber)}.ap .ch span.r{background:var(--red-l);color:var(--red)}.ap .ch span.b{background:var(--blue-l);color:var(--blue)}' +
    /* แท่งแบ่งส่วน (ตลาด) */
    '.ap .sg{display:flex;height:10px;border-radius:99px;overflow:hidden;background:var(--line-2);margin-top:10px;gap:2px}.ap .sg i{display:block;height:100%}.ap .lg{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:10.5px;color:var(--tx-3);margin-top:6px}.ap .lg span::before{content:"";display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;background:var(--c);vertical-align:-1px}' +
    '.ap .empty{font-size:11px;color:var(--tx-3);padding:10px 0 4px;line-height:1.45}.ap .empty b{color:var(--tx-2)}' +
    '@media(max-width:1100px){.ap .apg{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.ap .apg{grid-template-columns:1fr}.ap .ac .av b{font-size:26px}}</style>';
  function css() { if (!document.getElementById('apCss')) document.head.insertAdjacentHTML('beforeend', CSS); }
  function load(force) {
    if (DATA && !force && Date.now() - AT < 20000) return Promise.resolve(DATA);
    return PX.get('/api/ai-perf').then(function (j) { DATA = j; AT = Date.now(); return j; });
  }
  function hm(min) { if (min == null) return '—'; if (min < 60) return Math.round(min) + '<small>นาที</small>'; return (Math.round(min / 6) / 10).toFixed(1).replace(/\.0$/, '') + '<small>ชม.</small>'; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function card(o) {
    return '<button type="button" class="ac' + (o.lead ? ' lead' : '') + '" onclick="' + (o.go || '') + '" title="' + esc(o.title_attr || 'เปิดดู') + '"><div class="ah"><span>' + esc(o.title) + (o.why ? ' <i' + PX.why(o.why[0], o.why[1], o.why[2], o.why[3]) + '></i>' : '') + '</span><em>⤢</em></div>' +
      '<div class="av"><b>' + o.big + '</b>' + (o.unit ? '<small>' + o.unit + '</small>' : '') + (o.delta ? '<span class="ad ' + o.delta[0] + '">' + esc(o.delta[1]) + '</span>' : '') + '</div>' +
      (o.body || '') + '<div class="as">' + o.sub + '</div></button>';
  }
  function html() {
    css();
    if (!DATA) {
      if (!LOADING) { LOADING = true; load(true).then(function () { LOADING = false; fill(); }).catch(function () { LOADING = false; }); }
      return '<section class="ap" id="aiPerf"><div class="aph"><b>AI Pricing ช่วยได้แค่ไหน</b><span>กำลังอ่าน…</span></div></section>';
    }
    var d = DATA, P = d.pricing, C = d.cost, M = d.market, T = d.time, L = d.load, A = T.assumptions || {};
    /* 1 · เวลา — วัดจริงถ้ามี ไม่มีก็ประมาณการ (บอกชัดว่าแบบไหน) */
    var measured = T.savedMin != null, est = T.est || {}, u = T.units || {}, mx = Math.max(1, est.cost || 0, est.price || 0, est.market || 0);
    var trow = function (label, units, unit, min) { return '<div><em>' + label + '</em><i><b style="width:' + pct(min, mx) + '%"></b></i><small>' + (units ? Math.round(min) + ' นาที' : '—') + '</small></div>'; };
    var timeCard = card({ lead: true, title: measured ? 'เวลาที่ประหยัดได้ / สัปดาห์' : 'เวลาที่ระบบทำแทนคน / สัปดาห์', go: "location.href='/costs'",
      why: ['เวลาที่ประหยัด', measured ? 'นาทีที่วัดจริงก่อนมีระบบ − นาทีสัปดาห์นี้ (ops-perf ทุกขั้น)' : 'ประมาณการ = งานที่ระบบทำแทน × เวลาถ้าคนทำเอง: พิมพ์ทุน ' + (A.costRow || 0.5) * 60 + ' วิ/แถว · คิดราคา ' + (A.priceSku || 1.5) + ' นาที/SKU · เช็กราคาตลาด ' + (A.marketSku || 2) + ' นาที/SKU', 'cost_batches · ราคาแนะนำที่คำนวณได้ · market_obs 30 วัน · ops-perf', measured ? 'วัดจริง' : 'ประมาณการ — จะเปลี่ยนเป็นค่าวัดจริงเมื่อมีตัวเลขเวลาก่อนมีระบบ (บันทึกเวลาก่อนมีระบบได้ในหน้าผู้บริหาร)'],
      big: hm(measured ? T.savedMin : est.total), delta: measured ? ['up', 'วัดจริง · ก่อน ' + Math.round(T.before) + ' → ตอนนี้ ' + Math.round(T.now) + ' นาที'] : ['fl', 'ประมาณการ'],
      body: '<div class="tb">' + trow('ทุนจากไฟล์', u.cost, 'แถว', est.cost || 0) + trow('AI คิดราคา', u.price, 'SKU', est.price || 0) + trow('ตลาดดึงเอง', u.market, 'SKU', est.market || 0) + '</div>',
      sub: 'ระบบทำ ' + ((u.cost || 0) + (u.price || 0) + (u.market || 0)) + ' งาน · คนทำเอง ' + (L.human || 0) + ' งาน (' + (L.humanPct == null ? '—' : L.humanPct + '%') + ')' + (T.now != null ? ' · สัปดาห์นี้ใช้จริง ' + Math.round(T.now) + ' นาที' : '') });
    /* 2 · ทุนเข้าเอง */
    var S = C.series || [], costCard;
    if (C.batches) {
      costCard = card({ title: 'ทุนเข้าระบบเอง', go: "location.href='/costs#flags'",
        why: ['ทุนเข้าระบบเอง', 'แถวในไฟล์ AL ทุก batch ที่ระบบรับเข้า Cost Master เองหรือยืนยันว่าไม่เปลี่ยน ÷ แถวทั้งหมด · ที่เหลือคือส่งคนตรวจใน Review Queue', 'cost_batches · cost_flags · sku_aliases', 'นับจากไฟล์จริงที่อัปโหลด — ยิ่งสูง คนยิ่งไม่ต้องพิมพ์/ตรวจ'],
        big: C.autoPct == null ? '—' : C.autoPct, unit: '%', delta: C.pending ? ['dn', 'ค้างตรวจ ' + C.pending] : ['up', 'ไม่มีค้างตรวจ'],
        body: '<div class="bb">' + S.slice(-6).map(function (b) { var tot = Math.max(1, b.rows || 0), ok = (b.auto || 0) + (b.unchanged || 0); return '<div title="' + esc(b.id + ' · ผ่านเอง ' + ok + ' · ส่งตรวจ ' + (b.review || 0) + ' · ' + b.rows + ' แถว') + '"><span><i style="height:' + pct(ok, tot) + '%;background:' + BLUE + '"></i><i style="height:' + pct(b.review || 0, tot) + '%;background:' + AMBER + '"></i></span><em>' + esc(b.at) + '</em></div>'; }).join('') + '</div>',
        sub: 'คนตรวจแค่ <b>' + C.review + '</b> จาก ' + C.rows + ' แถว (' + C.batches + ' ไฟล์) · จำชื่อแล้ว ' + C.aliases + ' · ล่าสุด ' + esc(C.last ? C.last.at : '—') });
    } else {
      costCard = card({ title: 'ทุนเข้าระบบเอง', go: "location.href='/costs'",
        why: ['ทุนเข้าระบบเอง', 'แถวในไฟล์ AL ที่ระบบรับเข้า Cost Master เอง ÷ แถวทั้งหมด · ตอนนี้ยังไม่มีไฟล์รอบใหม่ จึงยังนับไม่ได้', 'cost_batches', 'จะมีตัวเลขทันทีที่อัปโหลดใบ AL รอบถัดไป'],
        big: C.fromFile, unit: '/' + C.total + ' SKU', delta: C.oldCost ? ['fl', 'ทุนเกิน 7 วัน ' + C.oldCost] : ['up', 'ทุนสดทั้งหมด'],
        body: '<div class="empty"><b>ยังไม่มีไฟล์ทุนรอบใหม่</b><br>ทุนที่ใช้อยู่ ' + C.fromFile + ' SKU อ่านจากใบ AL ล่าสุด · พิมพ์มือ ' + C.manual + '<br>อัปโหลดใบรอบถัดไป → ระบบรับเองและแจ้งเฉพาะที่ผิดปกติ</div>',
        sub: 'กดไปหน้ารับทุน → อัปโหลดใบ AL / วาง Excel' });
    }
    /* 3 · AI เตรียมราคา */
    var priceCard = card({ title: 'AI เตรียมราคาให้แล้ว', go: 'openBoard()',
      why: ['AI เตรียมราคาให้แล้ว', 'SKU ที่รู้ทุนและคำนวณ 4 ทางเลือก + ราคาแนะนำได้ ÷ SKU ทั้งหมด · "ยืนยันตามที่เสนอ" = ราคากลางที่คนกดยืนยันเท่าราคาแนะนำ · "คนแก้เอง" = ยืนยันคนละราคา · "ต้องตัดสินเอง" = ต่ำกว่า Floor / ทุนกระโดด >15% / นโยบายเปลี่ยน', 'pricing engine (ทุน × นโยบายกลุ่ม × ตลาด) · central_prices', 'ยิ่ง "ยืนยันตามที่เสนอ" สูง แปลว่าราคาแนะนำใช้ได้จริง · ถ้า "คนแก้เอง" สูง ควรปรับนโยบาย/ตลาด'],
      big: P.ready, unit: '/' + P.total + ' SKU', delta: P.decide ? ['dn', 'ต้องตัดสินเอง ' + P.decide] : ['up', 'ไม่มีที่ต้องตัดสินเอง'],
      body: '<div class="ch">' + '<span class="g">ยืนยันตามที่เสนอ<b>' + P.accepted + '</b></span>' + '<span class="b">คนแก้เอง<b>' + P.edited + '</b></span>' + '<span class="' + (P.decide ? 'r' : '') + '">ต้องตัดสินเอง<b>' + P.decide + '</b></span>' + (P.waiting ? '<span class="a">รอทุน<b>' + P.waiting + '</b></span>' : '') + '</div>',
      sub: (P.approved ? 'ยืนยันแล้ว ' + P.approved + '/' + P.ready + ' · ' : 'ยังไม่ได้ยืนยันราคากลางรอบนี้ · ') + (P.noMarket ? 'ไม่มีราคาตลาดอ้างอิง ' + P.noMarket + ' (แนะนำจากทุน+นโยบาย)' : 'มีราคาตลาดครบ') });
    /* 4 · ตลาดดึงเอง */
    var seg = [[M.fresh, GREEN, 'สด <7 วัน'], [M.usable, BLUE, 'ใช้ได้ 7–30'], [M.stale, AMBER, 'เก่า >30'], [M.blind, GREY, 'ไม่มีข้อมูล']];
    var mktCard = card({ title: 'ราคาตลาดดึงให้เอง', go: "location.href='/costs?tab=sources'",
      why: ['ราคาตลาดดึงให้เอง', 'SKU ที่มีราคาตลาดจาก connector (ไม่ใช่คนสำรวจ) ใน 30 วัน ÷ SKU ทั้งหมด · แถบ = ความสดของข้อมูลตลาดทุก SKU', 'market_obs · sources · job ดึงราคาตลาด', M.onlineSku ? 'ยิ่งสูง คนยิ่งไม่ต้องไปดูหน้าร้าน' : 'ยังไม่มีแหล่งราคาตลาดต่ออยู่ — ตัวเลขจะขึ้นเมื่อต่อ connector หรือส่งผลสำรวจ'],
      big: M.onlineSku, unit: '/' + M.total + ' SKU', delta: M.online7 ? ['up', 'ดึง 7 วัน ' + M.online7 + ' ราคา'] : M.surveySku ? ['fl', 'สำรวจเอง ' + M.surveySku + ' SKU'] : ['dn', 'ยังไม่มีแหล่ง'],
      body: (M.known ? '<div class="sg">' + seg.map(function (s) { return s[0] ? '<i style="width:' + pct(s[0], M.total) + '%;background:' + s[1] + '" title="' + esc(s[2] + ' ' + s[0]) + '"></i>' : ''; }).join('') + '</div><div class="lg">' + seg.map(function (s) { return '<span style="--c:' + s[1] + '">' + s[2] + ' ' + s[0] + '</span>'; }).join('') + '</div>'
        : '<div class="empty"><b>ยังไม่มีราคาตลาดจริงในระบบ</b><br>แหล่งที่ตั้งไว้ ' + M.sources + ' · job ดึงราคา: ' + esc((M.job || {}).status === 'never' ? 'ยังไม่เคยรัน' : (M.job || {}).status || '—') + '<br>ต่อ connector หรือส่งผลสำรวจหน้าร้าน → ระบบจับคู่ SKU ให้เอง</div>'),
      sub: 'สำรวจหน้าร้าน 7 วัน ' + (M.survey7 || 0) + ' ราคา · ไม่มีข้อมูลเลย ' + M.blind + ' SKU' });
    return '<section class="ap" id="aiPerf"><div class="aph"><b>AI Pricing ช่วยได้แค่ไหน</b><span>รอบ ' + esc(d.round || '—') + ' · นับจากข้อมูลจริงในระบบ · กด ? ที่การ์ดเพื่อดูว่าคิดจากอะไร</span>' +
      '<span class="apl">ระบบทำ <b>' + (L.humanPct == null ? '—' : (100 - L.humanPct) + '%') + '</b> · คนตัดสินเอง ' + (L.human || 0) + ' งาน</span></div>' +
      '<div class="apg">' + timeCard + costCard + priceCard + mktCard + '</div></section>';
  }
  function fill() { var el = document.getElementById('aiPerf'); if (!el) return; el.outerHTML = html(); if (PX.bindTips) PX.bindTips(); }
  function refresh() { return load(true).then(fill).catch(function () {}); }
  return { html: html, load: load, fill: fill, refresh: refresh, data: function () { return DATA; } };
})();
