/* ══════════════════════════════════════════════════════════════════
   Trend — แท็บ "แนวโน้มตลาด" ในหน้า รับทุน & ตลาด
   "ระบบที่บอกว่าช่วงนี้ตลาดไปทางไหน ควรระวังอะไร และต้องมีคะแนนว่าที่เตือนไปถูกกี่ครั้ง"
   ข้อมูลจาก /api/market-trend (connector ดึงเอง + สำรวจหน้าร้าน) · คำทำนายทุกข้อล็อกไว้ตรวจย้อนหลัง
   ══════════════════════════════════════════════════════════════════ */
window.Trend = (function () {
  var esc = PX.esc, money = PX.money, ago = PX.ago, T = null, SERIES = {}, G = 'ทั้งหมด', AT = 0;
  var CSS = '<style id="trCss">.tr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:14px}' +
    '.tr-warn{display:flex;flex-direction:column;gap:6px;margin:8px 0 0}.tr-warn div{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-left-width:5px;border-radius:12px;padding:9px 12px;font-size:12.5px;background:#fff}' +
    '.tr-warn div.bad{border-left-color:var(--red);background:#FFF7F7}.tr-warn div.warn{border-left-color:var(--amber);background:#FFFCF2}.tr-warn div.good{border-left-color:var(--green);background:#F3FFF6}' +
    '.spark{width:100%;height:46px;display:block}.dir{font-family:var(--fn);font-weight:600}.dir.up{color:var(--red)}.dir.down{color:var(--green)}.dir.flat{color:var(--tx-3)}' +
    '.pred{display:grid;grid-template-columns:auto 1fr auto auto;gap:6px 12px;align-items:center;font-size:12px}.pred>div{padding:6px 0;border-bottom:1px dashed var(--line)}' +
    '.tb{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}.tb button{font-family:var(--ff);font-size:11.5px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:4px 11px;cursor:pointer}.tb button.on{background:var(--ink);color:#fff;border-color:var(--ink)}' +
    '@media(max-width:700px){.pred{grid-template-columns:1fr 1fr}}</style>';
  function dirTxt(d) { return d === 'up' ? '▲ ขึ้น' : d === 'down' ? '▼ ลง' : d === 'flat' ? '— ทรงตัว' : '? ไม่รู้'; }
  function spark(items) {
    if (!items || items.length < 2) return '';
    var W = 220, H = 40, lo = Math.min.apply(null, items), hi = Math.max.apply(null, items), rg = hi - lo || 1;
    var pts = items.map(function (v, i) { return (i / (items.length - 1) * W).toFixed(1) + ',' + ((1 - (v - lo) / rg) * (H - 6) + 3).toFixed(1); });
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><polyline fill="none" stroke="var(--blue)" stroke-width="2" points="' + pts.join(' ') + '"/></svg>';
  }
  var LOADING = false;
  function html() {
    if (!T) { if (!LOADING) { LOADING = true; load(true).then(function () { LOADING = false; if (window.redrawTab) redrawTab(); }).catch(function (e) { LOADING = false; PX.toast('อ่านแนวโน้มไม่ได้ — ' + esc(e.message), 'bad'); }); } return '<div class="card"><p class="hint">กำลังอ่านแนวโน้ม…</p></div>'; }
    var t = T, sc = t.score, cov = t.coverage, job = t.job || {}, groups = t.groups.filter(function (g) { return G === 'ทั้งหมด' || g.grp === G; });
    var h = '<div class="tr-grid">' +
      '<div class="k lead"><div class="kt"><span class="ic">🎯</span><span class="pill">' + (sc.resolved ? 'ตรวจแล้ว ' + sc.resolved + ' ข้อ' : 'รอตรวจ') + '</span></div><div class="lb">คะแนนเตือนถูก</div><div class="v">' + (sc.pct == null ? '—' : sc.pct + '<small>%</small>') + '</div><div class="c">ถูก ' + sc.hits + ' จาก ' + sc.resolved + ' ที่ครบกำหนด · รอผล ' + sc.open + ' ข้อ · ทำนายทิศ 7 วันข้างหน้าจากโมเมนตัมของหมวด</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">🛰</span><span class="pill ' + (job.status === 'ok' ? 'g' : job.status === 'fail' ? 'r' : 'a') + '">' + (job.status === 'ok' ? 'ทำงานปกติ' : job.status === 'fail' ? 'ล้ม' : 'ยังไม่เคยรัน') + '</span></div><div class="lb">ดึงราคาเองล่าสุด</div><div class="v" style="font-size:18px">' + (job.last_run ? ago(job.last_run) : '—') + '</div><div class="c">' + esc(job.detail || 'ทุก 24 ชม. · ล้มแล้วขึ้น alert') + '</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">🧩</span><span class="pill ' + (cov.pct >= 30 ? 'g' : 'a') + '">' + cov.pct + '%</span></div><div class="lb">SKU ที่มีราคาตลาดเทียบ</div><div class="v">' + cov.known + '<small>/' + cov.total + '</small></div><div class="c">การเห็นราคาสะสม ' + money(cov.observations) + ' ครั้ง · ที่จับคู่ไม่ได้อยู่ใน log · ที่ไม่มีออนไลน์ไปอยู่ในแผนสำรวจ</div></div>' +
      '<div class="k"><div class="kt"><span class="ic">📦</span></div><div class="lb">ทุนเราขยับ (เทียบรอบก่อน)</div><div class="v" style="font-size:16px;line-height:1.5">' + (t.costMove.length ? t.costMove.filter(function (c) { return c.change != null; }).sort(function (a, b) { return Math.abs(b.change) - Math.abs(a.change); }).slice(0, 4).map(function (c) { return esc(c.grp) + ' <span class="dir ' + (c.change > 1 ? 'up' : c.change < -1 ? 'down' : 'flat') + '">' + (c.change > 0 ? '+' : '') + c.change + '%</span>'; }).join(' · ') : '—') + '</div><div class="c">ตลาดขึ้นน้อยกว่าทุน = margin กำลังบีบ</div></div></div>';
    h += '<div class="card"><h3>ช่วงนี้ตลาดไปทางไหน · ควรระวังอะไร <span class="sub">คิดจากราคาคู่แข่ง 30 วันล่าสุดต่อหมวด (ออนไลน์ + สำรวจหน้าร้าน)</span></h3>' +
      (t.warnings.length ? '<div class="tr-warn">' + t.warnings.map(function (w) { return '<div class="' + w.level + '"><b style="white-space:nowrap">' + (w.level === 'bad' ? '⛔' : w.level === 'good' ? '💡' : '⚠') + ' ' + esc(w.grp || 'ระบบ') + '</b><span>' + esc(w.text) + '</span></div>'; }).join('') + '</div>' : '<p class="hint">ยังไม่มีสัญญาณชัด — ตลาดทรงตัว หรือข้อมูลยังไม่ถึง 7 วัน</p>') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>แนวโน้มรายหมวด</h3><div class="tb">' + ['ทั้งหมด'].concat(t.groups.map(function (g) { return g.grp; })).map(function (k) { return '<button class="' + (G === k ? 'on' : '') + '" onclick="Trend.group(' + JSON.stringify(k).replace(/"/g, '&quot;') + ')">' + esc(k) + '</button>'; }).join('') + '</div>' +
      '<div class="sc"><table class="g" style="min-width:760px"><thead><tr><th>หมวด</th><th>แนวโน้ม</th><th class="rt">7 วัน</th><th class="rt">30 วัน</th><th class="rt">SKU</th><th class="rt">เราแพงกว่า / ถูกกว่า (ราคาส่ง)</th><th>ตัวที่ขยับมากสุด</th></tr></thead><tbody>' +
      (groups.length ? groups.map(function (g) { var top = g.items[0]; return '<tr><td><b>' + esc(g.grp) + '</b>' + spark(SERIES[g.grp]) + '</td><td><span class="dir ' + g.direction + '">' + dirTxt(g.direction) + '</span>' + (g.momentum !== g.direction && g.momentum !== 'unknown' ? '<div class="rnote">7 วัน: ' + dirTxt(g.momentum) + '</div>' : '') + '</td>' +
        '<td class="rt dir ' + (g.change7 > 1 ? 'up' : g.change7 < -1 ? 'down' : 'flat') + '">' + (g.change7 == null ? '—' : (g.change7 > 0 ? '+' : '') + g.change7 + '%') + '</td><td class="rt dir ' + (g.change30 > 2 ? 'up' : g.change30 < -2 ? 'down' : 'flat') + '">' + (g.change30 == null ? '—' : (g.change30 > 0 ? '+' : '') + g.change30 + '%') + '</td><td class="rt">' + g.n + '</td>' +
        '<td class="rt">' + (g.over + g.under ? '<span style="color:var(--red)">' + g.over + '</span> / <span style="color:var(--green)">' + g.under + '</span>' + (g.gapAvg != null ? '<div class="rnote">เฉลี่ย ' + (g.gapAvg > 0 ? '+' : '') + g.gapAvg + ' ฿</div>' : '') : '<span style="color:var(--tx-3)">มีแต่ราคาปลีก</span>') + '</td>' +
        '<td style="white-space:normal">' + (top ? '<a class="lnk2" href="#" onclick="PX.product(' + JSON.stringify(top.id).replace(/"/g, '&quot;') + ');return false">' + esc(top.name) + '</a> <span class="rnote">' + esc(top.comp) + ' ' + top.price + ' ฿ (' + (top.c30 > 0 ? '+' : '') + top.c30 + '%) · เรา ' + top.our + ' ฿</span>' : '—') + '</td></tr>'; }).join('') : '<tr><td colspan="7" style="color:var(--tx-3)">ยังไม่มีข้อมูลตลาดพอ — ดึงออนไลน์ หรือบันทึกจากการสำรวจหน้าร้าน (แท็บแหล่งข้อมูล)</td></tr>') +
      '</tbody></table></div></div>';
    h += '<div class="card" style="margin-top:12px"><h3>คำเตือนที่ผ่านมา เตือนถูกกี่ครั้ง <span class="sub">ทุกคำทำนายถูกล็อกไว้ตอนออก แล้วตรวจกับราคาจริงเมื่อครบ 7 วัน — ไม่มีการแก้ย้อนหลัง</span></h3>' +
      (sc.list.length ? '<div class="pred"><div><b>ออกเมื่อ</b></div><div><b>ทำนาย</b></div><div><b>จริง</b></div><div><b>ผล</b></div>' + sc.list.map(function (p) { return '<div>' + esc(p.made_at) + '<div class="rnote">ครบ ' + esc(p.due_at) + '</div></div><div><b>' + esc(p.grp) + '</b> ' + dirTxt(p.predicted) + '<div class="rnote">' + esc(p.basis) + '</div></div><div>' + (p.resolved ? (p.actual == null ? 'ไม่มีข้อมูล' : (p.actual > 0 ? '+' : '') + p.actual + '% ' + dirTxt(p.actual_dir)) : 'รอ') + '</div><div>' + (p.resolved ? (p.hit == null ? '<span class="pill2">ตรวจไม่ได้</span>' : p.hit ? '<span class="pill2 g">ถูก</span>' : '<span class="pill2 r">ผิด</span>') : '<span class="pill2 a">รอผล</span>') + '</div>'; }).join('') + '</div>' : '<p class="hint">ยังไม่มีคำทำนาย — ต้องมีข้อมูลอย่างน้อย 7 วัน</p>') + '</div>';
    return h;
  }
  function loadSeries() {
    return PX.get('/api/market-observations?limit=5000').then(function (o) {
      var byG = {}, byP = {}; (T.groups || []).forEach(function (g) { g.items.forEach(function (it) { byP[it.id] = g.grp; }); });
      o.rows.forEach(function (r) { var g = byP[r.product_id]; if (!g) return; var d = byG[g] = byG[g] || {}; (d[r.observed_at] = d[r.observed_at] || []).push(r.price); });
      SERIES = {}; Object.keys(byG).forEach(function (g) { SERIES[g] = Object.keys(byG[g]).sort().map(function (d) { var a = byG[g][d]; return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }); });
    }).catch(function () {});
  }
  function load(force) {
    if (T && !force && Date.now() - AT < 15000) return Promise.resolve(T);
    return PX.get('/api/market-trend').then(function (j) { T = j; AT = Date.now(); return loadSeries(); }).then(function () { if (!document.getElementById('trCss')) document.head.insertAdjacentHTML('beforeend', CSS); return T; });
  }
  function group(k) { G = k; if (window.redrawTab) redrawTab(); }
  function syncNow() {
    PX.toast('กำลังดึงราคาจาก connector…');
    fetch('/api/market-feed-sample').then(function (r) { return r.ok ? r.json() : null; }).then(function (f) {
      return PX.post('/api/market-sync/run', { observations: f && f.rows ? f.rows : [] }).then(function (r) { PX.toast('ดึงแล้ว — ใหม่ ' + r.added + ' · SKU ' + r.coverage.known + '/' + r.coverage.total); return load(true).then(function () { if (window.redrawTab) redrawTab(); }); });
    }).catch(function (e) { PX.toast('ดึงไม่ได้ — ' + esc(e.message), 'bad'); });
  }
  return { load: load, html: html, group: group, syncNow: syncNow, data: function () { return T; } };
})();
