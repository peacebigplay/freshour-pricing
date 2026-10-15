/* ══════════════════════════════════════════════════════════════════
   Trend — แท็บ "แนวโน้มตลาด" ในหน้า รับทุน & ตลาด
   หน้าแรก = รายหมวด (ดัชนี 12 เดือน · ทิศ 30/90/365 วัน · ความสดของข้อมูล) → กดหมวด = ราย SKU (เส้นเล็ก 12 เดือน · ราคาล่าสุดต่อคู่แข่ง · ราคาคาดการณ์เมื่อไม่มีการสำรวจ)
   คำเตือนทุกข้อถูกล็อกไว้ตรวจย้อนหลัง → คะแนนเตือนถูก · ข้อมูลจาก connector ที่ดึงเอง + การสำรวจหน้าร้าน ย้อนหลังได้ถึง 1 ปี
   ══════════════════════════════════════════════════════════════════ */
window.Trend = (function () {
  var esc = PX.esc, money = PX.money, ago = PX.ago, T = null, DET = null, G = null, AT = 0, LOADING = false, WIN = 365;
  var CSS = '<style id="trCss">.tr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px}' +
    '.tr-warn{display:flex;flex-direction:column;gap:6px;margin:8px 0 0}.tr-warn div{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-left-width:5px;border-radius:12px;padding:9px 12px;font-size:12.5px;background:#fff}' +
    '.tr-warn div.bad{border-left-color:var(--red);background:#FFF7F7}.tr-warn div.warn{border-left-color:var(--amber);background:#FFFCF2}.tr-warn div.good{border-left-color:var(--green);background:#F3FFF6}' +
    '.dir{font-family:var(--fn);font-weight:600}.dir.up{color:var(--red)}.dir.down{color:var(--green)}.dir.flat{color:var(--tx-3)}' +
    '.gcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin-top:10px}.gc{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:#fff;cursor:pointer;transition:.12s;text-align:left;font-family:var(--ff)}.gc:hover{border-color:var(--blue-b);box-shadow:0 6px 16px -12px rgba(37,99,235,.6)}.gc.on{border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-l)}' +
    '.gc h4{margin:0;font-size:13.5px;display:flex;align-items:center;gap:6px}.gc h4 .dir{margin-left:auto;font-size:12px}.gc .nums{display:flex;gap:10px;font-size:11px;color:var(--tx-3);margin:4px 0 6px}.gc .nums b{font-family:var(--fn);color:var(--ink)}.gc .ft{font-size:10.5px;color:var(--tx-3);margin-top:6px;display:flex;justify-content:space-between}' +
    '.pred{display:grid;grid-template-columns:auto 1fr auto auto;gap:6px 12px;align-items:center;font-size:12px}.pred>div{padding:6px 0;border-bottom:1px dashed var(--line)}' +
    '.tb{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px;align-items:center}.tb button{font-family:var(--ff);font-size:11.5px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 11px;cursor:pointer}.tb button.on{background:var(--ink);color:#fff;border-color:var(--ink)}' +
    '.st{display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px}.st.fresh{background:var(--green-l);color:var(--green)}.st.stale{background:var(--amber-l);color:var(--amber)}.st.old{background:var(--red-l);color:var(--red)}.st.blind{background:var(--line-2);color:var(--tx-3)}' +
    '.est{font-family:var(--fn);color:var(--violet);font-weight:600}.est small{font-family:var(--ff);color:var(--tx-3);font-weight:400}' +
    '@media(max-width:700px){.pred{grid-template-columns:1fr 1fr}}</style>';
  function dirTxt(d) { return d === 'up' ? '▲ ขึ้น' : d === 'down' ? '▼ ลง' : d === 'flat' ? '— ทรงตัว' : '? ไม่รู้'; }
  var pc = function (v) { return v == null ? '—' : (v > 0 ? '+' : '') + v + '%'; };
  var dcls = function (v, th) { th = th || 1; return v == null ? 'flat' : v > th ? 'up' : v < -th ? 'down' : 'flat'; };
  var monthTh = function (m) { var MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; return MON[Number(m.slice(5, 7)) - 1]; };
  function html() {
    if (!T) { if (!LOADING) { LOADING = true; load(true).then(function () { LOADING = false; if (window.redrawTab) redrawTab(); }).catch(function (e) { LOADING = false; PX.toast('อ่านแนวโน้มไม่ได้ — ' + esc(e.message), 'bad'); }); } return '<div class="card"><p class="hint">กำลังอ่านแนวโน้ม…</p></div>'; }
    var t = T, sc = t.score, cov = t.coverage, job = t.job || {};
    var h = '<div class="tr-grid">' +
      '<div class="k lead"><div class="kt"><span class="ic">🎯</span><span class="pill">' + (sc.resolved ? 'ตรวจแล้ว ' + sc.resolved + ' ข้อ' : 'รอตรวจ') + '</span></div><div class="lb">คะแนนเตือนถูก</div><div class="v">' + (sc.pct == null ? '—' : sc.pct + '<small>%</small>') + '</div><div class="c">ถูก ' + sc.hits + ' จาก ' + sc.resolved + ' ที่ครบกำหนด · รอผล ' + sc.open + ' · ทำนายทิศ 30 วันข้างหน้าเมื่อแนวโน้ม 90 วันชัด</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">📚</span><span class="pill ' + (cov.span && cov.span <= t.months[0] + '-15' ? 'g' : 'a') + '">' + (cov.span ? 'ตั้งแต่ ' + esc(cov.span.slice(0, 7)) : '—') + '</span></div><div class="lb">ประวัติราคาตลาดที่เก็บ</div><div class="v">' + money(cov.observations) + '<small>ครั้ง</small></div><div class="c">ทุกรอบที่ดึง/สำรวจ เก็บย้อนหลัง 1 ปี · ใช้คาดการณ์เมื่อออกสำรวจไม่ได้</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">🧩</span><span class="pill ' + (cov.pct >= 30 ? 'g' : 'a') + '">' + cov.pct + '%</span></div><div class="lb">SKU ที่มีราคาตลาดเทียบ</div><div class="v">' + cov.known + '<small>/' + cov.total + '</small></div><div class="c">ที่เหลือใช้ราคาคาดการณ์จากหมวด (ติดป้าย "คาด") จนกว่าจะมีคนสำรวจ</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">🛰</span><span class="pill ' + (job.status === 'ok' ? 'g' : job.status === 'fail' ? 'r' : 'a') + '">' + (job.status === 'ok' ? 'ปกติ' : job.status === 'fail' ? 'ล้ม' : 'ยังไม่เคยรัน') + '</span></div><div class="lb">ดึงราคาเองล่าสุด</div><div class="v" style="font-size:18px">' + (job.last_run ? ago(job.last_run) : '—') + '</div><div class="c">' + esc(job.detail || 'ทุก 24 ชม.') + '</div></div></div>';
    h += '<div class="card"><h3>ช่วงนี้ตลาดไปทางไหน · ควรระวังอะไร <span class="sub">คิดจากราคาคู่แข่งรายหมวด 90 วัน / 1 ปี (ออนไลน์ + สำรวจหน้าร้าน)</span></h3>' +
      (t.warnings.length ? '<div class="tr-warn">' + t.warnings.map(function (w) { return '<div class="' + w.level + '"><b style="white-space:nowrap">' + (w.level === 'bad' ? '⛔' : w.level === 'good' ? '💡' : '⚠') + ' ' + esc(w.grp || 'ระบบ') + '</b><span>' + esc(w.text) + '</span></div>'; }).join('') + '</div>' : '<p class="hint">ยังไม่มีสัญญาณชัด — ตลาดทรงตัว</p>') + '</div>';
    /* ดัชนีรายเดือน: 4 หมวดที่ขยับมากสุด (เส้นเดียวกัน ฐาน = 100) */
    var top = t.groups.filter(function (g) { return g.series.idx.filter(function (v) { return v != null; }).length >= 6; }).slice(0, 4);
    h += '<div class="card" style="margin-top:12px"><h3>ดัชนีราคาตลาด 12 เดือน <span class="sub">เดือนแรกที่มีข้อมูล = 100 · หมวดที่ขยับมากสุด 4 หมวด · ชี้ดูค่าได้</span></h3>' +
      Charts.line({ labels: t.months.map(monthTh), series: top.map(function (g, i) { return { name: g.grp, values: g.series.idx, color: Charts.CAT[i] }; }), h: 170, unit: '' }) + '</div>';
    /* การ์ดรายหมวด */
    h += '<div class="card" style="margin-top:12px"><h3>รายหมวด <span class="sub">กดหมวดเพื่อดูราย SKU</span></h3><div class="gcards">' + t.groups.map(function (g, i) {
      var last = g.lastSeen ? Math.round((Date.parse(t.asOf) - Date.parse(g.lastSeen)) / 864e5) : null;
      return '<button type="button" class="gc ' + (G === g.grp ? 'on' : '') + '" onclick="Trend.pick(' + JSON.stringify(g.grp).replace(/"/g, '&quot;') + ')"><h4>' + esc(g.grp) + '<span class="dir ' + g.direction + '">' + dirTxt(g.direction) + '</span></h4>' +
        '<div class="nums"><span>30 วัน <b class="dir ' + dcls(g.change30) + '">' + pc(g.change30) + '</b></span><span>90 วัน <b class="dir ' + dcls(g.change90) + '">' + pc(g.change90) + '</b></span><span>1 ปี <b class="dir ' + dcls(g.change365, 2) + '">' + pc(g.change365) + '</b></span></div>' +
        Charts.spark(g.series.idx.filter(function (v) { return v != null; }), Charts.CAT[i % Charts.CAT.length], 200, 30) +
        '<div class="ft"><span>' + g.n + ' SKU · ' + money(g.obs) + ' ครั้ง' + (g.survey ? ' · สำรวจ ' + g.survey : '') + '</span><span>' + (last == null ? 'ไม่มีข้อมูล' : last === 0 ? 'ล่าสุดวันนี้' : 'ล่าสุด ' + last + ' วันก่อน') + (g.over + g.under ? ' · แพงกว่า ' + g.over + '/ถูกกว่า ' + g.under : '') + '</span></div></button>'; }).join('') + '</div></div>';
    /* ราย SKU ของหมวดที่เลือก */
    if (G) h += detailHtml();
    h += '<div class="card" style="margin-top:12px"><h3>คำเตือนที่ผ่านมา เตือนถูกกี่ครั้ง <span class="sub">ทุกคำทำนายถูกล็อกไว้ตอนออก แล้วตรวจกับราคาจริงเมื่อครบ 30 วัน — ไม่มีการแก้ย้อนหลัง</span></h3>' +
      (sc.list.length ? '<div class="pred"><div><b>ออกเมื่อ</b></div><div><b>ทำนาย</b></div><div><b>จริง</b></div><div><b>ผล</b></div>' + sc.list.map(function (p) { return '<div>' + esc(p.made_at) + '<div class="rnote">ครบ ' + esc(p.due_at) + '</div></div><div><b>' + esc(p.grp) + '</b> ' + dirTxt(p.predicted) + '<div class="rnote">' + esc(p.basis) + '</div></div><div>' + (p.resolved ? (p.actual == null ? 'ไม่มีข้อมูล' : pc(p.actual) + ' ' + dirTxt(p.actual_dir)) : 'รอ') + '</div><div>' + (p.resolved ? (p.hit == null ? '<span class="pill2">ตรวจไม่ได้</span>' : p.hit ? '<span class="pill2 g">ถูก</span>' : '<span class="pill2 r">ผิด</span>') : '<span class="pill2 a">รอผล</span>') + '</div>'; }).join('') + '</div>' : '<p class="hint">ยังไม่มีคำทำนาย</p>') + '</div>';
    return h;
  }
  function detailHtml() {
    if (!DET || DET.grp !== G) { if (!LOADING) { LOADING = true; PX.get('/api/market-trend?grp=' + encodeURIComponent(G)).then(function (j) { DET = j.detail; LOADING = false; if (window.redrawTab) redrawTab(); setTimeout(function () { var el = document.getElementById('trDetail'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); }).catch(function () { LOADING = false; }); } return '<div class="card" style="margin-top:12px"><p class="hint">กำลังอ่านราย SKU ของ ' + esc(G) + '…</p></div>'; }
    var d = DET, ST = { fresh: 'สด ≤7 วัน', stale: 'เก่า 8–30 วัน', old: 'เก่าเกิน 30 วัน', blind: 'ไม่เคยเห็นราคา' }, cnt = {}; d.skus.forEach(function (s) { cnt[s.status] = (cnt[s.status] || 0) + 1; });
    return '<div class="card" style="margin-top:12px" id="trDetail"><h3>' + esc(G) + ' · ราย SKU <span class="sub">' + d.skus.length + ' SKU · ' + Object.keys(cnt).map(function (k) { return '<span class="st ' + k + '">' + ST[k] + ' ' + cnt[k] + '</span>'; }).join(' ') + (d.ratio ? ' · ราคาส่งตลาด ≈ ' + Math.round(d.ratio * 100) / 100 + '× ของเรา' : '') + '</span></h3>' +
      '<p class="hint">ราคา "คาด" = ไม่มีการดึง/สำรวจล่าสุด ระบบประมาณจากราคาล่าสุด × ดัชนีหมวดที่ขยับ (หรือจากอัตราส่วนหมวดถ้าไม่เคยเห็นเลย) — ใช้ตัดสินเบื้องต้นได้ แต่ควรส่งคนไปดูของจริง</p>' +
      '<div class="sc"><table class="g" style="min-width:720px"><thead><tr><th>SKU</th><th>สถานะ</th><th>12 เดือน · 30/90/365 วัน</th><th class="rt">ล่าสุด (ตลาด)</th><th class="rt">คาดตอนนี้</th><th class="rt">เรา (2kg)</th><th class="rt">ต่าง</th></tr></thead><tbody>' +
      d.skus.map(function (s) { var best = s.comps.filter(function (c) { return c.tier === 'w'; })[0] || s.comps[0], ser = best ? best.series.filter(function (v) { return v != null; }) : [];
        var now = best && best.age <= 7 ? best.price : s.est ? s.est.price : null, gap = now != null && s.our ? s.our - now : null;
        return '<tr><td><b><a href="#" class="lnk2" onclick="PX.product(' + JSON.stringify(s.id).replace(/"/g, '&quot;') + ');return false">' + esc(s.name) + '</a></b><div class="rnote">' + (s.comps.length ? s.comps.map(function (c) { return esc(c.comp) + ' ' + c.price + ' (' + (c.age === 0 ? 'วันนี้' : c.age + ' วัน') + (c.via === 'survey' ? ' · สำรวจ' : '') + ')'; }).join(' · ') : 'ยังไม่มีใครเห็นราคา') + '</div></td>' +
          '<td><span class="st ' + s.status + '">' + ST[s.status] + '</span></td><td>' + (ser.length > 1 ? Charts.spark(ser, Charts.CAT[0], 110, 26) : '<span style="color:var(--tx-3)">—</span>') + (best ? '<div class="rnote" style="font-size:11px"><span class="dir ' + dcls(best.c30) + '">' + pc(best.c30) + '</span> / <span class="dir ' + dcls(best.c90) + '">' + pc(best.c90) + '</span> / <span class="dir ' + dcls(best.c365, 2) + '">' + pc(best.c365) + '</span></div>' : '') + '</td>' +
          '<td class="rt">' + (best ? '<b>' + best.price + '</b><div class="rnote">' + esc(best.comp) + ' · ' + esc(best.seen) + '</div>' : '—') + '</td>' +
          '<td class="rt">' + (best && best.age <= 7 ? '<span style="color:var(--tx-3)">ใช้ราคาจริง</span>' : s.est ? '<span class="est" title="' + esc(s.est.basis) + '">~' + s.est.price + ' <small>คาด · ' + esc(s.est.confidence) + '</small></span>' : '—') + '</td>' +
          '<td class="rt"><b>' + (s.our || '—') + '</b><div class="rnote">ปลีก ' + (s.retail || '—') + '</div></td>' +
          '<td class="rt">' + (gap == null ? '—' : '<span class="dir ' + (gap > 0 ? 'up' : gap < 0 ? 'down' : 'flat') + '">' + (gap > 0 ? 'แพงกว่า ' + gap : gap < 0 ? 'ถูกกว่า ' + (-gap) : 'เท่ากัน') + '</span>') + '</td>' + '</tr>'; }).join('') +
      '</tbody></table></div><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="Intake.survey(\'a\')">ส่งคนไปสำรวจหมวดนี้</button><button class="btn" onclick="Trend.pick(null)">ปิดรายละเอียด</button></div></div>';
  }
  function pick(g) { G = G === g ? null : g; if (window.redrawTab) redrawTab(); if (G) setTimeout(function () { var el = document.getElementById('trDetail'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); }
  function load(force) {
    if (T && !force && Date.now() - AT < 15000) return Promise.resolve(T);
    return PX.get('/api/market-trend').then(function (j) { T = j; AT = Date.now(); DET = null; if (!document.getElementById('trCss')) document.head.insertAdjacentHTML('beforeend', CSS); return T; });
  }
  function syncNow() {
    PX.toast('กำลังดึงราคาจาก connector…');
    fetch('/api/market-feed-sample').then(function (r) { return r.ok ? r.json() : null; }).then(function (f) {
      return PX.post('/api/market-sync/run', { observations: f && f.rows ? f.rows : [] }).then(function (r) { PX.toast('ดึงแล้ว — ใหม่ ' + r.added + ' · SKU ' + r.coverage.known + '/' + r.coverage.total); return load(true).then(function () { if (window.redrawTab) redrawTab(); }); });
    }).catch(function (e) { PX.toast('ดึงไม่ได้ — ' + esc(e.message), 'bad'); });
  }
  return { load: load, html: html, pick: pick, syncNow: syncNow, data: function () { return T; } };
})();
