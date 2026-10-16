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
    return PX.get('/api/dashboard').then(function (j) { DATA = j; AT = Date.now(); ROLE = j.role; return j; });
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
        '<div class="c">ทุนเก่ากว่า 7 วัน ' + st.costOld + ' · ไม่รู้ทุน ' + st.noCost + ' จาก ' + st.total + ' SKU · <a href="/costs" style="color:var(--blue)">รับทุน →</a></div></div>' +
      /* margin ตามหมวดเป้า */
      '<div class="k"><div class="kt"><span class="ic">🎯</span>' + pill(cats.some(function (c) { return c.state === 'bad'; }) ? 'r' : 'g', cats.filter(function (c) { return c.state === 'bad'; }).length + ' หมวดต่ำกว่าเป้า') + '</div><div class="lb">margin จริง vs เป้ารายหมวด</div>' +
        Charts.bars({ w: 320, items: cats.map(function (c) { return { label: c.name.replace('ชิ้นส่วน', '').replace('สินค้า', ''), value: c.margin, sub: 'เป้า ' + c.target + '%', color: c.state === 'bad' ? '#DC2626' : c.state === 'warn' ? '#D97706' : Charts.CAT[0] }; }), h: 110, unit: '%', labelAll: true }) +
        '<div class="c">แท่งแดง = ต่ำกว่าเป้าหมวด · <a href="/guard" style="color:var(--blue)">แก้เป้า →</a></div></div>' +
      /* ตลาด */
      '<div class="k"><div class="kt"><span class="ic">📈</span>' + pill(sc.pct == null ? 'n' : sc.pct >= 60 ? 'g' : 'a', 'เตือนถูก ' + (sc.pct == null ? '—' : sc.pct + '%')) + '</div><div class="lb">ราคาตลาดที่ใช้ตัดสินได้</div>' +
        Charts.donut({ items: marketItems, size: 96, center: { big: String(st.marketFresh), small: 'จาก ' + st.total } }) +
        '<div class="c" style="margin-top:6px">' + (d.trendWarnings && d.trendWarnings[0] ? esc(d.trendWarnings[0].text.slice(0, 70)) + '… ' : '') + '<a href="/costs?tab=trend" style="color:var(--blue)">แนวโน้ม →</a></div></div>' +
      '</div>' +
      /* แถว 2: งานที่ติด + ทุนแปลก + ระบบ */
      '<div class="grid c3" style="margin-top:10px;grid-template-columns:1fr 1.4fr">' +
      '<div class="k"><div class="kt"><span class="ic">🚧</span>' + pill(blocks.length ? 'r' : 'g', blocks.length ? 'ติด ' + blocks.length + ' จุด' : 'ไม่ติดอะไร') + '</div><div class="lb">งานที่ติดอยู่ · กดไปทำ</div>' +
        (blocks.length ? '<ul class="blk" style="margin-top:6px">' + blocks.map(function (b) { return '<li><b style="color:var(--' + (b[3] === 'r' ? 'red' : 'amber') + ')">' + b[0] + '</b>' + esc(b[1]) + '<a href="' + b[2] + '">ไปทำ →</a></li>'; }).join('') + '</ul>' : '<div class="v">✓</div><div class="c">ราคากลางครบ ใบรายเจ้าจบ ไม่มีคำขอค้าง</div>') + '</div>' +
      '<div class="k"><div class="kt"><span class="ic">🧪</span>' + pill(d.flagsPending ? 'r' : 'g', d.flagsPending ? 'รอตรวจ ' + d.flagsPending : 'ไม่มีค้าง') + '</div><div class="lb">Cost Review Queue · ระบบรับทุนปกติเอง คนตัดสินเฉพาะที่ติด' + (d.batches && d.batches[0] ? ' · batch ล่าสุด ' + esc(d.batches[0].id) + ' auto ' + d.batches[0].auto + '/' + d.batches[0].rows : '') + '</div>' +
        (d.flags && d.flags.length ? '<div class="list" style="margin-top:6px">' + d.flags.slice(0, 4).map(function (f) { return '<div class="row"><div><b>' + esc(f.name) + '</b><small>' + esc(f.raw !== f.name ? 'ในไฟล์: ' + f.raw : '') + '</small></div><div>' + (f.prev || '—') + ' → <b style="color:var(--red)">' + f.cost + ' ฿</b></div><div style="font-size:11px;color:var(--tx-2)">' + esc(f.reasons.join(' · ')) + '</div><div class="act"><button class="pri" onclick="Dash.flag(' + f.id + ',true)">ใช้ค่านี้</button><button onclick="Dash.flag(' + f.id + ',false)">ไม่ใช้</button></div></div>'; }).join('') + (d.flags.length > 4 ? '<a href="/costs#flags" style="font-size:12px;color:var(--blue)">ดูทั้งหมด ' + d.flagsPending + ' →</a>' : '') + '</div>' : '<div class="c" style="margin-top:6px">ด่านตรวจ: ทุน ≤10 · กระโดด ≥30% · สูงกว่าราคาขาย · ต่ำกว่าครึ่งหมวด — ไฟล์รอบล่าสุดไม่มีตัวแปลก</div>') + '</div>' +
      '</div>' +
      (d.trendWarnings && d.trendWarnings.length > 1 ? '<ul class="blk" style="margin-top:10px">' + d.trendWarnings.slice(1, 4).map(function (w) { return '<li>' + pill(w.level === 'bad' ? 'r' : w.level === 'good' ? 'g' : 'a', w.grp || 'ระบบ') + '<span>' + esc(w.text) + '</span></li>'; }).join('') + '</ul>' : '') +
      '<div style="margin-top:10px">' + sysRow(d.health) + alerts(d.alerts) + '</div></section>';
  }

  /* ── เซลล์: กระดานใบราคา ── */
  function saleHtml(d) {
    /* เรียงตามงานที่ต้องทำก่อน · หน้าแรกโชว์ 8 เจ้าแรก (กด "ดูทั้งหมด" ได้) — กระดานต้องไม่ดันของเดิมตกจอ */
    var PRI = { due: 0, waiting: 1, ready: 2, partial: 3, sent: 4, agreed: 5, won: 6, invoiced: 7, lost: 8, draft: 9 };
    var rows = d.customers.filter(function (c) { return FILTER === 'all' || c.stage === FILTER || (FILTER === 'due' && c.followupDue); })
      .sort(function (a, b) { return (a.followupDue ? 0 : PRI[a.stage]) - (b.followupDue ? 0 : PRI[b.stage]) || (b.silentDays - a.silentDays) || a.name.localeCompare(b.name); });
    var total = rows.length; if (!SHOW_ALL && rows.length > 8) rows = rows.slice(0, 8);
    var due = d.followupDue || [];
    return '<section class="fhd card" id="fhDash"><h2>กระดานใบราคา · รอบ ' + esc(d.round) + '</h2><p class="sub">แต่ละเจ้าอยู่ขั้นไหน · ส่งถึงลูกค้าทาง LINE · เงียบเกิน ' + d.followDays + ' วันต้องตาม · ตอบครบแล้วปิดดีล</p>' +
      '<div class="grid">' +
      '<div class="k ' + (due.length ? '' : 'lead') + ' tap" onclick="Dash.filter(\'due\')"><div class="kt"><span class="ic">⏰</span>' + pill(due.length ? 'r' : 'g', due.length ? 'ต้องตามวันนี้' : 'ไม่มีค้าง') + '</div><div class="lb">ลูกค้าเงียบ</div><div class="v">' + due.length + '<small>เจ้า</small></div><div class="c">ส่งแล้วไม่ตอบเกิน ' + d.followDays + ' วัน' + (due.length ? ' · กดเพื่อดูรายชื่อ' : '') + '</div></div>' +
      '<div class="k tap" onclick="Dash.filter(\'ready\')"><div class="kt"><span class="ic">📨</span>' + pill(d.lineReady ? 'b' : 'n', 'พร้อมส่ง LINE ' + d.lineReady) + '</div><div class="lb">Pricing ส่งมาแล้ว ยังไม่ถึงลูกค้า</div><div class="v">' + (d.stages.find(function (s) { return s.key === 'ready'; }) || {}).n + '<small>เจ้า</small></div><div class="c">ยังไม่ผูก LINE ' + d.lineMissing + ' เจ้า' + (d.lineReady ? ' · <button class="lnk3" onclick="Dash.sendAll()">ส่ง LINE ทุกเจ้าที่พร้อม →</button>' : '') + '</div></div>' +
      '<div class="k tap" onclick="Dash.filter(\'waiting\')"><div class="kt"><span class="ic">💬</span>' + pill(d.requests ? 'r' : 'g', 'ต่อรอง') + '</div><div class="lb">รอ Pricing ตอบ / ต้องแจ้งลูกค้า</div><div class="v">' + d.requests + '<small>/ ' + d.revised + '</small></div><div class="c">คำขอที่รอ / ราคาใหม่ที่ Pricing อนุมัติแล้วต้องแจ้งลูกค้า</div></div>' +
      '<div class="k tap" onclick="Dash.filter(\'won\')"><div class="kt"><span class="ic">🤝</span>' + pill('g', 'ปิดได้ ' + d.deals.won) + '</div><div class="lb">ผลรอบนี้</div><div class="v">' + d.deals.won + '<small>ได้ · เสีย ' + d.deals.lost + '</small></div><div class="c">มูลค่าที่ตกลงกัน ฿' + money(d.deals.value || 0) + '</div></div>' +
      '</div>' + funnel(d.stages) +
      '<div class="list" style="margin-top:8px">' + (rows.length ? rows.map(saleRow).join('') : '<p class="hint">ไม่มีเจ้าในขั้นนี้</p>') + '</div>' +
      (total > rows.length || SHOW_ALL ? '<div style="margin-top:8px"><button class="btn" onclick="Dash.toggleAll()">' + (SHOW_ALL ? 'ย่อเหลือ 8 เจ้า' : 'ดูทั้งหมด ' + total + ' เจ้า →') + '</button></div>' : '') +
      '<div style="margin-top:10px">' + sysRow(d.health) + alerts(d.alerts) + '</div></section>';
  }
  function saleRow(c) {
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
    return '<div class="row ' + (c.followupDue ? 'due' : '') + '"><div><b>' + esc(c.name) + '</b><small>' + pill(STG[c.stage] || 'n', c.label) + (c.outcome && c.outcome.reason ? ' ' + esc(c.outcome.reason) : '') + '</small></div>' +
      '<div><b style="font-weight:500">' + (c.sentAt ? 'ส่ง ' + ago(c.sentAt) + (ch ? ' · ' + ch : '') : c.handedAt ? 'Pricing ส่งมา ' + ago(c.handedAt) : 'รอ Pricing') + '</b><small>' + (lineTxt ? 'LINE: ' + lineTxt + ' · ' : '') + (c.opened ? 'ลูกค้าเปิด ' + ago(c.opened) : c.sentAt ? 'ยังไม่เปิดลิงก์' : '') + (!c.line ? ' · ยังไม่ผูก LINE' : '') + '</small></div>' +
      '<div><b style="font-weight:500">ตอบ ' + ans + '/' + tot + (c.waiting ? ' · <span style="color:var(--red)">ต่อรอง ' + c.waiting + '</span>' : '') + '</b><small>' + (c.followupDue ? '<span style="color:var(--red)">เงียบ ' + c.silentDays + ' วัน — ต้องตาม</span>' : c.lastFollowup ? 'ตามล่าสุด ' + ago(c.lastFollowup.at) + ' (' + esc(c.lastFollowup.channel) + ')' : c.silentDays ? 'เงียบ ' + c.silentDays + ' วัน' : '') + '</small></div>' +
      '<div class="act">' + acts.join('') + '</div></div>';
  }

  /* ── การกระทำ ── */
  function refresh(msg) { return load(true).then(function () { paint(); if (msg) PX.toast(msg); }); }
  function act(p) { if (BUSY) return; BUSY = true; return p.catch(function (e) { PX.toast('ไม่สำเร็จ — ' + esc(e.message), 'bad'); if (e.body && e.body.needLine) { var m = /ของ (.+?) —/.exec(e.message); } }).then(function () { BUSY = false; }); }
  function sendLine(cid) { return act(PX.post('/api/line/send', { customer_id: cid, kind: 'quote' }).then(function (r) { return refresh(r.status === 'queued' ? 'เข้าคิวส่ง LINE แล้ว — ระบบส่งภายใน 20 วินาที' : 'ส่งแล้ว'); }).catch(function (e) { if (e.body && e.body.needLine) { PX.toast(esc(e.message), 'bad'); var c = (DATA.customers || []).filter(function (x) { return x.id === cid; })[0]; bindLine(cid, c ? c.name : cid); return; } throw e; })); }
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
    PX.modal({ title: 'ปิดดีล · ' + name, sub: 'บันทึกผลสุดท้ายของรอบนี้ — ได้ = ใช้ราคาที่ลูกค้ายืนยัน · เสีย = ต้องบอกเหตุผล (ผู้บริหารดูว่าเสียเพราะราคาหรือบริการ)',
      html: '<label class="fld"><span>ผล</span><select data-k="outcome" ' + sel + '><option value="won">ได้ลูกค้า — ตกลงราคาแล้ว</option><option value="lost">เสียไป</option></select></label>' +
        '<label class="fld"><span>เหตุผล (ถ้าเสีย)</span><select data-k="reason" ' + sel + '><option value="">—</option><option>เจ้าอื่นถูกกว่า</option><option>ราคาขึ้นมากเกินไป</option><option>คุณภาพ / บริการ</option><option>ส่งช้า</option><option>เลิกสั่ง / ปิดร้าน</option><option>ติดต่อไม่ได้</option></select></label>',
      fields: [{ k: 'lost_to', label: 'เสียให้ใคร (ถ้ารู้)', ph: 'เช่น Betagro / ตลาดสด' }, { k: 'note', label: 'โน้ตเพิ่มเติม' }], okText: 'บันทึกผล',
      onOk: function (v, close) { var reason = v.reason || v.note; return PX.post('/api/deal-close', { customer_id: cid, outcome: v.outcome, reason: v.outcome === 'lost' ? (reason || '') : v.note, lost_to: v.lost_to }).then(function (r) { close(); return refresh(r.outcome === 'won' ? 'ปิดดีล ' + esc(name) + ' ได้ ' + r.agreedN + ' รายการ' : 'บันทึกว่าเสีย ' + esc(name) + ' แล้ว'); }); } });
  }
  function flag(id, approve) { var f = (DATA.flags || []).filter(function (x) { return x.id === id; })[0] || {}; if (!approve) return act(PX.post('/api/cost-flags/decide', { id: id, approve: false }).then(function () { return refresh('ไม่ใช้ทุน ' + esc(f.name)); }));
    PX.modal({ title: 'ใช้ทุนนี้ · ' + f.name, sub: (f.reasons || []).join(' · '), fields: [{ k: 'cost', label: 'ทุนที่จะใช้ (แก้ได้)', type: 'num', value: f.cost }], okText: 'ใช้ค่านี้', onOk: function (v, close) { return PX.post('/api/cost-flags/decide', { id: id, approve: true, cost: Number(v.cost) }).then(function () { close(); return refresh('บันทึกทุน ' + esc(f.name) + ' = ' + v.cost + ' ฿'); }); } }); }
  function ack(id) { return act(PX.post('/api/alerts/ack', { id: id }).then(function () { return refresh(); })); }
  function filter(k) { FILTER = FILTER === k ? 'all' : k; SHOW_ALL = FILTER !== 'all'; paint(); }
  function toggleAll() { SHOW_ALL = !SHOW_ALL; paint(); }

  /* ── ยึดกับหน้าแม่: วาดใหม่ทุกครั้งที่หน้าแม่วาดใหม่ ── */
  var PAGE = null, obs = null;
  function anchor() {
    if (PAGE === 'exec') { var pane = document.querySelector('[data-exec-pane="overview"]'); return pane && !pane.hidden ? { el: pane, where: 'afterbegin' } : null; }
    if (PAGE === 'pricing') { if (window.VIEW !== 'home') return null; var g = document.querySelector('#pxGreet'); return g ? { el: g, where: 'afterend' } : null; }
    if (PAGE === 'sales') { if (window.SHEETID) return null; var g2 = document.querySelector('#pxGreet'); return g2 ? { el: g2, where: 'afterend' } : null; }
    return null;
  }
  function paint() {
    if (!DATA) return;
    var old = document.getElementById('fhDash'); if (old) old.remove();
    var a = anchor(); if (!a) return;
    var html = DATA.role === 'boss' ? bossHtml(DATA) : DATA.role === 'ops' ? opsHtml(DATA) : saleHtml(DATA);
    a.el.insertAdjacentHTML(a.where, html);
    if (!document.getElementById('fhDashCss')) document.head.insertAdjacentHTML('beforeend', CSS);
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
  return { mount: mount, refresh: refresh, filter: filter, toggleAll: toggleAll, sendLine: sendLine, sendAll: sendAll, bindLine: bindLine, follow: follow, close: close, flag: flag, ack: ack };
})();
