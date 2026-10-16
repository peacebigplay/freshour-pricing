/* ══════════════════════════════════════════════════════════════════
   Dash — หน้าสรุปแยกตามคน (คอมเมนต์ผู้ใช้ 15 ต.ค.) วางไว้บนหน้าแรกของแต่ละบทบาท
   พี่หมิง (/exec)    ปิดได้กี่เจ้า · margin จริงเท่าไหร่ · เสียไปเพราะอะไร
   พี่จุ๋ม (/pricing) งานติดตรงไหน · ข้อมูลไหนเก่า · ระบบทำงานอยู่ไหม
   เซลล์ (/sales)     กระดานใบราคา: แต่ละเจ้าอยู่ขั้นไหน · ส่ง LINE · ตามเจ้าที่เงียบ · ปิดดีล  (ไม่มีทุน)
   ข้อมูลทั้งหมดจาก /api/dashboard ตัวเดียว · วาดซ้ำทุกครั้งที่หน้าแม่วาดใหม่ (MutationObserver)
   ══════════════════════════════════════════════════════════════════ */
window.Dash = (function () {
  var esc = PX.esc, money = PX.money, ago = PX.ago;
  var jsq = function (v) { return JSON.stringify(String(v == null ? '' : v)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ROLE = null, DATA = null, AT = 0, FILTER = 'all', BUSY = false, SHOW_ALL = false;
  var STG = { draft: 'n', ready: 'b', sent: 'a', waiting: 'r', partial: 'a', agreed: 'g', won: 'g', lost: 'r', invoiced: 'g' };
  var CHAN = { line: 'LINE', 'line-text': 'ข้อความ LINE', link: 'ลิงก์', manual: 'เซลล์ส่งเอง' };

  var CSS = '<style id="fhDashCss">' +
    '.fhd{margin:0 0 16px}.fhd h2{font-size:15px;margin:0 0 2px}.fhd .sub{font-size:11.5px;color:var(--tx-3);margin:0 0 10px}' +
    '.fhd .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.fhd .grid.c3{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}@media(max-width:1000px){.fhd .grid.c3{grid-template-columns:1fr 1fr !important}}@media(max-width:640px){.fhd .grid.c3{grid-template-columns:1fr !important}}' +
    '.fhd .k{cursor:default}.fhd .k.tap{cursor:pointer}.fhd .k .v{font-size:26px}.fhd .k .v.sm{font-size:18px}' +
    '.fhd .fun{display:flex;gap:4px;margin:10px 0 4px;flex-wrap:wrap}.fhd .fun button{font-family:var(--ff);font-size:11.5px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 10px;cursor:pointer;color:var(--tx-2)}' +
    '.fhd .fun button b{font-family:var(--fn);margin-left:5px;color:var(--ink)}.fhd .fun button.on{background:var(--ink);color:#fff;border-color:var(--ink)}.fhd .fun button.on b{color:#fff}' +
    '.fhd .list{display:flex;flex-direction:column;gap:6px}.fhd .row{display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:#fff;font-size:12.5px}' +
    '.fhd .row.due{border-left:4px solid var(--red)}.fhd .row b{display:block}.fhd .row small{display:block;color:var(--tx-3);font-size:10.5px}.fhd .row .act{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}' +
    '.fhd .row .act button{font-family:var(--ff);font-size:11px;padding:4px 9px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer}.fhd .row .act button.pri{background:var(--ink);color:#fff;border-color:var(--ink)}' +
    '.fhd .sys{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--tx-3)}.fhd .sys span{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:var(--line-2)}.fhd .sys i{width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block}.fhd .sys i.bad{background:var(--red)}.fhd .sys i.warn{background:var(--amber)}.fhd .sys i.off{background:var(--tx-3)}' +
    '.fhd .al{border:1px solid var(--red-b);background:var(--red-l);border-radius:12px;padding:8px 12px;font-size:12px;margin-top:8px;display:flex;gap:10px;align-items:center}.fhd .al.warn{border-color:var(--amber-b);background:var(--amber-l)}.fhd .al button{margin-left:auto}' +
    '.fhd ul.blk{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}.fhd ul.blk li{display:flex;gap:8px;align-items:center;font-size:12.5px}.fhd ul.blk li b{font-family:var(--fn);min-width:28px;text-align:right}.fhd ul.blk li a{color:var(--blue);text-decoration:none;margin-left:auto;font-size:11.5px;white-space:nowrap}' +
    '.fhd .bar{height:8px;border-radius:99px;background:var(--line-2);overflow:hidden;display:flex}.fhd .bar i{display:block;height:100%}' +
    '.fhd table.g{min-width:0}.fhd table.g td{padding:7px 9px;font-size:12px}' +
    '@media(max-width:700px){.fhd .row{grid-template-columns:1fr 1fr}.fhd .row .act{grid-column:1/-1;justify-content:flex-start}}</style>';

  function load(force) {
    if (DATA && !force && Date.now() - AT < 20000) return Promise.resolve(DATA);
    /* หน้าเซลล์ = แดชบอร์ดงานขายเสมอ ไม่ว่าใครเปิด (หัวหน้า/ออปส์กรองรายคนได้ด้วย Dash.rep) */
    var qs = PAGE === 'sales' ? '?view=sales' + (REP ? '&rep=' + encodeURIComponent(REP) : '') : '';
    return PX.get('/api/dashboard' + qs).then(function (j) { DATA = j; AT = Date.now(); ROLE = j.role; return j; });
  }
  function pill(k, t) { return '<span class="pill2 ' + k + '">' + esc(t) + '</span>'; }
  function sysRow(h) {
    if (!h) return '';
    return '<div class="sys"><span title="ระบบโดยรวม"><i class="' + (h.ok ? '' : 'bad') + '"></i>' + (h.ok ? 'ระบบปกติ' : 'ระบบมีปัญหา') + '</span>' +
      (h.jobs || []).map(function (j) { return '<span title="' + esc(j.detail || '') + '"><i class="' + (j.status === 'fail' ? 'bad' : j.stale ? 'warn' : j.status === 'never' ? 'off' : '') + '"></i>' + esc(j.label) + ' · ' + (j.last_run ? ago(j.last_run) : 'ยังไม่เคยรัน') + '</span>'; }).join('') +
      (h.outbox ? '<span><i class="' + (h.outbox.failed ? 'bad' : h.outbox.queued ? 'warn' : '') + '"></i>LINE รอส่ง ' + h.outbox.queued + ' · ล้มเหลว ' + h.outbox.failed + '</span>' : '') +
      '<a href="/log" style="font-size:11px;color:var(--blue);text-decoration:none">ดู log →</a></div>';
  }
  function alerts(list) {
    return (list || []).map(function (a) { return '<div class="al ' + (a.level === 'bad' ? '' : 'warn') + '"><b>' + (a.level === 'bad' ? '⛔' : '⚠') + ' ' + esc(a.title) + '</b><span style="color:var(--tx-2)">' + esc(a.detail || '') + '</span>' +
      '<button class="btn" style="padding:3px 9px;font-size:11px" onclick="Dash.ack(' + a.id + ')">รับทราบ</button></div>'; }).join('');
  }

  /* ── พี่หมิง ── */
  function bossHtml(d) {
    var s = d.deals, tot = s.customers || 1, closed = s.won + s.lost, pct = Math.round(s.won / tot * 100);
    var mReal = d.realMargin, mCen = d.centralMargin, tone = mReal == null ? 'n' : mReal >= 15 ? 'g' : mReal >= 12 ? 'a' : 'r';
    return '<section class="fhd card" id="fhDash"><h2>ผลลัพธ์รอบ ' + esc(d.round) + '</h2><p class="sub">ปิดได้กี่เจ้า · margin ที่ได้จริงเทียบราคากลาง · วันนี้ ' + esc(d.today) + '</p>' +
      '<div class="grid">' +
      '<div class="k lead"><div class="kt"><span class="ic">🤝</span><span class="pill">' + pct + '% ของลูกค้า</span></div><div class="lb">ปิดดีลได้แล้ว</div><div class="v">' + s.won + '<small>/' + tot + ' เจ้า</small></div><div class="c">เสีย ' + s.lost + ' · ยังเปิดอยู่ ' + (tot - closed) + '</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">📊</span>' + pill(tone, mReal == null ? 'ยังไม่มีดีลปิด' : mReal >= 15 ? 'ถึงเป้า' : mReal >= 12 ? 'เหนือ floor' : 'ต่ำกว่า floor') + '</div><div class="lb">margin จริง (ราคาที่ลูกค้าตกลง)</div><div class="v">' + (mReal == null ? '—' : mReal + '<small>%</small>') + '</div><div class="c">ราคากลางตั้งไว้ ' + (mCen == null ? '—' : mCen + '%') + ' · สัญญาเฉลี่ย ' + (d.contractMargin == null ? '—' : d.contractMargin + '%') + (mReal != null && mCen != null ? ' · ส่วนต่าง ' + (mReal - mCen > 0 ? '+' : '') + Math.round((mReal - mCen) * 10) / 10 + ' จุด' : '') + '</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">💰</span></div><div class="lb">มูลค่าที่ปิดได้ / สัปดาห์</div><div class="v sm">฿' + money(s.value || 0) + '</div><div class="c">กำไรขั้นต้น ฿' + money(s.gp || 0) + ' · เสียไป ฿' + money(s.lostValue || 0) + (s.reasons && s.reasons[0] ? ' (' + esc(s.reasons[0].reason) + ' ' + s.reasons[0].n + ')' : '') + '</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">🧾</span></div><div class="lb">ยอดขายจริงจาก invoice</div><div class="v sm">฿' + money(d.invoices.revenue) + '</div><div class="c">' + d.invoices.n + ' ใบ · margin ' + (d.invoices.margin || 0) + '% · ค้างรับ ฿' + money(d.ar.outstanding || 0) + (d.ar.overdue ? ' · <b style="color:var(--red)">เกินกำหนด ฿' + money(d.ar.overdue) + '</b>' : '') + '</div></div>' +
      '</div>' +
      funnel(d.stages) +
      (d.recentDeals && d.recentDeals.length ? '<div class="sc" style="margin-top:10px"><table class="g"><thead><tr><th>ลูกค้า</th><th>ผล</th><th class="rt">มูลค่า</th><th class="rt">margin</th><th>เหตุผล / ส่วนลดจากราคากลาง</th></tr></thead><tbody>' +
        d.recentDeals.map(function (x) { return '<tr><td><b>' + esc(x.customer) + '</b><div class="rnote">' + esc(String(x.at).slice(0, 16).replace('T', ' ')) + ' · ' + esc(x.by) + '</div></td><td>' + pill(x.outcome === 'won' ? 'g' : 'r', x.outcome === 'won' ? 'ได้ ' + x.agreedN + '/' + x.n : 'เสีย') + '</td><td class="rt">฿' + money(x.value) + '</td><td class="rt">' + (x.margin == null ? '—' : x.margin + '%') + '</td><td style="white-space:normal">' + esc(x.reason || '') + (x.discount ? ' · ลด ' + x.discount + '%' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="hint" style="margin:10px 0 0">ยังไม่มีเจ้าไหนปิดดีลรอบนี้ — เซลล์กด "ปิดดีล" ที่กระดานใบราคาเมื่อลูกค้าตอบครบ</p>') +
      (d.ops ? '<div style="margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--tx-2)"><span>พี่จุ๋มติดอยู่: ราคากลางยังไม่ยืนยัน <b>' + (d.ops.central.need || 0) + '</b> · ใบค้าง <b>' + d.ops.sheetsOpen + '</b> · ต่อรองรอ <b>' + d.ops.requestsOpen + '</b> · ทุนแปลกรอตรวจ <b>' + d.ops.flagsPending + '</b></span><span>เซลล์: ลูกค้าเงียบต้องตาม <b>' + d.followupDue + '</b> · ยังไม่ผูก LINE <b>' + d.lineMissing + '</b></span></div>' : '') +
      '<div style="margin-top:10px">' + sysRow(d.health) + alerts(d.alerts) + '</div></section>';
  }
  function funnel(stages) {
    var tot = stages.reduce(function (a, s) { return a + s.n; }, 0) || 1, col = { draft: 'var(--tx-3)', ready: 'var(--blue)', sent: 'var(--amber)', waiting: 'var(--red)', partial: 'var(--amber)', agreed: 'var(--green)', won: 'var(--green)', lost: 'var(--red)', invoiced: 'var(--teal)' };
    return '<div style="margin-top:12px"><div class="bar">' + stages.filter(function (s) { return s.n; }).map(function (s) { return '<i style="width:' + (s.n / tot * 100) + '%;background:' + col[s.key] + '" title="' + esc(s.label) + ' ' + s.n + '"></i>'; }).join('') + '</div>' +
      '<div class="fun">' + stages.map(function (s) { return '<button type="button" class="' + (FILTER === s.key ? 'on' : '') + '" onclick="Dash.filter(' + jsq(s.key) + ')" style="border-left:4px solid ' + col[s.key] + '">' + esc(s.label) + '<b>' + s.n + '</b></button>'; }).join('') + '</div></div>';
  }

  /* ── พี่จุ๋ม: Pricing Home — เห็นภาพรอบนี้ใน 5 วินาที (ตามเรฟ: การ์ดใหญ่สีน้ำเงิน + กราฟ) ── */
  function opsHtml(d) {
    var st = d.stale, cc = d.central || {}, ps = d.priceSheets || { total: 0, done: 0, handed: 0 }, sc = d.trendScore || {};
    var totalCosted = (cc.approved || 0) + (cc.stale || 0) + (cc.need || 0), pctC = totalCosted ? Math.round((cc.approved || 0) / totalCosted * 100) : 0, pctS = ps.total ? Math.round(ps.done / ps.total * 100) : 0;
    var blocks = [[cc.need || 0, 'ราคากลางยังไม่ยืนยัน (Step 1)', '/pricing', 'r'], [(cc.stale || 0) - (cc.margin_at_risk || 0), 'ราคากลางต้องตรวจใหม่ (ทุน/นโยบายเปลี่ยน)', '/pricing', 'a'], [d.sheetsOpen, 'ใบรายเจ้าที่ยังไม่จบ', '/pricing', 'a'], [d.requestsOpen, 'คำขอต่อรองรอตอบ', '/pricing', 'r'], [d.flagsPending, 'Cost Review Queue — ทุนที่ระบบกันไว้รอคนตัดสิน', '/costs#flags', 'r'], [d.waitingCost || 0, 'SKU ที่ทุนพักไว้ (Waiting for Cost) ตั้งราคาไม่ได้', '/costs#flags', 'r'], [cc.margin_at_risk || 0, 'Margin at Risk — ทุนใหม่ทำให้ราคาที่ยืนยันต่ำกว่าขั้นต่ำ', '/pricing', 'r'], [d.board ? d.board.followupDue : 0, 'ลูกค้าเงียบที่เซลล์ต้องตาม', '/sales', 'a']].filter(function (b) { return b[0] > 0; });
    var next = cc.need ? ['ยืนยันราคากลาง ' + cc.need + ' รายการ', '/pricing'] : d.flagsPending ? ['ตัดสิน Review Queue ' + d.flagsPending + ' รายการ', '/costs#flags'] : d.sheetsOpen ? ['ทำใบรายเจ้าที่เหลือ ' + d.sheetsOpen + ' ใบ', '/pricing'] : d.requestsOpen ? ['ตอบคำขอต่อรอง ' + d.requestsOpen + ' รายการ', '/pricing'] : ['รอบนี้เรียบร้อย — ดูแนวโน้มตลาดก่อนรอบหน้า', '/costs?tab=trend'];
    var hist = d.history || [], last = hist[hist.length - 1], prev = hist[hist.length - 2], dCost = last && prev ? Math.round((last.cost_avg - prev.cost_avg) * 10) / 10 : null;
    var cats = (d.categories || []).filter(function (c) { return c.margin != null; });
    var marketItems = [{ label: 'สด ≤7 วัน', value: st.marketFresh, color: Charts.CAT[2] }, { label: 'เก่า / ใช้คาดการณ์', value: st.marketOld, color: Charts.CAT[4] }, { label: 'ไม่เคยเห็น', value: st.marketBlind, color: '#CBD5E1' }];
    return '<section class="fhd" id="fhDash">' +
      '<div class="grid c3" style="grid-template-columns:1.2fr 1fr 1fr 1fr">' +
      /* hero */
      '<div class="k lead" style="display:flex;flex-direction:column;gap:8px"><div class="kt"><span class="ic">🧮</span><span class="pill">รอบ ' + esc(d.round) + ' · ทุนล่าสุด ' + (st.lastCost ? ago(st.lastCost) : '—') + '</span></div>' +
        '<div class="lb">ความคืบหน้ารอบนี้</div>' +
        '<div style="font-size:12px"><div style="display:flex;justify-content:space-between"><span>Step 1 · ราคากลาง</span><b style="font-family:var(--fn)">' + (cc.approved || 0) + '/' + totalCosted + '</b></div><div class="bar" style="background:rgba(255,255,255,.25);margin:4px 0 8px"><i style="width:' + pctC + '%;background:#fff"></i></div>' +
        '<div style="display:flex;justify-content:space-between"><span>Step 2 · ใบรายเจ้า</span><b style="font-family:var(--fn)">' + ps.done + '/' + ps.total + '</b></div><div class="bar" style="background:rgba(255,255,255,.25);margin:4px 0 8px"><i style="width:' + pctS + '%;background:#fff"></i></div>' +
        '<div style="display:flex;justify-content:space-between"><span>Step 3 · ส่ง Sales แล้ว</span><b style="font-family:var(--fn)">' + ps.handed + '/' + ps.total + '</b></div><div class="bar" style="background:rgba(255,255,255,.25);margin:4px 0 2px"><i style="width:' + (ps.total ? Math.round(ps.handed / ps.total * 100) : 0) + '%;background:#fff"></i></div></div>' +
        '<a href="' + next[1] + '" style="margin-top:auto;display:block;background:#fff;color:var(--blue);text-decoration:none;font-weight:600;font-size:12.5px;padding:8px 12px;border-radius:10px;text-align:center">' + esc(next[0]) + ' →</a></div>' +
      /* ทุนเฉลี่ยรายรอบ */
      '<div class="k"><div class="kt"><span class="ic">📦</span>' + (dCost != null ? pill(dCost > 0 ? 'r' : dCost < 0 ? 'g' : 'n', (dCost > 0 ? '+' : '') + dCost + ' ฿ จากรอบก่อน') : '') + '</div><div class="lb">ทุนเฉลี่ยรายรอบ (฿/กก.)</div><div class="v sm">' + (last ? last.cost_avg : '—') + '</div>' +
        Charts.line({ w: 320, labels: hist.map(function (h) { return h.label; }), series: [{ name: 'ทุนเฉลี่ย', values: hist.map(function (h) { return h.cost_avg; }), color: Charts.CAT[0] }], h: 90, area: true }) +
        '<div class="c">ทุนเก่ากว่า 7 วัน ' + st.costOld + ' · ไม่รู้ทุน ' + st.noCost + ' จาก ' + st.total + ' SKU · <a href="/costs" style="color:var(--blue)">รับทุน →</a>' + (hist.some(function (h) { return h.mock; }) ? '<br><span style="color:var(--amber)">* = รอบจากชุดข้อมูลจำลอง (ทดสอบ) ไม่ใช่ตัวเลขจริง</span>' : '') + '</div></div>' +
      /* margin ตามหมวดเป้า */
      '<div class="k"><div class="kt"><span class="ic">🎯</span>' + pill(cats.some(function (c) { return c.state === 'bad'; }) ? 'r' : 'g', cats.filter(function (c) { return c.state === 'bad'; }).length + ' หมวดต่ำกว่าเป้า') + '</div><div class="lb">margin จริง vs เป้ารายหมวด</div>' +
        Charts.bars({ w: 320, items: cats.map(function (c) { return { label: c.name.replace('ชิ้นส่วน', '').replace('สินค้า', ''), value: c.margin, sub: 'เป้า ' + c.target + '%', color: c.state === 'bad' ? '#DC2626' : c.state === 'warn' ? '#D97706' : Charts.CAT[0] }; }), h: 110, unit: '%', labelAll: true }) +
        '<div class="c">แท่งแดง = ต่ำกว่าเป้าหมวด · <a href="/guard" style="color:var(--blue)">แก้เป้า →</a></div></div>' +
      /* ตลาด */
      '<div class="k"><div class="kt"><span class="ic">📈</span>' + pill(sc.pct == null ? 'n' : sc.pct >= 60 ? 'g' : 'a', 'เตือนถูก ' + (sc.pct == null ? '—' : sc.pct + '%')) + '</div><div class="lb">ราคาตลาดที่ใช้ตัดสินได้</div>' +
        Charts.donut({ items: marketItems, size: 96, center: { big: String(st.marketFresh), small: 'จาก ' + st.total } }) +
        '<div class="c" style="margin-top:6px">' + (d.trendWarnings && d.trendWarnings[0] ? esc(d.trendWarnings[0].text.slice(0, 70)) + '… ' : '') + '<a href="/costs?tab=trend" style="color:var(--blue)">แนวโน้ม →</a></div></div>' +
      '</div>' +
      '<div style="margin-top:10px">' + sysRow(d.health) + alerts(d.alerts) + '</div></section>' +
      /* ส่วนล่างของหน้า (V32: ย้ายงานที่ติด + Cost Review Queue ลงล่างสุด) */
      '<section class="fhd" id="fhDashBottom"><h3 style="margin:0 0 8px;font-size:13px">งานที่ติดอยู่ · Cost Review Queue <span class="sub" style="font-weight:400;color:var(--tx-3)">รายละเอียดท้ายหน้า — ข้างบนคือภาพรวมและสิ่งที่ต้องตัดสินใจ</span></h3>' +
      '<div class="grid c3" style="margin-top:10px;grid-template-columns:1fr 1.4fr">' +
      '<div class="k"><div class="kt"><span class="ic">🚧</span>' + pill(blocks.length ? 'r' : 'g', blocks.length ? 'ติด ' + blocks.length + ' จุด' : 'ไม่ติดอะไร') + '</div><div class="lb">งานที่ติดอยู่ · กดไปทำ</div>' +
        (blocks.length ? '<ul class="blk" style="margin-top:6px">' + blocks.map(function (b) { return '<li><b style="color:var(--' + (b[3] === 'r' ? 'red' : 'amber') + ')">' + b[0] + '</b>' + esc(b[1]) + '<a href="' + b[2] + '">ไปทำ →</a></li>'; }).join('') + '</ul>' : '<div class="v">✓</div><div class="c">ราคากลางครบ ใบรายเจ้าจบ ไม่มีคำขอค้าง</div>') + '</div>' +
      '<div class="k"><div class="kt"><span class="ic">🧪</span>' + pill(d.flagsPending ? 'r' : 'g', d.flagsPending ? 'รอตรวจ ' + d.flagsPending : 'ไม่มีค้าง') + '</div><div class="lb">Cost Review Queue · ระบบรับทุนปกติเอง คนตัดสินเฉพาะที่ติด' + (d.batches && d.batches[0] ? ' · batch ล่าสุด ' + esc(d.batches[0].id) + ' auto ' + d.batches[0].auto + '/' + d.batches[0].rows : '') + '</div>' +
        (d.flags && d.flags.length ? '<div class="list" style="margin-top:6px">' + d.flags.slice(0, 4).map(function (f) { return '<div class="row"><div><b>' + esc(f.name) + '</b><small>' + esc(f.raw !== f.name ? 'ในไฟล์: ' + f.raw : '') + '</small></div><div>' + (f.prev || '—') + ' → <b style="color:var(--red)">' + f.cost + ' ฿</b></div><div style="font-size:11px;color:var(--tx-2)">' + esc(f.reasons.join(' · ')) + '</div><div class="act"><button class="pri" onclick="Dash.flag(' + f.id + ',true)">ใช้ค่านี้</button><button onclick="Dash.flag(' + f.id + ',false)">ไม่ใช้</button></div></div>'; }).join('') + (d.flags.length > 4 ? '<a href="/costs#flags" style="font-size:12px;color:var(--blue)">ดูทั้งหมด ' + d.flagsPending + ' →</a>' : '') + '</div>' : '<div class="c" style="margin-top:6px">ด่านตรวจ: ทุน ≤10 · กระโดด ≥30% · สูงกว่าราคาขาย · ต่ำกว่าครึ่งหมวด — ไฟล์รอบล่าสุดไม่มีตัวแปลก</div>') + '</div>' +
      '</div>' +
      (d.trendWarnings && d.trendWarnings.length > 1 ? '<ul class="blk" style="margin-top:10px">' + d.trendWarnings.slice(1, 4).map(function (w) { return '<li>' + pill(w.level === 'bad' ? 'r' : w.level === 'good' ? 'g' : 'a', w.grp || 'ระบบ') + '<span>' + esc(w.text) + '</span></li>'; }).join('') + '</ul>' : '') +
      '</section>';
  }

  /* ── เซลล์: กระดานใบราคา ── */
  /* ── แดชบอร์ดเซลล์ตาม SALES LOGIC: Performance → Pipeline → My Work Today → Response Board → Recently Closed · เฉพาะลูกค้าของคนนี้ ── */
  var SQC = { waiting_pricing: 'n', ready: 'b', send_failed: 'r', sent: 'a', waiting_customer: 'a', partial: 'a', followup_due: 'r', decide: 'r', waiting_revision: 'n', revised_ready: 'r', accepted: 'g', won: 'g', lost: 'r', invoiced: 'g' };
  var PIPE = [['waiting_pricing', 'ยังไม่ใช่งานเซลล์'], ['ready', 'เซลล์ต้องส่ง'], ['waiting_customer', 'ส่งแล้ว'], ['followup_due', 'ต้องทำวันนี้'], ['waiting_revision', 'Pricing กำลังทำ'], ['revised_ready', 'ส่งราคาใหม่'], ['won', 'ปิดได้'], ['lost', 'เสียดีล']];
  function baht(n) { return n == null ? '—' : n >= 1e6 ? '฿' + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : n >= 1e3 ? '฿' + Math.round(n / 1e3) + 'K' : '฿' + n; }
  function hrs(h) { return h == null ? '' : h < 48 ? h + ' ชม.' : Math.round(h / 24) + ' วัน'; }
  function actBtn(r) {
    var a = r.action; if (!a) return '';
    var k = a.key, fn = k === 'send' || k === 'resend' ? 'Dash.review(' + jsq(r.id) + ')' : k === 'send_revised' ? 'Dash.sendLine(' + jsq(r.id) + ',\'revised\')' : k === 'close_won' ? 'Dash.close(' + jsq(r.id) + ',' + jsq(r.name) + ')' : k === 'decide' ? 'Dash.decide(' + jsq(r.id) + ',' + jsq(r.name) + ')' : 'Dash.follow(' + jsq(r.id) + ',' + jsq(r.name) + ')';
    return '<button class="pri" onclick="' + fn + '">' + esc(a.label) + '</button>';
  }
  function whyRow(r) {
    var L = r.lines || {};
    switch (r.state) {
      case 'revised_ready': return 'Pricing ตัดสินราคาต่อรองแล้ว' + (r.nego[0] ? ' · ' + esc(r.nego[0].product) + ' ' + (r.nego[0].offered || '') + ' → ' + (r.nego[0].final || '') + ' ฿' : '') + ' · รอบ ' + r.round + ' — ลูกค้ารออยู่';
      case 'send_failed': return 'LINE ส่งไม่สำเร็จ: ' + esc(r.lineError || '') + ' — ลูกค้ายังไม่ได้ราคา';
      case 'accepted': return 'ลูกค้าตอบรับครบ ' + L.accepted + '/' + L.total + ' รายการ — ยังไม่บันทึก Won';
      case 'decide': return 'ส่งไป ' + hrs(r.sentH) + ' ยังไม่ตอบ · ระบบตามแล้ว ' + r.reminders + ' ครั้ง — ตามต่อหรือปิด Lost (ไม่ตอบ)';
      case 'followup_due': return 'เงียบ ' + hrs(r.silentH) + (r.opened ? ' · เปิดใบแล้วแต่ยังไม่ตอบ' : ' · ยังไม่เปิดใบ') + (r.reminders ? ' · ระบบตามแล้ว #' + r.reminders : '') + ' — SLA ' + (DATA.sla ? DATA.sla.responseH : 48) + ' ชม.';
      case 'ready': return 'Pricing ส่งใบมา ' + ago(r.handedAt) + (r.line ? ' · พร้อมส่ง LINE' : ' · ยังไม่ผูก LINE — ส่งลิงก์/โทร');
      case 'waiting_revision': return 'ส่งคำขอต่อรองแล้ว · รอ Pricing ตอบ (รอบ ' + r.round + ')';
      case 'waiting_pricing': return 'Pricing ยังไม่ส่งราคามา — ไม่ใช่งานค้างของเซลล์';
      case 'partial': return 'ตอบแล้ว ' + L.answered + '/' + L.total + (L.negotiating ? ' · ต่อรอง ' + L.negotiating : '') + ' · รอที่เหลือ';
      case 'waiting_customer': return 'เปิดใบ ' + ago(r.opened) + ' · ยังไม่ตอบ · ส่งไป ' + hrs(r.sentH) + ' (ยังไม่ถึง SLA)';
      case 'sent': return 'ส่งไป ' + hrs(r.sentH) + ' · ยังไม่เปิดใบ' + (r.channel ? ' · ' + (CHAN[r.channel] || r.channel) : '');
      default: return r.outcome ? (r.outcome.outcome === 'won' ? 'ปิดได้ ' + (r.outcome.valueBasis === 'actual' ? baht(r.outcome.value) : 'ยังไม่ใส่ปริมาณ') : 'เสีย · ' + esc(r.outcome.reason || '')) : '';
    }
  }
  function saleHtml(d) {
    var P = d.perf || {}, pipe = d.pipeline || {}, work = d.work || [], waiting = d.waiting || [], closed = d.closed || [];
    var mine = d.rep ? d.rep.name : (d.viewer && d.viewer !== 'sale' ? 'ทุกคน' : 'ทีมขาย');
    var repChips = d.reps ? '<div class="fun" style="margin:0 0 10px"><button class="' + (!REP ? 'on' : '') + '" onclick="Dash.rep(\'\')">ทุกคน <b>' + d.reps.reduce(function (a, r) { return a + r.customers; }, 0) + '</b></button>' +
      d.reps.map(function (r) { return '<button class="' + (REP === r.id ? 'on' : '') + '" onclick="Dash.rep(' + jsq(r.id) + ')" title="งานค้าง ' + r.work + ' · Won ' + r.won + ' · Lost ' + r.lost + '">' + esc(r.name) + ' <b>' + r.customers + '</b>' + (r.work ? ' <span style="color:var(--red)">●' + r.work + '</span>' : '') + '</button>'; }).join('') +
      (d.provisional ? '<span style="font-size:11px;color:var(--amber);align-self:center">มอบหมายลูกค้าไว้ชั่วคราว — ยืนยันตัวจริงที่ POST /api/reps</span>' : '') + '</div>' : '';
    var pipeCount = function (k) { return k === 'waiting_customer' ? (pipe.sent || 0) + (pipe.waiting_customer || 0) + (pipe.partial || 0) + (pipe.accepted || 0) : k === 'followup_due' ? (pipe.followup_due || 0) + (pipe.decide || 0) : k === 'won' ? (pipe.won || 0) + (pipe.invoiced || 0) : k === 'ready' ? (pipe.ready || 0) + (pipe.send_failed || 0) : (pipe[k] || 0); };
    var h = '<section class="fhd card" id="fhDash"><h2>My Sales Performance · ' + esc(mine) + ' <span style="font-weight:400;color:var(--tx-3);font-size:12px">รอบ ' + esc(d.round) + '</span></h2><p class="sub">เฉพาะลูกค้าที่ตัวเองถือ · ระบบบอกว่า "เจ้าไหนต้องทำอะไรต่อ" ไม่ใช่รายชื่อลูกค้า · SLA ตอบกลับ ' + (d.sla ? d.sla.responseH : 48) + ' ชม. · วันนี้ ' + esc(d.today) + '</p>' + repChips +
      /* Row 1 — Performance */
      '<div class="grid">' +
      '<div class="k lead"><div class="kt"><span class="ic">💼</span>' + pill('', 'My Portfolio') + '</div><div class="lb">ลูกค้า ' + P.customers + ' เจ้า · Active ' + P.active + '</div><div class="v">' + (P.valueKnown ? baht(P.portfolioValue) : '—') + '<small>/เดือน</small></div>' +
        '<div class="c">' + (P.valueKnown ? 'มูลค่าจาก ' + P.valueKnown + ' เจ้า' : 'ยังไม่มีมูลค่ารายเจ้า') + (P.valueUnknown ? ' · ยังไม่ระบุ ' + P.valueUnknown + ' เจ้า (ออปส์ใส่ value_month)' : '') + '</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">📨</span>' + pill(P.quoteSentPct >= 80 ? 'g' : 'a', 'Quote Sent ' + P.quoteSentPct + '%') + '</div><div class="lb">ส่งราคาแล้ว</div><div class="v">' + P.quoteSent + '<small>/' + P.customers + ' เจ้า</small></div>' +
        '<div class="c">Delivery ' + (P.deliveryPct == null ? '—' : P.deliveryPct + '%') + ' (ส่ง ÷ ที่ Pricing ส่งมา) · Response ' + (P.responsePct == null ? '—' : P.responsePct + '%') + ' (' + P.responded + ' เจ้าตอบ)</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">🤝</span>' + pill('g', 'Won ' + P.won) + '</div><div class="lb">ปิดได้ · มูลค่า</div><div class="v">' + (P.wonValueKnown ? baht(P.wonValue) : P.won) + (P.wonValueKnown ? '' : '<small> เจ้า</small>') + '</div>' +
        '<div class="c">Lost ' + P.lost + ' เจ้า' + (P.lostValue ? ' · ' + baht(P.lostValue) : '') + ' · เปิดอยู่ ' + P.open + (P.won && !P.wonValueKnown ? ' · ใส่ปริมาณตอนปิดดีลเพื่อคิดมูลค่า' : '') + '</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">🎯</span>' + pill(P.winRate == null ? 'n' : P.winRate >= 60 ? 'g' : 'a', 'Win Rate') + '</div><div class="lb">Won ÷ (Won + Lost)</div><div class="v">' + (P.winRate == null ? '—' : P.winRate + '<small>%</small>') + '</div>' +
        '<div class="c">Value win rate ' + (P.valueWinRate == null ? '— (ต้องมีมูลค่า)' : P.valueWinRate + '%') + ' · Follow-up ใน SLA ' + (P.followupSlaPct == null ? '—' : P.followupSlaPct + '%') + (P.followupOverdue ? ' · เกิน SLA ' + P.followupOverdue : '') + '</div></div>' +
      '</div>' +
      /* Row 2 — Pipeline */
      '<div class="fun" style="margin:12px 0 4px">' + PIPE.map(function (p) { var k = p[0], n = pipeCount(k); return '<button class="' + (FILTER === k ? 'on' : '') + '" onclick="Dash.filter(' + jsq(k) + ')" title="' + esc(p[1]) + '"><span class="pill2 ' + SQC[k] + '" style="margin:0 4px 0 0;padding:1px 6px">' + esc((d.states || {})[k] || k) + '</span><b>' + n + '</b></button>'; }).join('') + (pipe.send_failed ? '<button class="' + (FILTER === 'send_failed' ? 'on' : '') + '" onclick="Dash.filter(\'send_failed\')" style="border-color:var(--red)"><span class="pill2 r" style="margin:0 4px 0 0;padding:1px 6px">⚠ ส่งไม่สำเร็จ</span><b>' + pipe.send_failed + '</b></button>' : '') + '</div>' +
      '<div class="sub" style="margin:0 0 8px">รอ Pricing / รอ Pricing ตอบ = ไม่ใช่งานค้างของเซลล์ · ส่งแล้ว = รอลูกค้าภายใน SLA · ต้องตาม / ราคาใหม่ / ตอบรับ = งานของเซลล์</div>';
    /* Row 3 — My Work Today */
    var rows = FILTER === 'all' ? work : (d.board || []).filter(function (r) { return r.state === FILTER || (FILTER === 'waiting_customer' && ['sent', 'waiting_customer', 'partial', 'accepted'].indexOf(r.state) >= 0) || (FILTER === 'followup_due' && (r.state === 'followup_due' || r.state === 'decide')) || (FILTER === 'won' && (r.state === 'won' || r.state === 'invoiced')) || (FILTER === 'ready' && (r.state === 'ready' || r.state === 'send_failed')); });
    var total = rows.length; if (!SHOW_ALL && rows.length > 8) rows = rows.slice(0, 8);
    h += '<h3 style="font-size:13.5px;margin:10px 0 6px">' + (FILTER === 'all' ? 'My Work Today — ต้องทำ <b style="color:' + (work.length ? 'var(--red)' : 'var(--green)') + '">' + work.length + '</b> งาน <span style="font-weight:400;color:var(--tx-3)">· กำลังรอคนอื่น ' + waiting.length + ' (ไม่นับเป็นงานค้าง)</span>' : esc((d.states || {})[FILTER] || FILTER) + ' <span style="font-weight:400;color:var(--tx-3)">' + total + ' เจ้า · <a href="#" onclick="Dash.filter(\'all\');return false" style="color:var(--blue)">กลับไป My Work</a></span>') + '</h3>' +
      '<div class="list">' + (rows.length ? rows.map(function (r, i) { return workRow(r, FILTER === 'all' ? i + 1 : null, !!d.reps && !REP); }).join('') : '<p class="hint">' + (FILTER === 'all' ? '✓ ไม่มีงานค้างของเซลล์ — ที่เหลือกำลังรอ Pricing/ลูกค้า' : 'ไม่มีเจ้าในสถานะนี้') + '</p>') + '</div>' +
      (total > rows.length || SHOW_ALL ? '<div style="margin-top:8px"><button class="btn" onclick="Dash.toggleAll()">' + (SHOW_ALL ? 'ย่อเหลือ 8 เจ้า' : 'ดูทั้งหมด ' + total + ' เจ้า →') + '</button></div>' : '');
    /* Row 4 — Customer Response Board */
    var board = (d.board || []).filter(function (r) { return r.priority < 9; });
    h += '<h3 style="font-size:13.5px;margin:14px 0 6px">Customer Response Board <span style="font-weight:400;color:var(--tx-3)">· ทุกเจ้าที่ยังเปิดอยู่ ' + board.length + ' · เรียงตามความเร่งด่วน</span></h3>' +
      '<div class="sc"><table class="g" style="min-width:720px"><thead><tr><th style="text-align:left">ลูกค้า</th><th>มูลค่า/เดือน</th><th style="text-align:left">สถานะ</th><th style="text-align:left">ความเคลื่อนไหวล่าสุด</th><th style="text-align:left">ตอบ</th><th style="text-align:left">ทำต่อ</th></tr></thead><tbody>' +
      (board.length ? board.slice(0, SHOW_ALL ? 200 : 12).map(function (r) { var L = r.lines || {}; return '<tr><td style="text-align:left"><b>' + esc(r.name) + '</b>' + (d.reps && !REP && r.ownerName ? ' <span class="pill2 n">' + esc(r.ownerName) + '</span>' : '') + '</td><td>' + (r.value != null ? baht(r.value) : '—') + '</td>' +
        '<td style="text-align:left">' + pill(SQC[r.state] || 'n', r.label) + (r.round > 1 ? ' <small>รอบ ' + r.round + '</small>' : '') + '</td><td style="text-align:left;font-size:11.5px;color:var(--tx-2)">' + (r.lastActivity ? esc(r.lastActivity.text) + ' <span style="color:var(--tx-3)">' + ago(r.lastActivity.at) + '</span>' : (r.sentAt ? 'ส่ง ' + ago(r.sentAt) : r.handedAt ? 'Pricing ส่งมา ' + ago(r.handedAt) : '—')) + '</td>' +
        '<td style="text-align:left;font-size:11.5px">' + (r.sentAt ? L.answered + '/' + L.total + (L.negotiating ? ' · ต่อรอง ' + L.negotiating : '') + (r.opened ? '' : ' · <span style="color:var(--amber)">ยังไม่เปิด</span>') : '—') + '</td>' +
        '<td style="text-align:left;font-size:11.5px">' + (r.action ? '<b style="color:var(--blue)">' + esc(r.action.label) + '</b>' : r.waitingOn === 'pricing' ? 'รอ Pricing' : 'รอลูกค้า') + ' <button class="btn" style="padding:2px 8px;font-size:11px;margin-left:4px" onclick="openSheet(' + jsq(r.id) + ')">เปิดใบ</button></td></tr>'; }).join('') : '<tr><td colspan="6" class="hint">ไม่มีเจ้าที่เปิดอยู่</td></tr>') + '</tbody></table></div>';
    /* Row 5 — Recently Closed */
    h += '<h3 style="font-size:13.5px;margin:14px 0 6px">Recently Closed <span style="font-weight:400;color:var(--tx-3)">· Won ' + P.won + ' · Lost ' + P.lost + '</span></h3>' +
      (closed.length ? '<div class="sc"><table class="g" style="min-width:600px"><thead><tr><th style="text-align:left">ลูกค้า</th><th>ผล</th><th>มูลค่า</th><th>รายการที่ตกลง</th><th>รอบต่อรอง</th><th style="text-align:left">เอกสาร / เหตุผล</th><th></th></tr></thead><tbody>' +
        closed.map(function (r) { var o = r.outcome; return '<tr><td style="text-align:left"><b>' + esc(r.name) + '</b><br><small style="color:var(--tx-3)">' + ago(o.at) + '</small></td><td>' + pill(o.outcome === 'won' ? 'g' : 'r', o.outcome === 'won' ? 'WON' : 'LOST') + '</td><td>' + (o.outcome === 'won' ? (o.valueBasis === 'actual' ? baht(o.value) : '<span style="color:var(--amber)">ยังไม่ใส่ปริมาณ</span>') : (r.value != null ? baht(r.value) : '—')) + '</td><td>' + (o.finalLines || 0) + '/' + (r.lines ? r.lines.total : 0) + '</td><td>' + (o.rounds || 0) + '</td><td style="text-align:left;font-size:11.5px">' + (o.outcome === 'won' ? (o.docs ? (o.docs.invoice ? pill('g', 'Invoice ' + o.docs.invoice) : o.docs.quotation ? pill('b', 'Quotation ' + o.docs.quotation) + ' ' + pill('n', 'รอ Invoice') : pill('a', 'แอดมินกำลังออก Quotation')) : pill('n', 'ส่งแอดมินแล้ว')) + (o.reason ? ' ' + esc(o.reason) : '') : esc(o.reason || '—')) + '</td><td><button class="btn" style="padding:2px 8px;font-size:11px" onclick="Dash.timeline(' + jsq(r.id) + ',' + jsq(r.name) + ')">ไทม์ไลน์</button></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="hint">ยังไม่มีดีลที่ปิดในรอบนี้ — ทุกใบที่ส่งแล้วต้องจบที่ Won หรือ Lost</p>');
    h += '<div style="margin-top:10px">' + sysRow(d.health) + alerts(d.alerts) + '</div></section>';
    return h;
  }
  function workRow(r, pri, showOwner) {
    var L = r.lines || {};
    return '<div class="row ' + (r.priority <= 2 ? 'due' : '') + '"><div>' + (pri ? '<span class="pill2 ' + (r.priority === 1 ? 'r' : r.priority === 2 ? 'a' : 'b') + '" style="margin-right:6px">P' + r.priority + '</span>' : '') + '<b style="display:inline">' + esc(r.name) + '</b>' + (showOwner && r.ownerName ? ' <span class="pill2 n">' + esc(r.ownerName) + '</span>' : '') + '<small>' + pill(SQC[r.state] || 'n', r.label) + (r.value != null ? ' ' + baht(r.value) + '/เดือน' : '') + '</small></div>' +
      '<div style="grid-column:span 2"><b style="font-weight:500;font-size:12.5px">' + whyRow(r) + '</b><small>' + (r.lastActivity ? esc(r.lastActivity.text) + ' · ' + ago(r.lastActivity.at) : r.sentAt ? 'ส่ง ' + ago(r.sentAt) : '') + (r.sentAt ? ' · Quote V' + r.quoteVersion : '') + '</small></div>' +
      '<div class="act">' + actBtn(r) + (!r.line && r.state !== 'waiting_pricing' ? '<button onclick="Dash.bindLine(' + jsq(r.id) + ',' + jsq(r.name) + ')">ผูก LINE</button>' : '') + '<button onclick="Dash.timeline(' + jsq(r.id) + ',' + jsq(r.name) + ')">ไทม์ไลน์</button><button onclick="openSheet(' + jsq(r.id) + ')">เปิดใบ →</button></div></div>';
  }
  function saleRow(c, showOwner) {
    var tot = c.offerLines || c.lines || 0, ans = (c.accepted || 0) + (c.declined || 0);
    var ch = c.channel ? CHAN[c.channel] || c.channel : null;
    var lineTxt = c.lineStatus === 'queued' ? 'รอส่ง' : c.lineStatus === 'sent' ? 'ส่งถึงแล้ว' : c.lineStatus === 'simulated' ? 'ส่งแล้ว (จำลอง)' : c.lineStatus === 'failed' ? 'ส่งไม่สำเร็จ' : '';
    var acts = [];
    if (c.stage === 'ready' || (c.stage === 'sent' && c.channel !== 'line')) acts.push('<button class="pri" onclick="Dash.sendLine(' + jsq(c.id) + ')">ส่ง LINE</button>');
    if (c.followupDue) acts.push('<button class="pri" onclick="Dash.follow(' + jsq(c.id) + ',' + jsq(c.name) + ')">ตามลูกค้า</button>');
    else if (c.stage === 'sent' || c.stage === 'partial') acts.push('<button onclick="Dash.follow(' + jsq(c.id) + ',' + jsq(c.name) + ')">บันทึกว่าตามแล้ว</button>');
    if (['agreed', 'partial', 'sent'].indexOf(c.stage) >= 0) acts.push('<button ' + (c.stage === 'agreed' ? 'class="pri"' : '') + ' onclick="Dash.close(' + jsq(c.id) + ',' + jsq(c.name) + ')">ปิดดีล</button>');
    if (!c.line && c.stage !== 'draft') acts.push('<button onclick="Dash.bindLine(' + jsq(c.id) + ',' + jsq(c.name) + ')">ผูก LINE</button>');
    acts.push('<button onclick="openSheet(' + jsq(c.id) + ')">เปิดใบ →</button>');
    return '<div class="row ' + (c.followupDue ? 'due' : '') + '"><div><b>' + esc(c.name) + (showOwner && c.ownerName ? ' <span class="pill2 n" style="font-weight:500">' + esc(c.ownerName) + '</span>' : '') + '</b><small>' + pill(STG[c.stage] || 'n', c.label) + (c.outcome && c.outcome.reason ? ' ' + esc(c.outcome.reason) : '') + '</small></div>' +
      '<div><b style="font-weight:500">' + (c.sentAt ? 'ส่ง ' + ago(c.sentAt) + (ch ? ' · ' + ch : '') : c.handedAt ? 'Pricing ส่งมา ' + ago(c.handedAt) : 'รอ Pricing') + '</b><small>' + (lineTxt ? 'LINE: ' + lineTxt + ' · ' : '') + (c.opened ? 'ลูกค้าเปิด ' + ago(c.opened) : c.sentAt ? 'ยังไม่เปิดลิงก์' : '') + (!c.line ? ' · ยังไม่ผูก LINE' : '') + '</small></div>' +
      '<div><b style="font-weight:500">ตอบ ' + ans + '/' + tot + (c.waiting ? ' · <span style="color:var(--red)">ต่อรอง ' + c.waiting + '</span>' : '') + '</b><small>' + (c.followupDue ? '<span style="color:var(--red)">เงียบ ' + c.silentDays + ' วัน — ต้องตาม</span>' : c.lastFollowup ? 'ตามล่าสุด ' + ago(c.lastFollowup.at) + ' (' + esc(c.lastFollowup.channel) + ')' : c.silentDays ? 'เงียบ ' + c.silentDays + ' วัน' : '') + '</small></div>' +
      '<div class="act">' + acts.join('') + '</div></div>';
  }

  /* ── การกระทำ ── */
  function refresh(msg) { return load(true).then(function () { paint(); if (msg) PX.toast(msg); }); }
  function act(p) { if (BUSY) return; BUSY = true; return p.catch(function (e) { PX.toast('ไม่สำเร็จ — ' + esc(e.message), 'bad'); if (e.body && e.body.needLine) { var m = /ของ (.+?) —/.exec(e.message); } }).then(function () { BUSY = false; }); }
  function sendLine(cid, kind) { return act(PX.post('/api/line/send', { customer_id: cid, kind: kind || 'quote' }).then(function (r) { return refresh(r.status === 'queued' ? 'เข้าคิวส่ง LINE แล้ว — ระบบส่งภายใน 20 วินาที' : 'ส่งแล้ว'); }).catch(function (e) { if (e.body && e.body.needLine) { PX.toast(esc(e.message), 'bad'); var c = (DATA.customers || []).filter(function (x) { return x.id === cid; })[0]; bindLine(cid, c ? c.name : cid); return; } throw e; })); }
  function sendAll() { PX.modal({ title: 'ส่ง LINE ทุกเจ้าที่พร้อม', sub: 'เฉพาะเจ้าที่ Pricing ส่งใบมาแล้ว และผูก LINE แล้ว · ข้อความ = ใบราคา + ลิงก์ยืนยัน', okText: 'ส่งเลย', onOk: function (v, close) { return PX.post('/api/line/send-all', { kind: 'quote' }).then(function (r) { close(); return refresh('เข้าคิวส่ง ' + r.sent + ' เจ้า' + (r.skipped.length ? ' · ข้าม ' + r.skipped.length + ' (' + r.skipped.slice(0, 3).map(function (s) { return s.name + ': ' + s.why; }).join(' · ') + ')' : '')); }); } }); }
  function bindLine(cid, name) {
    PX.modal({ title: 'ผูก LINE · ' + name, sub: 'ใส่ LINE user id ของลูกค้า (ได้จาก webhook ตอนลูกค้าทักมา หรือจาก LINE OA) · ใช้ส่งใบราคาและตามงานอัตโนมัติ',
      fields: [{ k: 'line_user_id', label: 'LINE user id', ph: 'U1234567890abcdef…' }, { k: 'contact', label: 'ผู้ติดต่อ / เบอร์ (ถ้ามี)' }], okText: 'บันทึก',
      onOk: function (v, close) { if (!v.line_user_id) { PX.toast('ใส่ LINE user id ก่อน', 'bad'); return false; } return PX.post('/api/customers/' + encodeURIComponent(cid), { line_user_id: v.line_user_id, contact: v.contact }).then(function () { close(); return refresh('ผูก LINE ของ ' + esc(name) + ' แล้ว'); }); } });
  }
  function follow(cid, name) {
    var sel = 'style="width:100%;font-family:var(--ff);font-size:13.5px;padding:9px 12px;border:1px solid var(--line);border-radius:10px"';
    PX.modal({ title: 'ตามลูกค้า · ' + name, sub: 'บันทึกว่าตามแล้วทางไหน · เลือก LINE = ระบบส่งข้อความเตือนให้เอง',
      html: '<label class="fld"><span>ช่องทาง</span><select data-k="channel" ' + sel + '><option value="โทร">โทร</option><option value="line">LINE (ระบบส่งให้)</option><option value="ไลน์เอง">พิมพ์ไลน์เอง</option><option value="ไปพบ">ไปพบ</option></select></label>' +
        '<label class="fld"><span>ผลที่คุย</span><select data-k="result" ' + sel + '><option value="">ยังไม่ได้คุย / ฝากข้อความ</option><option value="จะตอบ">รับปากว่าจะตอบ</option><option value="ขอคิดก่อน">ขอคิดก่อน</option><option value="ขอลด">ขอลดราคา</option></select></label>',
      fields: [{ k: 'note', label: 'โน้ต', type: 'area', rows: 2, ph: 'เช่น คุยกับเฮียแล้ว รอเช็กกับครัว' }, { k: 'next_in_days', label: 'ตามอีกครั้งในกี่วัน', type: 'num', value: 2 }], okText: 'บันทึก',
      onOk: function (v, close) { return PX.post('/api/followups', { customer_id: cid, channel: v.channel, note: v.note, result: v.result, next_in_days: Number(v.next_in_days) || 2 }).then(function () { close(); return refresh('บันทึกการตามของ ' + esc(name) + ' แล้ว'); }); } });
  }
  function close(cid, name) {
    var sel = 'style="width:100%;font-family:var(--ff);font-size:13.5px;padding:9px 12px;border:1px solid var(--line);border-radius:10px"';
    var RS = (DATA && DATA.lostReasons) || { price: 'ราคาสูงไป', competitor: 'ไปเจ้าอื่น', credit: 'เงื่อนไขเครดิต', delivery: 'เงื่อนไขจัดส่ง', no_demand: 'ไม่มีความต้องการ', no_response: 'ไม่ตอบ', postponed: 'เลื่อนไปก่อน', other: 'อื่นๆ' };
    PX.get('/api/sheet?customer=' + encodeURIComponent(cid)).then(function (sh) {
      var offer = (sh.rows || []).filter(function (r) { return r.inOffer; });
      PX.modal({ title: 'ปิดดีล · ' + name, sub: 'Won = บันทึกราคาสุดท้าย + ปริมาณ (มูลค่าจริง) · Lost = ต้องเลือกเหตุผลแบบมีโครงสร้าง · ทุกใบที่ส่งแล้วต้องจบที่ Won หรือ Lost',
        html: '<label class="fld"><span>ผล</span><select data-k="outcome" ' + sel + '><option value="won">WON — ลูกค้ายืนยันซื้อ</option><option value="lost">LOST — ไม่ซื้อ</option></select></label>' +
          '<label class="fld"><span>เหตุผลที่เสีย (บังคับเมื่อ Lost)</span><select data-k="reason_code" ' + sel + '><option value="">—</option>' + Object.keys(RS).map(function (k) { return '<option value="' + k + '">' + esc(RS[k]) + '</option>'; }).join('') + '</select></label>' +
          (offer.length ? '<div style="margin:6px 0 2px;font-size:12px;font-weight:600">ราคาสุดท้าย × ปริมาณ/สัปดาห์ (กก.) — ใส่เฉพาะที่ขายได้</div><div class="sc" style="max-height:220px;overflow:auto"><table class="g" style="min-width:0"><tbody>' +
            offer.map(function (r) { var px = r.accepted != null ? r.accepted : r.offer; return '<tr><td style="text-align:left;font-size:12px">' + esc(r.name) + '<br><small style="color:var(--tx-3)">' + (r.response === 'accept' ? 'ลูกค้ารับ ' : r.response === 'decline' ? 'ลูกค้าไม่เอา ' : '') + px + ' ฿</small></td><td style="width:110px"><input data-qty="' + esc(r.pid) + '" type="number" min="0" step="0.5" placeholder="กก." style="width:100px;font-family:var(--fn);padding:6px 8px;border:1px solid var(--line);border-radius:8px"' + (r.response === 'decline' ? ' disabled' : '') + '></td></tr>'; }).join('') + '</tbody></table></div>' : ''),
        fields: [{ k: 'lost_to', label: 'เสียให้ใคร / ลูกค้าบอกราคาคู่แข่งเท่าไร (ถ้ารู้ — เก็บแยกจากราคาตลาดทางการ)', ph: 'เช่น Betagro 168' }, { k: 'condition', label: 'เงื่อนไข (เครดิต/ส่ง/อื่นๆ)' }, { k: 'note', label: 'โน้ต' }], okText: 'บันทึกผล',
        onOk: function (v, close) {
          if (v.outcome === 'lost' && !v.reason_code) { PX.toast('เลือกเหตุผลที่เสียก่อน', 'bad'); return false; }
          var lines = []; document.querySelectorAll('[data-qty]').forEach(function (i) { if (Number(i.value) > 0) lines.push({ pid: i.dataset.qty, qty: Number(i.value) }); });
          var cp = (String(v.lost_to || '').match(/(\d{2,4})\s*$/) || [])[1];
          return PX.post('/api/deal-close', { customer_id: cid, outcome: v.outcome, reason_code: v.outcome === 'lost' ? v.reason_code : undefined, note: v.note, lost_to: v.lost_to, competitor_price: cp ? Number(cp) : undefined, condition: v.condition, lines: lines })
            .then(function (r) { close(); return refresh(r.outcome === 'won' ? 'ปิดดีล ' + esc(name) + ' WON' + (lines.length ? ' · มูลค่า ' + baht(r.value) + '/สัปดาห์' : ' (ยังไม่ใส่ปริมาณ)') : 'บันทึก ' + esc(name) + ' เป็น LOST'); });
        } });
    }).catch(function (e) { PX.toast(esc(e.message), 'bad'); });
  }
  /* ตรวจก่อนส่ง: ใบที่ Pricing ตั้งให้เจ้านี้ เทียบกับธรรมชาติของลูกค้า (SKU ที่เคยต่อรอง/ขึ้นแรง/สูงกว่าที่เคยตกลง) → โอเคแล้วค่อยส่งลิงก์ทาง LINE */
  function review(cid) {
    PX.get('/api/quote-review?customer=' + encodeURIComponent(cid)).then(function (q) {
      var rows = q.rows.slice().sort(function (a, b) { return b.risk - a.risk; });
      PX.modal({ title: 'ตรวจก่อนส่ง · ' + q.customer, sub: 'ใบราคา V' + q.version + ' · รอบ ' + q.label + ' · ' + q.total + ' รายการ · ' + q.note, okText: q.line && q.lineConfigured ? '📨 ส่งลิงก์ทาง LINE' : '✓ ส่งเองแล้ว (บันทึก)',
        html: '<div class="sc" style="max-height:50vh;overflow:auto"><table class="g" style="min-width:0"><thead><tr><th style="text-align:left">สินค้า</th><th>รอบก่อน</th><th>ราคาใหม่</th><th style="text-align:left">ธรรมชาติลูกค้าเจ้านี้</th></tr></thead><tbody>' +
          rows.map(function (r) { return '<tr' + (r.risk >= 2 ? ' style="background:var(--amber-l)"' : '') + '><td style="text-align:left"><b>' + esc(r.name) + '</b></td><td>' + (r.prev || '—') + '</td><td><b>' + r.price + '</b>' + (r.diff ? ' <small class="' + (r.diff > 0 ? 'neg' : '') + '">(' + (r.diff > 0 ? '+' : '') + r.diff + ')</small>' : '') + '</td><td style="text-align:left;font-size:11.5px">' + (r.flags.length ? r.flags.map(function (f) { return '<span class="pill2 ' + (r.risk >= 2 ? 'a' : 'n') + '" style="margin:1px 2px 1px 0">' + esc(f) + '</span>'; }).join('') : '<span style="color:var(--tx-3)">ไม่เคยต่อรอง</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          channelBox(cid, q) + '<p class="hint" style="margin-top:8px">ลูกค้าจะได้ <b>ลิงก์</b> (ไม่ใช่ไฟล์) เปิดใน LINE แล้วกด รับราคา / ขอต่อรอง / ไม่เอา ทีละรายการ · คำขอต่อรองวิ่งเข้า Pricing เอง · ถ้าคิดว่าราคาไหนไม่น่าผ่าน <button class="lnk3" onclick="openSheet(' + jsq(cid) + ')">เปิดใบขอให้ Pricing ทบทวนก่อน</button>' + (q.link ? ' · <a href="' + esc(q.link) + '" target="_blank" rel="noopener">ดูแบบที่ลูกค้าเห็น</a>' : '') + '</p>',
        onOk: function (v, close) { close(); return q.line && q.lineConfigured ? sendLine(cid) : manualSent(cid, q.customer); } });
    }).catch(function (e) { PX.toast('เปิดไม่ได้ — ' + esc(e.message), 'bad'); });
  }
  /* ช่องทางส่ง: LINE OA พร้อม = ส่งให้เอง · ยังไม่พร้อม = ก๊อปลิงก์ไปวางในแชตเดิม/โทรบอก แล้วกด "ส่งเองแล้ว" (ระบบนับเป็นส่งจริง SLA เริ่ม)
     ลูกค้าผูก LINE ได้เองด้วยโค้ด FH-XXXXX — เซลล์ไม่ต้องไปขอ user id */
  function channelBox(cid, q) {
    var ready = q.line && q.lineConfigured;
    return '<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--app)">' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><b style="font-size:12.5px">ช่องทาง:</b> ' +
      (ready ? '<span class="pill g">LINE OA พร้อมส่ง</span>' : q.line ? '<span class="pill a">ผูก LINE แล้ว · OA ยังไม่ต่อ token — ส่งเองไปก่อน</span>' : '<span class="pill a">ลูกค้ายังไม่ผูก LINE</span>') +
      '<button class="btn" style="padding:4px 10px;font-size:12px" onclick="Dash.copyLink(' + jsq(cid) + ')">🔗 คัดลอกลิงก์ใบราคา</button>' +
      (ready ? '<button class="btn" style="padding:4px 10px;font-size:12px" onclick="Dash.manualSent(' + jsq(cid) + ',' + jsq(q.customer) + ')">ส่งเองแล้ว</button>' : '') + '</div>' +
      (!q.line ? '<div style="font-size:12px;color:var(--tx-2);margin-top:6px">ให้ลูกค้าแอด LINE OA แล้วพิมพ์โค้ด <b style="font-family:var(--fn);font-size:14px;color:var(--blue)">' + esc(q.bindCode || '') + '</b> — ระบบผูกให้เอง รอบหน้าส่งเข้า LINE อัตโนมัติ · <a href="#" onclick="Dash.bindLine(' + jsq(cid) + ',' + jsq(q.customer) + ');return false">หรือใส่ user id เอง</a></div>' : '') + '</div>';
  }
  function copyLink(cid) {
    return PX.post('/api/quote-links', { customer_id: cid, silent: true }).then(function (x) {
      var url = x.url && x.url.indexOf('http') === 0 ? x.url : (location.origin + x.url);
      var done = function () { PX.toast('คัดลอกลิงก์แล้ว · ใช้ได้ถึง ' + esc(x.expires_at || '') + ' — วางในแชตลูกค้าแล้วกด "ส่งเองแล้ว"'); };
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(url).then(done, function () { window.prompt('คัดลอกลิงก์นี้', url); });
      window.prompt('คัดลอกลิงก์นี้', url);
    }).catch(function (e) { PX.toast('สร้างลิงก์ไม่ได้ — ' + esc(e.message), 'bad'); });
  }
  function manualSent(cid, name) {
    return act(PX.post('/api/quote-sent', { customer_id: cid, channel: 'manual' }).then(function () { return refresh('บันทึกว่าส่งใบให้ ' + esc(name || '') + ' แล้ว — เริ่มนับเวลารอคำตอบ'); }));
  }
  /* เงียบเกิน 7 วัน: ตามต่อ (บันทึกการตาม) หรือ ปิด Lost เหตุผล "ไม่ตอบ" */
  function decide(cid, name) {
    PX.modal({ title: 'ตัดสินใจ · ' + name, sub: 'ส่งราคาไปแล้วลูกค้าไม่ตอบเกินกำหนด ระบบตามให้แล้ว — เลือกว่าจะตามต่อเอง หรือปิดเป็น Lost (ไม่ตอบ) จะได้ไม่ค้างในระบบ', okText: 'ปิด Lost — ไม่ตอบ',
      fields: [{ k: 'note', label: 'โน้ต (ถ้ามี)' }],
      html: '<p class="hint" style="margin-bottom:8px">อยากตามต่อ? กด "ยกเลิก" แล้วกด "ตามลูกค้า" แทน — ระบบจะนับ SLA ใหม่</p>',
      onOk: function (v, close) { return PX.post('/api/deal-close', { customer_id: cid, outcome: 'lost', reason_code: 'no_response', note: v.note || '' }).then(function () { close(); return refresh('ปิด ' + esc(name) + ' เป็น Lost (ไม่ตอบ)'); }); } });
  }
  /* ไทม์ไลน์ลูกค้า: ทุกเหตุการณ์ของเจ้านี้เรียงเวลา (คน · ระบบ · ลูกค้า) */
  function timeline(cid, name) {
    PX.get('/api/events?customer=' + encodeURIComponent(cid)).then(function (j) {
      var WHO = { boss: 'Pricing (หัวหน้า)', ops: 'Pricing', sale: 'Sales', admin: 'Admin', system: 'SYSTEM', customer: 'CUSTOMER' };
      PX.modal({ title: 'ไทม์ไลน์ · ' + name, sub: (j.rows || []).length + ' เหตุการณ์ · รูปแบบเดียวกันทั้งคน ระบบ และลูกค้า', ok: false,
        html: '<div style="max-height:60vh;overflow:auto">' + ((j.rows || []).length ? j.rows.map(function (e) { return '<div style="display:grid;grid-template-columns:118px 90px 1fr;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line);font-size:12px"><span style="color:var(--tx-3);font-family:var(--fn)">' + esc(String(e.at).replace('T', ' ').slice(0, 16)) + '</span><b style="color:' + (e.kind === 'system' ? 'var(--violet)' : e.kind === 'customer' ? 'var(--teal)' : 'var(--blue)') + '">' + esc(WHO[e.actor] || e.actor) + '</b><span><b>' + esc(e.action) + '</b>' + (e.status !== 'ok' ? ' <span class="pill2 ' + (e.status === 'fail' ? 'r' : 'a') + '">' + esc(e.status) + '</span>' : '') + (e.detail ? '<br><span style="color:var(--tx-2)">' + esc(e.detail) + '</span>' : '') + '</span></div>'; }).join('') : '<p class="hint">ยังไม่มีเหตุการณ์</p>') + '</div>' });
    }).catch(function (e) { PX.toast(esc(e.message), 'bad'); });
  }
  function flag(id, approve) { var f = (DATA.flags || []).filter(function (x) { return x.id === id; })[0] || {}; if (!approve) return act(PX.post('/api/cost-flags/decide', { id: id, approve: false }).then(function () { return refresh('ไม่ใช้ทุน ' + esc(f.name)); }));
    PX.modal({ title: 'ใช้ทุนนี้ · ' + f.name, sub: (f.reasons || []).join(' · '), fields: [{ k: 'cost', label: 'ทุนที่จะใช้ (แก้ได้)', type: 'num', value: f.cost }], okText: 'ใช้ค่านี้', onOk: function (v, close) { return PX.post('/api/cost-flags/decide', { id: id, approve: true, cost: Number(v.cost) }).then(function () { close(); return refresh('บันทึกทุน ' + esc(f.name) + ' = ' + v.cost + ' ฿'); }); } }); }
  function ack(id) { return act(PX.post('/api/alerts/ack', { id: id }).then(function () { return refresh(); })); }
  function filter(k) { FILTER = FILTER === k ? 'all' : k; SHOW_ALL = FILTER !== 'all'; paint(); }
  function toggleAll() { SHOW_ALL = !SHOW_ALL; paint(); }

  /* ── ยึดกับหน้าแม่: วาดใหม่ทุกครั้งที่หน้าแม่วาดใหม่ ── */
  var PAGE = null, obs = null, REP = '';
  function rep(id) { REP = id || ''; FILTER = 'all'; load(true).then(paint).catch(function () {}); }
  function anchor() {
    if (PAGE === 'exec') { var ph = document.getElementById('exAfterAI'); if (ph) return { el: ph, where: 'afterend' }; var pane = document.querySelector('[data-exec-pane="overview"]'); return pane && !pane.hidden ? { el: pane, where: 'afterbegin' } : null; }   /* หน้าผู้บริหาร: AI Pricing Performance → flow → คอขวด → ตัดสินใจ มาก่อน ผลลัพธ์รอบตามหลัง */
    if (PAGE === 'pricing') { if (window.VIEW !== 'home') return null; var g = document.querySelector('#aiPerf') || document.querySelector('#pxGreet'); return g ? { el: g, where: 'afterend' } : null; }
    if (PAGE === 'sales') { if (window.SHEETID) return null; var g2 = document.querySelector('#pxGreet'); return g2 ? { el: g2, where: 'afterend' } : null; }
    return null;
  }
  function paint() {
    if (!DATA) return;
    var old = document.getElementById('fhDash'); if (old) old.remove(); var oldB = document.getElementById('fhDashBottom'); if (oldB) oldB.remove();
    var a = anchor(); if (!a) return;
    var html = DATA.role === 'boss' ? bossHtml(DATA) : DATA.role === 'ops' ? opsHtml(DATA) : saleHtml(DATA);
    a.el.insertAdjacentHTML(a.where, html);
    if (!document.getElementById('fhDashCss')) document.head.insertAdjacentHTML('beforeend', CSS);
    var bt = document.getElementById('fhDashBottom'), mainEl = document.getElementById('main'); if (bt && mainEl) mainEl.appendChild(bt);   /* ล่างสุดของหน้า */
    /* แบนเนอร์ต่อรองราคา (V32 §7) ต้องอยู่บนสุดใต้คำทักทาย ทั้งหน้าเซลและหน้าตั้งราคา */
    var nb = document.getElementById('negoBanner') || document.getElementById('negoBannerS'), fd = document.getElementById('fhDash'); if (nb && fd && fd.parentElement) fd.parentElement.insertBefore(nb, fd);
    if (window.Charts) Charts.bind(document.getElementById('fhDash'));
  }
  function mount(page) {
    PAGE = page;
    var main = document.getElementById('main'); if (!main) return;
    load().then(function () { paint(); }).catch(function () {});
    obs = new MutationObserver(function () { if (!document.getElementById('fhDash') && anchor()) { if (Date.now() - AT > 20000) load(true).then(paint).catch(function () {}); else paint(); } });
    obs.observe(main, { childList: true, subtree: false });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(true).then(paint).catch(function () {}); });
  }
  return { mount: mount, refresh: refresh, rep: rep, review: review, copyLink: copyLink, manualSent: manualSent, decide: decide, timeline: timeline, filter: filter, toggleAll: toggleAll, sendLine: sendLine, sendAll: sendAll, bindLine: bindLine, follow: follow, close: close, flag: flag, ack: ack };
})();
