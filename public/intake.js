/* ══════════════════════════════════════════════════════════════════
   Intake — หน้า รับทุน & ตลาด: mini dashboard ของระบบ + แท็บ "แหล่งข้อมูล & สำรวจ"
   · Perf strip   ระบบช่วยรับทุน/อ่านตลาดได้แค่ไหน (อัตโนมัติกี่ % · จับคู่ชื่อได้กี่ % · ด่านจับทุนแปลกแม่นกี่ % · ตลาดสดกี่ SKU · เตือนถูกกี่ %)
   · แหล่งข้อมูล   โรงงาน (ไฟล์ PDF/Excel/CSV อัปโหลด · กล่องรับอัตโนมัติ · LINE) · ตลาดออนไลน์ (connector ต่อแหล่ง) · ดึงไม่ได้ → โหมดสำรวจหน้าร้าน
   · สำรวจหน้าร้าน แผนรายสัปดาห์ต่อร้าน (SKU ที่ควรไปดู) · บันทึกได้ 3 ทาง: พิมพ์ · พูด (Web Speech) · ถ่ายรูปป้าย — ระบบจับคู่ SKU ให้เอง
   ══════════════════════════════════════════════════════════════════ */
window.Intake = (function () {
  var esc = PX.esc, money = PX.money, ago = PX.ago, PERF = null, SRC = null, PLAN = null, DASH = null, AT = 0;
  var CSS = '<style id="inCss">' +
    '.kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 12px}.kpi.k3{grid-template-columns:repeat(3,minmax(0,1fr))}' +
    '.kc{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px 18px 14px;display:flex;flex-direction:column;min-height:168px;min-width:0;box-shadow:0 1px 2px rgba(15,23,42,.03)}.kc.warn{border-color:var(--amber-b,#FDE68A)}' +
    '.kc .kh{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--tx-2);gap:8px}.kc .kh span{display:flex;align-items:center;gap:5px;min-width:0}.kc .why{font-style:normal;color:var(--tx-3);cursor:help;font-size:12px}.kc .kx{color:var(--blue);text-decoration:none;font-size:14px;line-height:1;flex:none}' +
    '.kc .kv{display:flex;align-items:baseline;gap:8px;margin:6px 0 4px;flex-wrap:wrap}.kc .kv b{font-family:var(--fn);font-size:32px;font-weight:700;letter-spacing:-.04em;line-height:1.05}.kc .kv small{font-size:13px;color:var(--tx-3);font-weight:600}.kc .kd{font-size:12px;font-weight:700}.kc .kd.up{color:var(--green)}.kc .kd.dn{color:var(--red)}.kc .kd.fl{color:var(--tx-3)}' +
    '.kc .ks{font-size:11px;color:var(--tx-3);margin-top:auto;padding-top:8px;line-height:1.45}' +
    '.kc.lead{background:var(--blue);color:#fff;border-color:var(--blue)}.kc.lead .kh,.kc.lead .ks,.kc.lead .kv small,.kc.lead .why{color:rgba(255,255,255,.8)}.kc.lead .kx{color:#fff}.kc.lead .kd.up{color:#BBF7D0}.kc.lead .kd.dn{color:#FECACA}.kc.lead .kd.fl{color:rgba(255,255,255,.7)}.kc.lead svg text{fill:#fff!important}.kc.lead svg circle{stroke:rgba(255,255,255,.2)}.kc.lead .leg{color:#fff}.kc.lead .mb em{color:rgba(255,255,255,.6)}' +
    '.mb{display:flex;align-items:flex-end;gap:4px;margin:6px 0 0}.mbc{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px}.mbs{width:100%;max-width:26px;display:flex;flex-direction:column-reverse;justify-content:flex-start;background:var(--bg,#F3F5F9);border-radius:6px;overflow:hidden}.kc.lead .mbs{background:rgba(255,255,255,.14)}.mbs i{display:block;width:100%;min-height:2px}.mbs i:first-child{border-radius:0 0 4px 4px}.mbs i:last-child{border-radius:4px 4px 0 0}.mbc em{font-style:normal;font-size:9.5px;color:var(--tx-3);font-family:var(--fn)}' +
    '.chips{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.chip{position:relative;display:flex;justify-content:space-between;gap:6px;padding:6px 8px;border-radius:8px;background:var(--bg,#F3F5F9);font-size:11px;overflow:hidden}.chip:before{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--p);background:rgba(15,23,42,.06)}.chip.on:before{background:rgba(0,82,243,.14)}.chip em,.chip b{position:relative;font-style:normal}.chip b{font-family:var(--fn)}' +
    '.rank{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:5px;font-size:12px}.rank li{display:flex;justify-content:space-between;gap:8px}.rank li b{font-family:var(--fn);color:var(--amber)}' +
    '.tbar{display:flex;flex-direction:column;gap:5px;margin-top:8px;font-size:11px}.tbar span{display:flex;flex-direction:column;gap:2px}.tbar em{font-style:normal;color:var(--tx-3)}.tbar b{display:block;padding:3px 8px;border-radius:6px;color:#fff;font-family:var(--fn);font-weight:600;white-space:nowrap;min-width:52px}.tbar .t0{background:#94A3B8}.tbar .t1{background:var(--green)}' +
    '.lead2{display:flex;align-items:center}.lead2 .ch{gap:10px}.lead2 .leg{font-size:10.5px}' +
    '.goals{display:flex;gap:10px;justify-content:space-around;margin-top:6px}.gcol{display:flex;flex-direction:column;align-items:center;gap:3px;flex:1}.gchk{height:16px;font-size:12px;color:var(--green);font-weight:700}.gbar{width:22px;height:74px;border-radius:99px;background:var(--bg,#F3F5F9);display:flex;flex-direction:column-reverse;overflow:hidden}.gbar i{display:block;background:#CBD5E1;border-radius:99px}.gbar i.part{background:var(--blue)}.gbar i.ok{background:var(--green)}.gcol em{font-style:normal;font-size:10.5px;color:var(--tx-2);font-weight:600;white-space:nowrap}.gcol small{font-size:10px;color:var(--tx-3);font-family:var(--fn)}' +
    '.sp{margin-top:6px}.sp svg{width:100%;height:44px}.spx{display:flex;justify-content:space-between;font-size:9.5px;color:var(--tx-3);font-family:var(--fn)}' +
    '.perf-hd{display:flex;align-items:baseline;gap:8px;margin:0 0 6px}.perf-hd b{font-size:12px}.perf-hd span{font-size:11px;color:var(--tx-3)}' +
    '.ctabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin:4px 0 14px;overflow-x:auto;position:sticky;top:0;z-index:5;background:var(--bg)}.ctabs button{font-family:var(--ff);flex:0 0 auto;border:0;background:none;padding:11px 18px 9px;border-bottom:3px solid transparent;margin-bottom:-1px;cursor:pointer;font-size:14px;font-weight:600;color:var(--tx-3)}.ctabs button:hover{color:var(--ink)}.ctabs button.on{color:var(--blue);border-bottom-color:var(--blue)}.ctabs button em{font-style:normal;font-size:10.5px;color:var(--tx-3);margin-left:6px;font-weight:500}' +
    '.src3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.srcc{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:#fff;border-top:4px solid var(--line)}.srcc.on{border-top-color:var(--green)}.srcc.off{border-top-color:var(--amber)}.srcc.bad{border-top-color:var(--red)}.srcc h4{margin:0 0 2px;font-size:13.5px;display:flex;gap:8px;align-items:center}.srcc h4 .pill2{margin-left:auto}.srcc p{margin:0 0 8px;font-size:11.5px;color:var(--tx-2);line-height:1.5}.srcc .act{display:flex;gap:6px;flex-wrap:wrap}.srcc .act button,.srcc .act label{font-family:var(--ff);font-size:11.5px;padding:5px 10px;border-radius:9px;border:1px solid var(--line);background:#fff;cursor:pointer}.srcc .act .pri{background:var(--ink);color:#fff;border-color:var(--ink)}' +
    '.plan{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:10px}.plan>div{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:#fff}.plan h4{margin:0;font-size:13.5px;display:flex;gap:8px;align-items:center}.plan .prog{height:6px;border-radius:99px;background:var(--line-2);margin:8px 0;overflow:hidden}.plan .prog i{display:block;height:100%;background:var(--green)}' +
    '.plan ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;max-height:190px;overflow:auto}.plan li{display:flex;gap:8px;font-size:12px;align-items:center}.plan li small{color:var(--tx-3);margin-left:auto;white-space:nowrap}.plan li.done{color:var(--tx-3);text-decoration:line-through}' +
    '.sv-modes{display:flex;gap:6px;margin:0 0 8px}.sv-modes button{font-family:var(--ff);flex:1;padding:9px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:12.5px}.sv-modes button.on{background:var(--blue-l);border-color:var(--blue-b);color:var(--blue);font-weight:600}' +
    '.sv-rows{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:260px;overflow:auto}.sv-rows>div{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:6px 10px;border:1px solid var(--line);border-radius:10px;font-size:12.5px;background:#fff}.sv-rows>div.bad{border-color:var(--red-b);background:var(--red-l)}.sv-rows>div.warn{border-color:var(--amber-b);background:var(--amber-l)}.sv-rows small{display:block;color:var(--tx-3);font-size:10.5px}.sv-rows select{font-family:var(--ff);font-size:11.5px;max-width:190px}' +
    '.sv-rec{display:inline-flex;align-items:center;gap:6px}.sv-rec i{width:9px;height:9px;border-radius:50%;background:var(--red);display:inline-block;animation:blink 1s infinite}@keyframes blink{50%{opacity:.2}}' +
    '.inbox{font-size:11.5px;color:var(--tx-2);margin-top:8px}.inbox div{display:flex;gap:8px;padding:3px 0;border-bottom:1px dashed var(--line)}.inbox div span:last-child{margin-left:auto;color:var(--tx-3);white-space:nowrap}' +
    '@media(max-width:1100px){.kpi,.kpi.k3{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.kpi,.kpi.k3{grid-template-columns:1fr}.kc .kv b{font-size:26px}.ctabs button{padding:9px 12px 8px;font-size:13px}}</style>';
  function css() { if (!document.getElementById('inCss')) document.head.insertAdjacentHTML('beforeend', CSS); }
  function load(force) {
    if (PERF && !force && Date.now() - AT < 15000) return Promise.resolve();
    return Promise.all([PX.get('/api/intake-perf').then(function (j) { PERF = j; }), PX.get('/api/survey').then(function (j) { PLAN = j; }), PX.get('/api/sources').then(function (j) { SRC = j; }), PX.get('/api/dashboard').then(function (j) { DASH = j; }).catch(function () {}), window.Trend ? Trend.load().catch(function () {}) : null]).then(function () { AT = Date.now(); css(); });
  }
  var LOADING = false;
  var pc = function (v, good, warn) { return v == null ? '' : v >= good ? 'g' : v >= warn ? 'a' : 'r'; };
  /* ── mini dashboard "ระบบช่วยได้แค่ไหน" (บนสุด ทุกแท็บ) — การ์ดแบบเรฟ: เลขใหญ่ + เทียบรอบก่อน + กราฟเล็ก · ทุกการ์ดมี ⓘ บอกว่าคำนวณจากอะไร ── */
  var WHY = {
    auto: 'ทุนเข้าอัตโนมัติ|นับทุกครั้งที่ Cost Master เปลี่ยนใน 30 วัน แยกช่องทาง: ไฟล์ AL / กล่องรับ / LINE / ตรวจใน Review Queue แล้วใช้ = ระบบทำ · พิมพ์มือ / ปรับทุกตัว = คนทำ → % = ระบบทำ ÷ ทั้งหมด · แท่ง = Batch ล่าสุด (น้ำเงิน Auto Pass · ส้ม ส่ง Review)|cost_entries · cost_batches|ยิ่งสูง คนยิ่งพิมพ์น้อย — ถ้าต่ำแปลว่าไฟล์ AL ไม่เข้าหรือคนยังกรอกเอง',
    match: 'จับคู่ชื่อจากไฟล์ได้|ชื่อในไฟล์ทุกบรรทัดจากทุก Batch: ตรงเป๊ะ/ล้างชื่อตรง · จำได้ (alias ที่คนเคยจับ) · เดา (คล้าย ≥90%) นับว่าจับได้ · กำกวม/ไม่พบ = คนต้องเลือก → % = จับได้ ÷ ทั้งหมด|cost_batches.exact/fuzzy/byKind · sku_aliases|ทุกครั้งที่คนเลือก SKU ให้ชื่อใหม่ ระบบจำ → ตัวเลขนี้ควรไต่ขึ้นทุกสัปดาห์',
    queue: 'Review Queue|รายการที่ระบบกันไว้ไม่ให้เข้า Cost Master เอง: ทุนผิดปกติ (≤10฿ · กระโดด ≥30%/40฿ · สูงกว่าราคาขาย · นอกช่วงประวัติ · ผิดจากกลุ่ม) · ไม่พบ/กำกวม SKU · ซ้ำ · หน่วยไม่รู้จัก · ความแม่น = ที่คนตัดสินแล้วและ "แก้/ไม่ใช้/พัก" (ระบบกันถูก) ÷ ที่ตัดสินทั้งหมด|cost_flags|รอตรวจคือ "งานของคนวันนี้" ทั้งหมด — นอกนั้นระบบรับให้แล้ว',
    old: 'ทุนที่เก่า / ไม่รู้|เก่า = SKU ที่ Cost Master มีผลเกิน 7 วัน (ใบ AL ออกทุกสัปดาห์) · ไม่รู้ = ไม่มีทุนเลย · เวลา = นาทีที่พี่จุ๋มใช้ขั้น "อัปเดตทุน+ตลาด" สัปดาห์นี้ เทียบก่อนมีระบบ|cost_master.effective_date · ops-perf|ถ้า "เก่า" เท่ากับทั้งหมด = ใบรอบใหม่ยังไม่เข้า ไม่ใช่ระบบพัง',
    fresh: 'ตลาดสด 7 วัน|SKU ที่มีราคาตลาด (ส่ง) อายุ <7 วัน ÷ SKU ทั้งหมด · ใช้ได้ = 7–30 วัน · เก่า = >30 วัน (เปิดดูได้ แต่เครื่องคิดราคาไม่ใช้) · ไม่เคยเห็น = ไม่มีข้อมูล · แท่ง = จำนวนราคาที่เห็นต่อวัน 14 วัน|market_obs (connector รายวัน + สำรวจหน้าร้าน)|ยิ่งสดมาก Goal "แข่งขันได้" ยิ่งเชื่อได้ — ต่ำกว่า 30% ควรส่งคนไปสำรวจ',
    survey: 'สำรวจหน้าร้านสัปดาห์นี้|แผน = SKU ที่ควรไปดูต่อร้าน (ตัวที่ขายเยอะและข้อมูลเก่า/ไม่มี) · ทำแล้ว = ราคาที่ส่งเข้ามาสัปดาห์นี้ (พิมพ์/พูด/รูป) ที่จับคู่ SKU ได้|survey plan · surveys|ร้านที่ดึงออนไลน์ไม่ได้ 2 ครั้งจะสลับมาโหมดนี้เอง',
    score: 'เตือนแนวโน้มถูก|ทุกคำเตือน "หมวดนี้จะขึ้น/ลง" ถูกล็อกไว้ตอนออก ครบ 30 วันระบบเอาราคาจริงมาตรวจ → ถูก ÷ ที่ตรวจแล้ว · เส้น = % ถูกรายเดือน|predictions|ต่ำกว่า 60% อย่าเชื่อคำเตือนมาก · ดูเฉพาะหมวดที่มีข้อมูลมาก',
    channel: 'ทุนเข้าทางไหน|ช่องทางของทุกรายการที่เข้า Cost Master ใน 30 วัน|cost_entries.src|บอกว่า automation ทำงานจริงไหม — ถ้า "พิมพ์มือ" โต แปลว่าไฟล์ไม่เข้า',
    index: 'ดัชนีราคาตลาด 12 เดือน|ราคาตลาดรายเดือนของหมวด เดือนแรกที่มีข้อมูล = 100 · โชว์ 3 หมวดที่ขยับมากสุดใน 90 วัน|market_obs ย้อนหลัง 1 ปี|ใช้คาดราคาตอนไม่ได้สำรวจ — ไม่ใช่ราคาจริงวันนี้',
    margin: 'margin ราคาส่ง 2kg รายกลุ่ม|(ราคากลาง − ทุน) ÷ ราคากลาง เฉลี่ยต่อกลุ่ม · สี = เทียบ Target/Minimum ของกลุ่มนั้น (แดง ต่ำกว่า Minimum · ส้ม ต่ำกว่า Target)|pricelist · policy|กลุ่มที่แดง = ราคาที่ใช้อยู่ไม่ผ่านนโยบาย ต้องตั้งราคาใหม่หรือแก้นโยบาย'
  };
  function kc(o) {
    return '<div class="kc' + (o.lead ? ' lead' : '') + (o.cls ? ' ' + o.cls : '') + '"><div class="kh"><span>' + o.title + (o.why ? ' <i class="why" data-why="' + esc(WHY[o.why]) + '"></i>' : '') + '</span>' + (o.link ? '<a href="' + o.link + '" class="kx" title="เปิดดู">⤢</a>' : '') + '</div>' +
      (o.big != null ? '<div class="kv"><b>' + o.big + '</b>' + (o.unit ? '<small>' + o.unit + '</small>' : '') + (o.delta ? '<span class="kd ' + o.delta.cls + '">' + o.delta.text + '</span>' : '') + '</div>' : '') +
      (o.body || '') + (o.sub ? '<div class="ks">' + o.sub + '</div>' : '') + '</div>';
  }
  /* เทียบรอบก่อน: cls up/dn ตามว่าขึ้นดีหรือลงดี (inv = ลงดี) */
  function dl(cur, prev, unit, inv) { if (cur == null || prev == null) return null; var d = Math.round((cur - prev) * 10) / 10; if (!d) return { cls: 'fl', text: 'เท่ารอบก่อน' }; var good = inv ? d < 0 : d > 0; return { cls: good ? 'up' : 'dn', text: (d > 0 ? '+' : '') + d + (unit || '') + (d > 0 ? ' ↗' : ' ↘') }; }
  /* แท่งซ้อน HTML เล็กๆ (ไม่ต้องใช้ SVG): cols=[{label, parts:[[value,color],...]}] */
  function stack(cols, h) { h = h || 56; var mx = Math.max(1, Math.max.apply(null, cols.map(function (c) { return c.parts.reduce(function (a, p) { return a + p[0]; }, 0); })));
    return '<div class="mb" style="height:' + (h + 16) + 'px">' + cols.map(function (c) { var tot = c.parts.reduce(function (a, p) { return a + p[0]; }, 0); return '<div class="mbc" title="' + esc(c.title || c.label) + '"><div class="mbs" style="height:' + h + 'px">' + c.parts.map(function (p) { return p[0] ? '<i style="height:' + (p[0] / mx * 100) + '%;background:' + p[1] + '"></i>' : ''; }).join('') + (tot ? '' : '<i style="height:2px;background:var(--line-2)"></i>') + '</div><em>' + esc(c.label) + '</em></div>'; }).join('') + '</div>'; }
  function chip(label, v, tot, on) { var p = tot ? Math.round(v / tot * 100) : 0; return '<span class="chip' + (on ? ' on' : '') + '" style="--p:' + p + '%"><em>' + esc(label) + '</em><b>' + v + '</b></span>'; }
  function perfStrip() {
    if (!PERF) { if (!LOADING) { LOADING = true; load(true).then(function () { LOADING = false; if (window.redrawTab) redrawTab(); }).catch(function () { LOADING = false; }); } return '<div class="perf-hd"><b>ระบบช่วยได้แค่ไหน</b><span>กำลังอ่าน…</span></div>'; }
    var c = PERF.cost, m = PERF.market, sc = m.score || {}, S = PERF.series || {}, P = PERF.prev || {}, B = Charts.CAT;
    var mix = S.mix || {}, mixTot = (mix.exact || 0) + (mix.alias || 0) + (mix.fuzzy || 0) + (mix.possible || 0) + (mix.unmatched || 0), matched = (mix.exact || 0) + (mix.alias || 0) + (mix.fuzzy || 0), matchPct = mixTot ? Math.round(matched / mixTot * 100) : c.match.pct;
    var fl = c.flags || {}, kinds = PERF.queueByKind || {};
    var fr = S.freshness || { fresh: m.fresh7, usable: 0, stale: 0, blind: 0 }, tot = m.coverage.total || 1, freshPct = Math.round(fr.fresh / tot * 100);
    var sv = m.survey || { stores: [] }, svDone = sv.stores.reduce(function (a, s) { return a + s.done; }, 0), svTot = sv.stores.reduce(function (a, s) { return a + s.total; }, 0);
    /* แถว 1 — รับทุน */
    var h = '<div class="perf-hd"><b>ระบบช่วยได้แค่ไหน</b><span>mini dashboard · รับทุน + อ่านตลาด · 30 วันล่าสุด · กด ? ที่การ์ดเพื่อดูว่าคิดจากอะไร</span></div><div class="kpi">' +
      kc({ title: 'ทุนเข้าอัตโนมัติ', why: 'auto', link: '/costs#flags', big: c.autoPct == null ? '—' : c.autoPct, unit: c.autoPct == null ? '' : '%', delta: dl(c.autoPct, P.autoPct, ' pt'),
        body: S.batches && S.batches.length ? stack(S.batches.map(function (b) { return { label: b.at.slice(3), title: b.id + ' · Auto ' + b.auto + ' · Review ' + b.review + ' · ' + b.rows + ' แถว', parts: [[b.auto, B[0]], [b.review, '#D97706']] }; }), 52) : '<div class="mb" style="height:68px;color:var(--tx-3);font-size:11px;display:grid;place-items:center">ยังไม่มี Batch</div>',
        sub: c.entries30 ? 'ระบบทำ ' + (c.byChannel.file + c.byChannel.line + c.byChannel.flag) + ' · คนพิมพ์ ' + c.byChannel.manual + ' · ' + (fl.batches || 0) + ' batch' : 'ยังไม่มีทุนเข้าใน 30 วัน — อัปโหลดใบ AL หรือวาง Excel' }) +
      kc({ title: 'จับคู่ชื่อจากไฟล์ได้', why: 'match', big: matchPct == null ? '—' : matchPct, unit: matchPct == null ? '' : '%', delta: fl.aliases ? { cls: 'up', text: 'จำแล้ว ' + fl.aliases + ' ชื่อ' } : null,
        body: '<div class="chips">' + chip('ตรง', mix.exact || 0, mixTot, true) + chip('จำได้', mix.alias || 0, mixTot, true) + chip('เดา ≥90%', mix.fuzzy || 0, mixTot) + chip('คนเลือก', (mix.possible || 0) + (mix.unmatched || 0), mixTot) + '</div>',
        sub: mixTot ? 'จาก ' + mixTot + ' บรรทัดในทุก batch · ทุกครั้งที่คนเลือก SKU ระบบจำ ครั้งหน้าไม่ถาม' : 'ยังไม่มีไฟล์เข้า' }) +
      kc({ title: 'Review Queue', why: 'queue', link: '/costs#flags', big: fl.pending || 0, unit: ' รอตรวจ', delta: fl.decided ? { cls: fl.precision >= 70 ? 'up' : 'fl', text: 'กันถูก ' + fl.precision + '%' } : null, cls: fl.pending ? 'warn' : '',
        body: '<ol class="rank">' + (Object.keys(kinds).length ? Object.keys(kinds).sort(function (a, b) { return kinds[b] - kinds[a]; }).slice(0, 4).map(function (k, i) { return '<li><span>' + (i + 1) + '. ' + esc((PERF.kindText || {})[k] || k) + '</span><b>' + kinds[k] + '</b></li>'; }).join('') : '<li><span>ไม่มีค้าง</span><b>✓</b></li>') + '</ol>',
        sub: fl.decided ? 'คนตัดสินแล้ว ' + fl.decided + ' · ระบบกันถูก ' + fl.caught + ' (แก้/พัก/ไม่ใช้)' : 'ยังไม่มีผลตัดสิน' }) +
      kc({ title: 'ทุนที่เก่า / ไม่รู้', why: 'old', link: '/costs', big: c.oldCost, unit: '<span style="font-size:16px"> / ' + c.noCost + '</span>', delta: c.oldCost >= c.total ? { cls: 'dn', text: 'ใบรอบใหม่ยังไม่เข้า' } : c.oldCost ? { cls: 'fl', text: 'เกิน 7 วัน' } : { cls: 'up', text: 'สดทั้งหมด' },
        body: '<div class="tbar"><span><em>เวลาที่พี่จุ๋มใช้ขั้นนี้</em></span>' + (c.minutesBefore != null ? '<span><em>ก่อนมีระบบ</em><b class="t0" style="width:100%">' + c.minutesBefore + ' นาที</b></span>' : '') + '<span><em>สัปดาห์นี้</em><b class="t1" style="width:' + (c.minutesBefore ? Math.min(100, Math.round((c.minutesNow || 0) / c.minutesBefore * 100)) : 60) + '%">' + (c.minutesNow == null ? '—' : c.minutesNow + ' นาที') + '</b></span></div>',
        sub: 'จาก ' + c.total + ' SKU · ทุนมีผลล่าสุด ' + esc(String((c.lastImport || {}).effective_date || (c.lastImport || {}).at || '—').slice(0, 10)) }) +
      '</div>' +
      /* แถว 2 — ตลาด */
      '<div class="kpi k3">' +
      kc({ title: 'ตลาดสด 7 วัน', why: 'fresh', lead: true, link: '/costs?tab=sources', big: freshPct, unit: '%', delta: dl(fr.fresh, P.fresh7, ' SKU'),
        body: '<div class="lead2">' + Charts.donut({ items: [{ label: 'สด <7 วัน', value: fr.fresh, color: '#fff' }, { label: 'ใช้ได้ 7–30', value: fr.usable, color: 'rgba(255,255,255,.65)' }, { label: 'เก่า >30 (ไม่ใช้คิด)', value: fr.stale, color: 'rgba(255,255,255,.35)' }, { label: 'ไม่เคยเห็น', value: fr.blind, color: 'rgba(255,255,255,.15)' }], size: 92, center: { big: fr.fresh, small: '/' + tot } }) + '</div>' +
          stack((S.obsDaily || []).map(function (d) { return { label: d.d.slice(3), title: d.d + ' · เห็นราคา ' + d.n + ' รายการ', parts: [[d.n, 'rgba(255,255,255,.75)']] }; }), 22),
        sub: 'ออนไลน์ ' + m.online7 + ' · สำรวจ ' + m.survey7 + ' ครั้ง/สัปดาห์ · อายุกลาง ' + (m.medianAge == null ? '—' : m.medianAge + ' วัน') }) +
      kc({ title: 'สำรวจหน้าร้านสัปดาห์นี้', why: 'survey', link: '/costs?tab=sources', big: svDone + '<span style="font-size:16px;color:var(--tx-3)">/' + svTot + '</span>', delta: svTot ? { cls: svDone >= svTot ? 'up' : 'fl', text: Math.round(svDone / svTot * 100) + '% ของแผน' } : null,
        body: '<div class="goals">' + sv.stores.map(function (s) { var p = s.total ? Math.round(s.done / s.total * 100) : 0, full = s.total && s.done >= s.total; return '<div class="gcol" title="' + esc(s.label) + ' ' + s.done + '/' + s.total + '"><span class="gchk">' + (full ? '✓' : '') + '</span><div class="gbar"><i style="height:' + Math.max(4, p) + '%" class="' + (full ? 'ok' : s.done ? 'part' : '') + '"></i></div><em>' + esc(s.label.replace('Makro B2B', 'B2B')) + '</em><small>' + s.done + '/' + s.total + '</small></div>'; }).join('') + '</div>',
        sub: 'สัปดาห์ ' + esc(sv.week || '') + ' · จับคู่ SKU ได้ ' + (m.survey.matchPct == null ? '—' : m.survey.matchPct + '%') + ' · โหมดสำรวจ: ' + sv.stores.filter(function (s) { return s.mode === 'survey'; }).map(function (s) { return esc(s.label); }).join(', ') }) +
      kc({ title: 'เตือนแนวโน้มถูก', why: 'score', link: '/costs?tab=trend', big: sc.pct == null ? '—' : sc.pct, unit: sc.pct == null ? '' : '%', delta: S.score && S.score.length >= 2 ? dl(S.score[S.score.length - 1].pct, S.score[S.score.length - 2].pct, ' pt') : null,
        body: '<div class="sp">' + (S.score && S.score.length >= 2 ? Charts.spark(S.score.map(function (x) { return x.pct; }), B[0], 220, 44) + '<div class="spx">' + S.score.map(function (x) { return '<span>' + esc(x.m) + '</span>'; }).join('') + '</div>' : '<div style="color:var(--tx-3);font-size:11px;padding:12px 0">ยังไม่มีคำทำนายครบกำหนด</div>') + '</div>',
        sub: sc.resolved ? 'ถูก ' + sc.hits + '/' + sc.resolved + ' · รอผล ' + sc.open + ' · เตือนตอนนี้ ' + m.warnings + ' เรื่อง' : 'คำทำนายใหม่จะตรวจเมื่อครบ 30 วัน' }) +
      '</div>' + chartRow();
    return h;
  }
  /* แถว 3 — กราฟอ่านภาพรวม: ทุนเข้าทางไหน · ดัชนีตลาด 12 เดือน · margin รายกลุ่ม */
  function chartRow() {
    if (!PERF || !window.Charts) return '';
    var c = PERF.cost, by = c.byChannel, tr = window.Trend && Trend.data(), DB = DASH, pol = PERF.policy || {};
    var ch1 = Charts.donut({ items: [{ label: 'ไฟล์ AL / กล่องรับ', value: by.file, color: Charts.CAT[0] }, { label: 'LINE', value: by.line, color: Charts.CAT[5] }, { label: 'Review Queue แล้วใช้', value: by.flag, color: Charts.CAT[3] }, { label: 'พิมพ์มือ', value: by.manual, color: Charts.CAT[4] }, { label: 'ปรับทุกตัว', value: by.bulk, color: '#CBD5E1' }], size: 92, center: { big: String(c.entries30), small: 'รายการ' } });
    var top = tr ? tr.groups.filter(function (g) { return g.series.idx.filter(function (v) { return v != null; }).length >= 6; }).slice(0, 3) : [];
    var ch2 = tr ? Charts.line({ labels: tr.months.map(function (mm) { return mm.slice(5); }), series: top.map(function (g, i) { return { name: g.grp, values: g.series.idx, color: Charts.CAT[i] }; }), h: 120 }) : '<p class="hint">กำลังอ่านแนวโน้ม…</p>';
    var grs = DB && DB.groups ? DB.groups.filter(function (g) { return g.margin != null; }).sort(function (a, b) { return a.margin - b.margin; }).slice(0, 8) : [];
    var ch3 = grs.length ? Charts.bars({ items: grs.map(function (g) { var pg = (PERF.policyGroups || {})[g.grp] || {}; return { label: g.grp, value: g.margin, sub: g.n + ' SKU · Target ' + (pg.target == null ? '—' : pg.target + '%') + ' · Min ' + (pg.min == null ? '—' : pg.min + '%'), color: pg.min != null && g.margin < pg.min ? '#DC2626' : pg.target != null && g.margin < pg.target - 0.5 ? '#D97706' : Charts.CAT[0] }; }), unit: '%', horizontal: true }) : '<p class="hint">—</p>';
    return '<div class="kpi k3">' +
      kc({ title: 'ทุนเข้าทางไหน · 30 วัน', why: 'channel', body: '<div style="margin-top:8px">' + ch1 + '</div>' }) +
      kc({ title: 'ดัชนีราคาตลาด 12 เดือน · 3 หมวดที่ขยับมากสุด', why: 'index', link: '/costs?tab=trend', body: ch2 }) +
      kc({ title: 'margin ราคาส่ง 2kg รายกลุ่ม · 8 กลุ่มต่ำสุด', why: 'margin', link: '/pricing', body: '<div style="margin-top:8px">' + ch3 + '</div>', sub: 'สีเทียบ Target/Minimum ของกลุ่มนั้น' }) +
      '</div>';
  }
  /* ── แท็บแหล่งข้อมูล ── */
  function sourcesTab(comps) {
    if (!PERF || !SRC || !PLAN) { if (!LOADING) { LOADING = true; load(true).then(function () { LOADING = false; if (window.redrawTab) redrawTab(); }).catch(function () { LOADING = false; }); } return '<div class="card"><p class="hint">กำลังอ่านแหล่งข้อมูล…</p></div>'; }
    var c = PERF.cost, job = c.job || {};
    var h = (window.__loadSampleMarket && !(PERF.market && PERF.market.obs30) ? '<div class="warn2" style="margin:0 0 10px">ยังไม่มีราคาตลาดจริงในต้นแบบนี้ — <button class="btn" onclick="window.__loadSampleMarket().then(function(){PX.toast(\'โหลดราคาตลาดตัวอย่างแล้ว (ไม่ใช่ของจริง)\');Intake.load(true).then(function(){if(window.redrawTab)redrawTab();});})">โหลดราคาตลาดตัวอย่างเพื่อทดสอบ UI (ไม่ใช่ของจริง)</button></div>' : '') + '<div class="card"><h3>แหล่งข้อมูล <span class="sub">ดึงอัตโนมัติก่อน · ดึงไม่ได้ค่อยให้คนไปสำรวจ · ทุกตัวเลขมีที่มา+วันที่</span></h3><div class="src3">' +
      '<div class="srcc ' + (job.status === 'fail' ? 'bad' : c.imports ? 'on' : 'off') + '"><h4>🏭 ทุนจากโรงงาน (ไฟล์ AL) <span class="pill2 ' + (c.imports ? 'g' : 'a') + '">' + (c.imports ? 'นำเข้าแล้ว ' + c.imports + ' ครั้ง' : 'ยังไม่เคย') + '</span></h4>' +
        '<p>รับได้ 3 ทาง: <b>อัปโหลด PDF / Excel / CSV</b> ที่นี่ (อ่านตัวเลขในไฟล์เอง) · <b>กล่องรับอัตโนมัติ</b> — ไฟล์ที่ forward จากอีเมล/ไดรฟ์ลง <code>data/inbox</code> ระบบอ่านเองทุก 20 วิ · <b>LINE</b> พิมพ์ <code>ทุน สันคอหมู 178</code> ทุกทางผ่านด่านตรวจเดียวกัน</p>' +
        '<div class="act"><button class="pri" onclick="CostImport.open()">อัปโหลดไฟล์ (PDF/Excel/CSV)</button><button onclick="Intake.sample()">แม่แบบ CSV</button></div>' +
        (c.inbox && c.inbox.length ? '<div class="inbox">' + c.inbox.map(function (x) { return '<div><span>' + (x.status === 'ok' ? '✓' : '✗') + ' ' + esc(x.file) + '</span><span>' + esc(x.detail) + '</span><span>' + ago(x.at) + '</span></div>'; }).join('') + '</div>' : '<div class="inbox">กล่องรับอัตโนมัติ: ยังไม่มีไฟล์เข้ามา</div>') + '</div>';
    SRC.sources.forEach(function (s) {
      var tone = s.mode === 'online' && s.onlineAge != null && s.onlineAge <= 3 ? 'on' : s.mode === 'survey' ? 'off' : 'bad';
      h += '<div class="srcc ' + tone + '"><h4>🛒 ' + esc(s.label) + ' <span style="font-size:10.5px;color:var(--tx-3);font-weight:400">' + (s.tier === 'r' ? 'ราคาปลีก' : 'ราคาส่ง') + '</span><span class="pill2 ' + (tone === 'on' ? 'g' : tone === 'off' ? 'a' : 'r') + '">' + (s.mode === 'online' ? 'ดึงออนไลน์' : 'โหมดสำรวจหน้าร้าน') + '</span></h4>' +
        '<p>' + (s.source ? 'ที่มา: ' + esc(s.source) : '<b>ยังไม่ระบุที่มา</b>') + '<br>ออนไลน์ล่าสุด ' + (s.lastOnline ? esc(s.lastOnline) + ' (' + s.onlineAge + ' วันก่อน)' : '—') + ' · สำรวจล่าสุด ' + (s.lastSurvey ? esc(s.lastSurvey) : '—') + ' · ' + s.skus + ' SKU' + (s.last_error ? '<br><span style="color:var(--red)">ดึงไม่ได้: ' + esc(s.last_error) + ' (' + s.fails + ' ครั้ง)</span>' : '') + '</p>' +
        '<div class="act"><button onclick="Intake.testConn(\'' + s.id + '\')">ทดสอบดึงออนไลน์</button><button class="pri" onclick="Intake.survey(\'' + s.id + '\')">บันทึกจากการสำรวจ</button><button onclick="Intake.editSource(\'' + s.id + '\')">แก้ที่มา</button></div></div>';
    });
    h += '</div><p class="hint" style="margin-top:10px">กติกา: ออนไลน์ต้องเป็น feed/API ที่ได้รับสิทธิ์ (ตั้ง <code>MARKET_FEED_URL</code>) · ดึงไม่ได้ 2 ครั้งติด ระบบสลับร้านนั้นเป็นโหมดสำรวจเอง · ราคาจากการสำรวจเข้าตารางเดียวกับออนไลน์ (ติดป้าย "survey")</p></div>';
    /* แผนสำรวจ */
    var pl = PLAN;
    h += '<div class="card" style="margin-top:12px"><h3>สำรวจหน้าร้าน · สัปดาห์ ' + esc(pl.week) + ' <span class="sub">' + esc(pl.rules.per) + ' · ' + esc(pl.rules.due) + ' · บันทึกได้ 3 ทาง: ' + pl.rules.modes.join(' / ') + '</span></h3>' +
      '<p class="hint">ระบบเลือก SKU ที่ควรไปดูให้แล้ว (ไม่เคยรู้ราคา → ขายเยอะก่อน · ราคาเก่าเกิน 7 วัน) ร้านละไม่เกิน 15 ตัว · ถ่ายรูปป้ายหรือพูดใส่โทรศัพท์ได้ ระบบจับคู่ชื่อให้</p><div class="plan">' +
      pl.stores.map(function (s) { var pct = s.total ? Math.round(s.done / s.total * 100) : 0; return '<div><h4>' + esc(s.label) + ' <span class="pill2 ' + (s.mode === 'online' ? 'b' : 'a') + '">' + (s.mode === 'online' ? 'มีออนไลน์ · สำรวจเสริม' : 'ต้องสำรวจ') + '</span><span style="margin-left:auto;font-size:11px;color:var(--tx-3)">' + esc(s.assignee) + ' · ส่งภายใน ' + esc(s.due.slice(5).split('-').reverse().join('/')) + '</span></h4>' +
        '<div class="prog"><i style="width:' + pct + '%"></i></div><div style="font-size:11.5px;color:var(--tx-2);margin-bottom:6px">ทำแล้ว ' + s.done + '/' + s.total + ' SKU · ส่ง ' + s.submissions + ' ครั้ง</div>' +
        '<ul>' + (s.targets.length ? s.targets.map(function (t) { return '<li class="' + (t.done ? 'done' : '') + '">' + (t.done ? '✓ ' : '○ ') + esc(t.name) + '<small>' + (t.done ? t.done + ' ฿' : esc(t.why)) + '</small></li>'; }).join('') : '<li style="color:var(--tx-3)">ครบแล้ว — ไม่มีตัวที่ต้องไปดู</li>') + '</ul>' +
        '<div style="margin-top:8px"><button class="btn pri" style="padding:6px 12px;font-size:12px" onclick="Intake.survey(\'' + s.competitor_id + '\')">บันทึกการสำรวจ ' + esc(s.label) + '</button></div></div>'; }).join('') + '</div>' +
      (pl.recent.length ? '<p class="hint" style="margin:12px 0 4px"><b>ส่งล่าสุด</b></p><div class="inbox">' + pl.recent.slice(0, 8).map(function (r) { return '<div><span>' + esc(r.label) + (r.branch ? ' · ' + esc(r.branch) : '') + ' · ' + r.n + ' รายการ (' + esc({ type: 'พิมพ์', voice: 'พูด', photo: 'ถ่ายรูป', line: 'LINE' }[r.mode] || r.mode) + (r.photos ? ' · รูป ' + r.photos : '') + ')</span><span>' + esc(r.by) + '</span><span>' + ago(r.at) + '</span></div>'; }).join('') + '</div>' : '') + '</div>';
    return h;
  }
  /* ── โมดัลสำรวจ: พิมพ์ / พูด / ถ่ายรูป → แปลงเป็นรายการ → แก้ได้ → ส่ง ── */
  var SV = { store: '', mode: 'type', rows: [], photos: 0, rec: null };
  function survey(store) {
    css(); SV = { store: store, mode: 'type', rows: [], photos: 0, rec: null };
    var st = (PLAN && PLAN.stores.filter(function (s) { return s.competitor_id === store; })[0]) || { label: store, targets: [] };
    var m = PX.modal({ title: 'สำรวจราคาหน้าร้าน · ' + st.label, sub: 'พิมพ์ทีละบรรทัด "ชื่อสินค้า ราคา" · หรือกดพูด · หรือถ่ายรูปป้ายแล้วพิมพ์ตาม · ระบบจับคู่กับ SKU ของเราให้ ตรวจแล้วค่อยส่ง',
      html: '<div class="sv-modes"><button class="on" data-m="type" onclick="Intake.mode(\'type\')">⌨️ พิมพ์</button><button data-m="voice" onclick="Intake.mode(\'voice\')">🎙 พูด</button><button data-m="photo" onclick="Intake.mode(\'photo\')">📷 ถ่ายรูปป้าย</button></div>' +
        '<div id="svPhoto" hidden><label class="fld"><span>รูปป้ายราคา (เลือกได้หลายรูป)</span><input type="file" id="svImg" accept="image/*" capture="environment" multiple></label><div id="svThumbs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"></div><p class="hint">ถ่ายให้เห็นชื่อ+ราคาชัด · กด "ลองอ่านอัตโนมัติ" ถ้าเครื่องต่อเน็ต (ทดลอง) · ไม่ได้ก็พิมพ์ตามรูปในช่องด้านล่าง</p><button class="btn" style="margin-bottom:8px" onclick="Intake.ocr()">ลองอ่านป้ายอัตโนมัติ (ทดลอง)</button></div>' +
        '<div id="svVoice" hidden><button class="btn pri" id="svRec" onclick="Intake.rec()">🎙 เริ่มพูด</button> <span class="hint" style="display:inline">พูดว่า "สามชั้น หนึ่งร้อยแปดสิบเก้า" หรือ "สันคอ 178" · หยุดพูดแล้วกดอีกครั้ง</span></div>' +
        '<label class="fld"><span>รายการที่เห็น (บรรทัดละตัว หรือคั่นด้วยจุลภาค)</span><textarea id="svText" rows="4" placeholder="สามชั้น 189\nสันคอหมู 178\nกระดูกซุป 45"></textarea></label>' +
        '<div style="display:flex;gap:8px;align-items:center"><button class="btn" onclick="Intake.parse()">จับคู่ SKU →</button><span class="hint" style="display:inline">ตัวที่ควรไปดู: ' + st.targets.filter(function (t) { return !t.done; }).slice(0, 6).map(function (t) { return esc(t.name); }).join(' · ') + '</span></div>' +
        '<div class="sv-rows" id="svRows"></div><label class="fld" style="margin-top:8px"><span>สาขา / โน้ต</span><input id="svBranch" placeholder="เช่น สาขาบางนา"></label>',
      okText: 'ส่งผลสำรวจ', note: 'ส่งแล้วเข้าแนวโน้มตลาดทันที · ติดป้ายว่า "สำรวจ" + ชื่อคนส่ง',
      onOk: function (v, close) {
        var ok = SV.rows.filter(function (r) { return r.ok && r.product_id; });
        if (!ok.length) { PX.toast('ยังไม่มีรายการที่จับคู่ได้ — กด "จับคู่ SKU" ก่อน', 'bad'); return false; }
        return PX.post('/api/survey/submit', { store: SV.store, mode: SV.mode, rows: ok.map(function (r) { return { product_id: r.product_id, price: r.price, raw: r.raw }; }), photos: SV.photos, branch: document.getElementById('svBranch').value })
          .then(function (r) { close(); PX.toast('บันทึกผลสำรวจ ' + esc(st.label) + ' ' + r.n + ' รายการ' + (r.unmatched.length ? ' · ข้าม ' + r.unmatched.length : '')); return load(true).then(function () { if (window.redrawTab) redrawTab(); }); });
      } });
    SV.el = m.el;
    m.el.querySelector('#svImg').onchange = function () { var th = m.el.querySelector('#svThumbs'); th.innerHTML = ''; SV.photos = this.files.length; SV.files = this.files;
      [].forEach.call(this.files, function (f) { var img = document.createElement('img'); img.style.cssText = 'height:72px;border-radius:8px;border:1px solid var(--line)'; img.src = URL.createObjectURL(f); th.appendChild(img); }); PX.toast('แนบ ' + this.files.length + ' รูปแล้ว — พิมพ์ชื่อ+ราคาที่เห็นในรูปด้านล่าง หรือลองอ่านอัตโนมัติ'); };
  }
  function mode(k) { SV.mode = k; var el = SV.el; el.querySelectorAll('.sv-modes button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === k); }); el.querySelector('#svPhoto').hidden = k !== 'photo'; el.querySelector('#svVoice').hidden = k !== 'voice'; }
  function rec() {
    var el = SV.el, btn = el.querySelector('#svRec'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { PX.toast('เบราว์เซอร์นี้ไม่รองรับการพูด (ใช้ Chrome/Edge บนมือถือหรือเดสก์ท็อป) — พิมพ์แทนได้', 'bad'); return; }
    if (SV.rec) { SV.rec.stop(); return; }
    var r = new SR(); r.lang = 'th-TH'; r.continuous = true; r.interimResults = true; SV.rec = r; var base = el.querySelector('#svText').value;
    btn.innerHTML = '<span class="sv-rec"><i></i>กำลังฟัง… กดเพื่อหยุด</span>';
    r.onresult = function (e) { var fin = '', tmp = ''; for (var i = 0; i < e.results.length; i++) { (e.results[i].isFinal ? (fin += e.results[i][0].transcript + '\n') : (tmp += e.results[i][0].transcript)); } el.querySelector('#svText').value = (base ? base + '\n' : '') + thaiNum(fin) + (tmp ? '\n' + tmp : ''); };
    r.onend = function () { SV.rec = null; btn.textContent = '🎙 เริ่มพูด'; parse(); };
    r.onerror = function (e) { SV.rec = null; btn.textContent = '🎙 เริ่มพูด'; PX.toast('ฟังไม่ได้ — ' + e.error, 'bad'); };
    r.start();
  }
  /* เลขไทยที่พูดเป็นคำ → ตัวเลข (หนึ่งร้อยแปดสิบเก้า → 189) — พอใช้กับราคาหมู 2–4 หลัก */
  function thaiNum(s) {
    var D1 = { ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
    return s.replace(/((?:(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?(?:พัน|ร้อย)|(?:ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)?สิบ|หนึ่ง|เอ็ด|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|ศูนย์)+)(?=\s*(?:บาท|฿|$|\n| ))/g, function (w) {
      var n = 0, cur = 0, m; var re = /(หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|ศูนย์)?(พัน|ร้อย|สิบ)?/g, out = 0, pending = null, any = false;
      while ((m = re.exec(w)) && m[0]) { any = true; var d = m[1] != null ? D1[m[1]] : null, u = m[2]; if (u === 'พัน') out += (d == null ? 1 : d) * 1000; else if (u === 'ร้อย') out += (d == null ? 1 : d) * 100; else if (u === 'สิบ') out += (d == null ? 1 : d) * 10; else if (d != null) out += d; }
      return any ? String(out) : w;
    });
  }
  function parse() {
    var txt = SV.el.querySelector('#svText').value.trim(); if (!txt) { PX.toast('ยังไม่มีข้อความ', 'bad'); return; }
    PX.post('/api/survey/parse', { text: txt, store: SV.store }).then(function (r) { SV.rows = r.rows; drawRows(); PX.toast('จับคู่ได้ ' + r.rows.filter(function (x) { return x.ok; }).length + '/' + r.rows.length + ' รายการ'); }).catch(function (e) { PX.toast(esc(e.message), 'bad'); });
  }
  function drawRows() {
    var box = SV.el.querySelector('#svRows');
    box.innerHTML = SV.rows.map(function (r, i) {
      if (r.ok) return '<div class="' + (r.warn ? 'warn' : '') + '"><div><b>' + esc(r.product) + '</b><small>' + esc(r.raw) + ' · ' + (r.how === 'exact' ? 'ตรง' : r.how === 'normalized' ? 'ตรง (ล้างชื่อ)' : 'เดา ' + Math.round(r.score * 100) + '%') + (r.warn ? ' · <span style="color:var(--amber)">' + esc(r.warn) + '</span>' : '') + '</small></div><b>' + r.price + ' ฿</b><button class="lnk3" onclick="Intake.drop(' + i + ')">ลบ</button></div>';
      return '<div class="bad"><div><b>' + esc(r.raw) + '</b><small>' + esc(r.reason) + (r.alts && r.alts.length ? ' — เลือกสินค้า:' : '') + '</small>' + (r.alts && r.alts.length ? '<select onchange="Intake.pick(' + i + ',this.value)"><option value="">— เลือก —</option>' + r.alts.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join('') + '</select>' : '') + '</div><b>' + (r.price || '—') + '</b><button class="lnk3" onclick="Intake.drop(' + i + ')">ลบ</button></div>';
    }).join('');
  }
  function pick(i, pid) { var r = SV.rows[i]; if (!pid || !r) return; r.ok = true; r.product_id = pid; r.product = (r.alts.filter(function (a) { return a.id === pid; })[0] || {}).name; r.how = 'manual'; r.score = 1; drawRows(); }
  function drop(i) { SV.rows.splice(i, 1); drawRows(); }
  function ocr() {
    if (!SV.files || !SV.files.length) { PX.toast('เลือกรูปก่อน', 'bad'); return; }
    PX.toast('กำลังโหลดตัวอ่านภาพ (ต้องต่อเน็ต)…');
    var loadT = window.Tesseract ? Promise.resolve(window.Tesseract) : new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js'; s.onload = function () { ok(window.Tesseract); }; s.onerror = function () { no(new Error('โหลดตัวอ่านภาพไม่ได้')); }; document.head.appendChild(s); });
    loadT.then(function (T) { return T.recognize(SV.files[0], 'tha+eng'); }).then(function (res) { var t = res.data.text.replace(/[^\S\n]+/g, ' ').trim(); var ta = SV.el.querySelector('#svText'); ta.value = (ta.value ? ta.value + '\n' : '') + t; PX.toast('อ่านได้แล้ว — ตรวจแล้วกด "จับคู่ SKU"'); })
      .catch(function (e) { PX.toast('อ่านอัตโนมัติไม่ได้ (' + esc(e.message) + ') — พิมพ์ตามรูปแทน', 'bad'); });
  }
  function testConn(cid) { PX.toast('กำลังทดสอบดึง…'); PX.post('/api/connectors/test', { competitor_id: cid }).then(function (r) { PX.toast(r.ok ? '✓ ' + esc(r.note) : 'ดึงไม่ได้ — ' + esc(r.error) + ' · ระบบจะใช้โหมดสำรวจ', r.ok ? 'ok' : 'bad'); return load(true).then(function () { if (window.redrawTab) redrawTab(); }); }).catch(function (e) { PX.toast(esc(e.message), 'bad'); }); }
  function editSource(cid) { var s = SRC.sources.filter(function (x) { return x.id === cid; })[0] || {}; PX.modal({ title: 'ที่มาของราคา · ' + s.label, sub: 'ใส่ URL ของ feed/API ที่ได้รับสิทธิ์ หรือบอกว่าใครไปดูหน้าร้าน', fields: [{ k: 'source', label: 'ที่มา', value: s.source || '', ph: 'https://… หรือ เซลล์สำรวจสาขาบางนา' }], okText: 'บันทึก',
    onOk: function (v, close) { return PX.post('/api/config', { competitors: SRC.sources.map(function (x) { return { id: x.id, label: x.label, tier: x.tier, source: x.id === cid ? v.source : x.source }; }) }, 'PUT').then(function () { close(); return load(true).then(function () { if (window.redrawTab) redrawTab(); }); }); } }); }
  function sample() { PX.csv('ทุน-AL-แม่แบบ.csv', [['สินค้า', 'ทุน (บาท/กก.)'], ['มันแข็งหมู', '65'], ['หมูบด มัน 20%', '101']]); }
  return { load: load, perfStrip: perfStrip, sourcesTab: sourcesTab, survey: survey, mode: mode, rec: rec, parse: parse, pick: pick, drop: drop, ocr: ocr, testConn: testConn, editSource: editSource, sample: sample, thaiNum: thaiNum };
})();
