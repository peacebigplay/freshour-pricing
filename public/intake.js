/* ══════════════════════════════════════════════════════════════════
   Intake — หน้า รับทุน & ตลาด: mini dashboard ของระบบ + แท็บ "แหล่งข้อมูล & สำรวจ"
   · Perf strip   ระบบช่วยรับทุน/อ่านตลาดได้แค่ไหน (อัตโนมัติกี่ % · จับคู่ชื่อได้กี่ % · ด่านจับทุนแปลกแม่นกี่ % · ตลาดสดกี่ SKU · เตือนถูกกี่ %)
   · แหล่งข้อมูล   โรงงาน (ไฟล์ PDF/Excel/CSV อัปโหลด · กล่องรับอัตโนมัติ · LINE) · ตลาดออนไลน์ (connector ต่อแหล่ง) · ดึงไม่ได้ → โหมดสำรวจหน้าร้าน
   · สำรวจหน้าร้าน แผนรายสัปดาห์ต่อร้าน (SKU ที่ควรไปดู) · บันทึกได้ 3 ทาง: พิมพ์ · พูด (Web Speech) · ถ่ายรูปป้าย — ระบบจับคู่ SKU ให้เอง
   ══════════════════════════════════════════════════════════════════ */
window.Intake = (function () {
  var esc = PX.esc, money = PX.money, ago = PX.ago, PERF = null, SRC = null, PLAN = null, DASH = null, AT = 0;
  var CSS = '<style id="inCss">' +
    '.perf{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:8px;margin:0 0 12px}.perf>div{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 12px;min-width:0}' +
    '.perf .l{font-size:10.5px;color:var(--tx-3);font-weight:600;letter-spacing:.04em;text-transform:uppercase}.perf .n{font-family:var(--fn);font-size:22px;font-weight:600;letter-spacing:-.03em;line-height:1.2;margin-top:2px}.perf .n small{font-family:var(--ff);font-size:11px;font-weight:500;color:var(--tx-3);margin-left:2px}.perf .s{font-size:10.5px;color:var(--tx-2);margin-top:3px;line-height:1.4}' +
    '.perf .g{color:var(--green)}.perf .a{color:var(--amber)}.perf .r{color:var(--red)}.perf .bar{height:5px;border-radius:99px;background:var(--line-2);margin-top:6px;overflow:hidden}.perf .bar i{display:block;height:100%;background:var(--blue)}' +
    '.perf-hd{display:flex;align-items:baseline;gap:8px;margin:0 0 6px}.perf-hd b{font-size:12px}.perf-hd span{font-size:11px;color:var(--tx-3)}' +
    '.ctabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin:4px 0 14px;overflow-x:auto;position:sticky;top:0;z-index:5;background:var(--bg)}.ctabs button{font-family:var(--ff);flex:0 0 auto;border:0;background:none;padding:11px 18px 9px;border-bottom:3px solid transparent;margin-bottom:-1px;cursor:pointer;font-size:14px;font-weight:600;color:var(--tx-3)}.ctabs button:hover{color:var(--ink)}.ctabs button.on{color:var(--blue);border-bottom-color:var(--blue)}.ctabs button em{font-style:normal;font-size:10.5px;color:var(--tx-3);margin-left:6px;font-weight:500}' +
    '.src3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.srcc{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:#fff;border-top:4px solid var(--line)}.srcc.on{border-top-color:var(--green)}.srcc.off{border-top-color:var(--amber)}.srcc.bad{border-top-color:var(--red)}.srcc h4{margin:0 0 2px;font-size:13.5px;display:flex;gap:8px;align-items:center}.srcc h4 .pill2{margin-left:auto}.srcc p{margin:0 0 8px;font-size:11.5px;color:var(--tx-2);line-height:1.5}.srcc .act{display:flex;gap:6px;flex-wrap:wrap}.srcc .act button,.srcc .act label{font-family:var(--ff);font-size:11.5px;padding:5px 10px;border-radius:9px;border:1px solid var(--line);background:#fff;cursor:pointer}.srcc .act .pri{background:var(--ink);color:#fff;border-color:var(--ink)}' +
    '.plan{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:10px}.plan>div{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:#fff}.plan h4{margin:0;font-size:13.5px;display:flex;gap:8px;align-items:center}.plan .prog{height:6px;border-radius:99px;background:var(--line-2);margin:8px 0;overflow:hidden}.plan .prog i{display:block;height:100%;background:var(--green)}' +
    '.plan ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;max-height:190px;overflow:auto}.plan li{display:flex;gap:8px;font-size:12px;align-items:center}.plan li small{color:var(--tx-3);margin-left:auto;white-space:nowrap}.plan li.done{color:var(--tx-3);text-decoration:line-through}' +
    '.sv-modes{display:flex;gap:6px;margin:0 0 8px}.sv-modes button{font-family:var(--ff);flex:1;padding:9px;border-radius:10px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:12.5px}.sv-modes button.on{background:var(--blue-l);border-color:var(--blue-b);color:var(--blue);font-weight:600}' +
    '.sv-rows{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:260px;overflow:auto}.sv-rows>div{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:6px 10px;border:1px solid var(--line);border-radius:10px;font-size:12.5px;background:#fff}.sv-rows>div.bad{border-color:var(--red-b);background:var(--red-l)}.sv-rows>div.warn{border-color:var(--amber-b);background:var(--amber-l)}.sv-rows small{display:block;color:var(--tx-3);font-size:10.5px}.sv-rows select{font-family:var(--ff);font-size:11.5px;max-width:190px}' +
    '.sv-rec{display:inline-flex;align-items:center;gap:6px}.sv-rec i{width:9px;height:9px;border-radius:50%;background:var(--red);display:inline-block;animation:blink 1s infinite}@keyframes blink{50%{opacity:.2}}' +
    '.inbox{font-size:11.5px;color:var(--tx-2);margin-top:8px}.inbox div{display:flex;gap:8px;padding:3px 0;border-bottom:1px dashed var(--line)}.inbox div span:last-child{margin-left:auto;color:var(--tx-3);white-space:nowrap}' +
    '@media(max-width:700px){.perf{grid-template-columns:repeat(2,1fr)}.perf .n{font-size:18px}.ctabs button{padding:9px 12px 8px;font-size:13px}}</style>';
  function css() { if (!document.getElementById('inCss')) document.head.insertAdjacentHTML('beforeend', CSS); }
  function load(force) {
    if (PERF && !force && Date.now() - AT < 15000) return Promise.resolve();
    return Promise.all([PX.get('/api/intake-perf').then(function (j) { PERF = j; }), PX.get('/api/survey').then(function (j) { PLAN = j; }), PX.get('/api/sources').then(function (j) { SRC = j; }), PX.get('/api/dashboard').then(function (j) { DASH = j; }).catch(function () {}), window.Trend ? Trend.load().catch(function () {}) : null]).then(function () { AT = Date.now(); css(); });
  }
  var pc = function (v, good, warn) { return v == null ? '' : v >= good ? 'g' : v >= warn ? 'a' : 'r'; };
  /* ── mini dashboard (บนสุด ทุกแท็บ) ── */
  var LOADING = false;
  function perfStrip() {
    if (!PERF) { if (!LOADING) { LOADING = true; load(true).then(function () { LOADING = false; if (window.redrawTab) redrawTab(); }).catch(function () { LOADING = false; }); } return '<div class="perf-hd"><b>ระบบช่วยได้แค่ไหน</b><span>กำลังอ่าน…</span></div>'; }
    var c = PERF.cost, m = PERF.market, sc = m.score || {};
    var tile = function (l, n, unit, s, tone, bar) { return '<div><div class="l">' + l + '</div><div class="n ' + (tone || '') + '">' + n + (unit ? '<small>' + unit + '</small>' : '') + '</div>' + (bar != null ? '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, bar)) + '%"></i></div>' : '') + '<div class="s">' + s + '</div></div>'; };
    return '<div class="perf-hd"><b>ระบบช่วยได้แค่ไหน</b><span>mini dashboard · รับทุน + อ่านตลาด · 30 วันล่าสุด</span></div><div class="perf">' +
      tile('ทุนเข้าอัตโนมัติ', c.autoPct == null ? '—' : c.autoPct, c.autoPct == null ? '' : '%', c.entries30 ? 'จากไฟล์/LINE ' + (c.byChannel.file + c.byChannel.line + c.byChannel.flag) + ' · พิมพ์มือ ' + c.byChannel.manual + ' · ปรับทุกตัว ' + c.byChannel.bulk : 'ยังไม่มีทุนเข้าใน 30 วัน', pc(c.autoPct, 70, 40), c.autoPct) +
      tile('จับคู่ชื่อจากไฟล์ได้', c.match.pct == null ? '—' : c.match.pct, c.match.pct == null ? '' : '%', c.match.exact + c.match.fuzzy + c.match.unmatched ? 'ตรง ' + c.match.exact + ' · เดา ' + c.match.fuzzy + ' · ไม่ได้ ' + c.match.unmatched : 'ยังไม่เคยนำเข้าไฟล์', pc(c.match.pct, 90, 70), c.match.pct) +
      tile('ด่านจับทุนแปลก', c.flags.total, ' ครั้ง', (c.flags.decided ? 'คนยืนยันว่าผิดจริง ' + c.flags.caught + '/' + c.flags.decided + (c.flags.precision != null ? ' (' + c.flags.precision + '%)' : '') : 'ยังไม่มีผลตัดสิน') + (c.flags.pending ? ' · <b style="color:var(--red)">รอตรวจ ' + c.flags.pending + '</b>' : ''), c.flags.pending ? 'r' : '', null) +
      tile('ทุนที่เก่า / ไม่รู้', c.oldCost + ' / ' + c.noCost, '', 'จาก ' + c.total + ' SKU · เก่า = เกิน 7 วัน · เวลาที่พี่จุ๋มใช้สัปดาห์นี้ ' + (c.minutesNow == null ? '—' : c.minutesNow + ' นาที') + (c.minutesBefore != null ? ' (เดิม ' + c.minutesBefore + ')' : ''), c.noCost ? 'a' : 'g', null) +
      tile('ตลาดสด (7 วัน)', m.fresh7, '<small>/' + m.coverage.total + '</small>', 'ออนไลน์ ' + m.online7 + ' · สำรวจ ' + m.survey7 + ' ครั้ง/สัปดาห์ · อายุกลาง ' + (m.medianAge == null ? '—' : m.medianAge + ' วัน'), pc(m.fresh7 / m.coverage.total * 100, 30, 10), m.fresh7 / m.coverage.total * 100) +
      tile('สำรวจหน้าร้านสัปดาห์นี้', m.survey.stores.reduce(function (a, s) { return a + s.done; }, 0) + '/' + m.survey.stores.reduce(function (a, s) { return a + s.total; }, 0), '', 'เป้า: ' + m.survey.stores.map(function (s) { return esc(s.label) + ' ' + s.done + '/' + s.total; }).join(' · ') + ' · ส่งมาแล้ว ' + m.survey.rows + ' ราคา' + (m.survey.matchPct != null ? ' · จับคู่ SKU ได้ ' + m.survey.matchPct + '%' : ''), m.survey.rows ? 'g' : '', null) +
      tile('เตือนแนวโน้มถูก', sc.pct == null ? '—' : sc.pct, sc.pct == null ? '' : '%', sc.resolved ? 'ถูก ' + sc.hits + '/' + sc.resolved + ' · รอผล ' + sc.open + ' · เตือนตอนนี้ ' + m.warnings + ' เรื่อง' : 'ยังไม่มีคำทำนายครบกำหนด', pc(sc.pct, 70, 50), sc.pct) +
      '</div>' + chartRow();
  }
  /* กราฟใต้ tiles: ทุนเข้าทางไหน · ดัชนีตลาด 12 เดือน · margin ราย grp (ตามเรฟ: เห็นภาพเร็วกว่าตัวเลข) */
  function chartRow() {
    if (!PERF || !window.Charts) return '';
    var c = PERF.cost, by = c.byChannel, tr = window.Trend && Trend.data(), DB = DASH;
    var ch1 = Charts.donut({ items: [{ label: 'ไฟล์ AL / กล่องรับ', value: by.file, color: Charts.CAT[0] }, { label: 'LINE', value: by.line, color: Charts.CAT[5] }, { label: 'ตรวจทุนแปลกแล้วใช้', value: by.flag, color: Charts.CAT[3] }, { label: 'พิมพ์มือ', value: by.manual, color: Charts.CAT[4] }, { label: 'ปรับทุกตัว', value: by.bulk, color: '#CBD5E1' }], size: 92, center: { big: String(c.entries30), small: 'รายการ' } });
    var top = tr ? tr.groups.filter(function (g) { return g.series.idx.filter(function (v) { return v != null; }).length >= 6; }).slice(0, 3) : [];
    var ch2 = tr ? Charts.line({ labels: tr.months.map(function (mm) { return mm.slice(5); }), series: top.map(function (g, i) { return { name: g.grp, values: g.series.idx, color: Charts.CAT[i] }; }), h: 110 }) : '<p class="hint">กำลังอ่านแนวโน้ม…</p>';
    var grs = DB && DB.groups ? DB.groups.filter(function (g) { return g.margin != null; }).sort(function (a, b) { return a.margin - b.margin; }).slice(0, 8) : [];
    var ch3 = grs.length ? Charts.bars({ items: grs.map(function (g) { return { label: g.grp, value: g.margin, sub: g.n + ' SKU · ทุนเฉลี่ย ' + g.costAvg, color: g.margin < 12 ? '#DC2626' : g.margin < 15 ? '#D97706' : Charts.CAT[0] }; }), unit: '%', horizontal: true }) : '<p class="hint">—</p>';
    return '<div class="perf" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">' +
      '<div><div class="l">ทุนเข้าทางไหน · 30 วัน</div><div style="margin-top:6px">' + ch1 + '</div></div>' +
      '<div><div class="l">ดัชนีราคาตลาด 12 เดือน · 3 หมวดที่ขยับมากสุด</div>' + ch2 + '</div>' +
      '<div><div class="l">margin ราคาส่ง 2kg รายกลุ่มสินค้า · 8 กลุ่มต่ำสุด</div><div style="margin-top:6px">' + ch3 + '</div></div></div>';
  }
  /* ── แท็บแหล่งข้อมูล ── */
  function sourcesTab(comps) {
    if (!PERF || !SRC || !PLAN) { if (!LOADING) { LOADING = true; load(true).then(function () { LOADING = false; if (window.redrawTab) redrawTab(); }).catch(function () { LOADING = false; }); } return '<div class="card"><p class="hint">กำลังอ่านแหล่งข้อมูล…</p></div>'; }
    var c = PERF.cost, job = c.job || {};
    var h = '<div class="card"><h3>แหล่งข้อมูล <span class="sub">ดึงอัตโนมัติก่อน · ดึงไม่ได้ค่อยให้คนไปสำรวจ · ทุกตัวเลขมีที่มา+วันที่</span></h3><div class="src3">' +
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
