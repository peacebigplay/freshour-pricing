/* ══════════════════════════════════════════════════════════════════
   Charts — กราฟ SVG เล็กๆ ที่ทุกหน้าใช้ร่วมกัน (ไม่มี library)
   กติกา: แกนเดียว · เส้นบาง 2px · แท่งปลายมน · สีประจำหมวดตายตัว (ไม่หมุนเวียน) · ป้ายตรงจุดสำคัญ ไม่ใส่เลขทุกจุด · hover มี tooltip · ข้อความใช้สีข้อความ ไม่ใช่สีซีรีส์
   ══════════════════════════════════════════════════════════════════ */
window.Charts = (function () {
  /* ชุดสีหมวดหมู่ (ตรวจแล้ว: ความสว่าง/โครมา/คนตาบอดสี/คอนทราสต์ ผ่าน) — ใช้ตามลำดับนี้เสมอ */
  var CAT = ['#0052F3', '#DB2777', '#16A34A', '#8B5CF6', '#D97706', '#0891B2'];
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var fmt = function (n) { return n == null ? '—' : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : (Math.round(n * 10) / 10).toString(); };
  var uid = 0;
  var CSS = '<style id="chCss">.ch{position:relative;width:100%}.ch svg{display:block;width:100%;height:auto;overflow:visible}.ch .ax{font-size:10px;fill:var(--tx-3);font-family:var(--ff)}.ch .gl{stroke:var(--line-2);stroke-width:1}.ch .lbl{font-size:10.5px;fill:var(--tx-2);font-family:var(--fn);font-weight:600}' +
    '.ch .tip{position:absolute;pointer-events:none;background:var(--ink);color:#fff;font-size:11px;padding:6px 9px;border-radius:8px;white-space:nowrap;opacity:0;transform:translate(-50%,-110%);transition:opacity .12s;z-index:4;line-height:1.5}.ch .tip b{font-family:var(--fn)}.ch .tip i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}' +
    '.ch .hit{fill:transparent;cursor:crosshair}.ch .cur{stroke:var(--tx-3);stroke-width:1;stroke-dasharray:3 3;opacity:0}.ch .dot{opacity:0}.ch .leg{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--tx-2);margin-top:6px}.ch .leg i{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}.ch .leg i.sq{height:10px;border-radius:3px}' +
    '.ch .bar{transition:opacity .12s}.ch .bar:hover{opacity:.8}.ch .bar.hl{opacity:1}</style>';
  function css() { if (!document.getElementById('chCss')) document.head.insertAdjacentHTML('beforeend', CSS); }
  function scale(lo, hi, a, b) { var r = hi - lo || 1; return function (v) { return a + (v - lo) / r * (b - a); }; }
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }

  /* เส้น/พื้นที่: series=[{name,values[],color?}] labels[] · o={h,area,yMin,unit,marks:[{i,text}]} */
  function line(o) {
    css(); var id = 'ch' + (++uid), W = o.w || 600, H = o.h || 150, padL = 34, padR = 10, padT = 12, padB = 22, S = o.series.filter(function (s) { return s.values.some(function (v) { return v != null; }); });
    var all = [].concat.apply([], S.map(function (s) { return s.values.filter(function (v) { return v != null; }); }));
    if (!all.length) return '<div class="ch" style="height:' + H + 'px;display:grid;place-items:center;color:var(--tx-3);font-size:12px">ยังไม่มีข้อมูล</div>';
    var lo = o.yMin != null ? o.yMin : Math.min.apply(null, all), hi = Math.max.apply(null, all); if (lo === hi) { lo -= 1; hi += 1; } var pad = (hi - lo) * 0.12; lo = o.yMin != null ? o.yMin : lo - pad; hi += pad;
    var n = o.labels.length, X = scale(0, n - 1, padL, W - padR), Y = scale(lo, hi, H - padB, padT);
    var ticks = 4, g = ''; for (var t = 0; t <= ticks; t++) { var v = lo + (hi - lo) * t / ticks, y = Y(v); g += '<line class="gl" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="ax" x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + fmt(v) + '</text>'; }
    var step = Math.max(1, Math.ceil(n / 8)); for (var i = 0; i < n; i += step) g += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(o.labels[i]) + '</text>';
    /* ป้ายปลายเส้น: ถ้าซ้อนกัน (ห่าง <11px) ดันออกจากกันก่อนวาด */
    var ends = S.map(function (s) { var last = null; for (var k = s.values.length - 1; k >= 0; k--) if (s.values[k] != null) { last = k; break; } return last == null ? null : { i: last, y: Y(s.values[last]) + 4, y0: Y(s.values[last]) + 4 }; });
    var ord = ends.map(function (e, i) { return e ? i : -1; }).filter(function (i) { return i >= 0; }).sort(function (a, b) { return ends[a].y - ends[b].y; });
    for (var pass = 0; pass < 3; pass++) for (var q = 1; q < ord.length; q++) { var pe = ends[ord[q - 1]], ce = ends[ord[q]]; if (ce.y - pe.y < 11) { var mid = (ce.y + pe.y) / 2; pe.y = mid - 5.5; ce.y = mid + 5.5; } }
    var paths = S.map(function (s, si) {
      var c = s.color || CAT[si % CAT.length], d = '', started = false;
      s.values.forEach(function (v, i) { if (v == null) { started = false; return; } d += (started ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); started = true; });
      var area = o.area && S.length === 1 ? '<path d="' + d + 'L' + X(n - 1).toFixed(1) + ' ' + (H - padB) + 'L' + X(0).toFixed(1) + ' ' + (H - padB) + 'Z" fill="url(#' + id + 'g)" opacity=".9"/>' : '';
      var e = ends[si], last = e ? e.i : null;
      var endLbl = e && S.length <= 4 ? '<text class="lbl" x="' + (X(last) + 5).toFixed(1) + '" y="' + e.y.toFixed(1) + '">' + fmt(s.values[last]) + '</text>' : '';
      return area + '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + endLbl + s.values.map(function (v, i) { return v == null ? '' : '<circle class="dot" data-i="' + i + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="4" fill="' + c + '" stroke="#fff" stroke-width="2"/>'; }).join('');
    }).join('');
    var marks = (o.marks || []).map(function (m) { return '<line x1="' + X(m.i).toFixed(1) + '" x2="' + X(m.i).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '" stroke="var(--tx-3)" stroke-dasharray="2 3"/><text class="ax" x="' + X(m.i).toFixed(1) + '" y="' + (padT - 3) + '" text-anchor="middle">' + esc(m.text) + '</text>'; }).join('');
    var grad = '<defs><linearGradient id="' + id + 'g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + (S[0].color || CAT[0]) + '" stop-opacity=".22"/><stop offset="1" stop-color="' + (S[0].color || CAT[0]) + '" stop-opacity="0"/></linearGradient></defs>';
    var data = JSON.stringify({ labels: o.labels, series: S.map(function (s, i) { return { name: s.name, values: s.values, color: s.color || CAT[i % CAT.length] }; }), unit: o.unit || '' }).replace(/"/g, '&quot;');
    var leg = S.length > 1 ? '<div class="leg">' + S.map(function (s, i) { return '<span><i style="background:' + (s.color || CAT[i % CAT.length]) + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '';
    return '<div class="ch" data-ch="line" data-d="' + data + '" data-w="' + W + '" data-h="' + H + '" data-l="' + padL + '" data-r="' + padR + '"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + grad + g + paths + marks + '<line class="cur" x1="0" x2="0" y1="' + padT + '" y2="' + (H - padB) + '"/><rect class="hit" x="' + padL + '" y="0" width="' + (W - padL - padR) + '" height="' + H + '"/></svg><div class="tip"></div>' + leg + '</div>';
  }
  /* แท่ง: items=[{label,value,color?,sub?}] o={h,unit,max,hl:index,horizontal}  — ปลายมน 4px ยึดฐาน · ช่องว่างระหว่างแท่ง */
  function bars(o) {
    css(); var H = o.h || 150, items = o.items, n = items.length; if (!n) return '';
    if (o.horizontal) {
      var mx = o.max || niceMax(Math.max.apply(null, items.map(function (x) { return Math.abs(x.value || 0); })));
      return '<div class="ch" data-ch="hbars"><div style="display:flex;flex-direction:column;gap:6px">' + items.map(function (it, i) { var w = Math.min(100, Math.abs(it.value || 0) / mx * 100), c = it.color || CAT[0];
        return '<div style="display:grid;grid-template-columns:minmax(80px,30%) 1fr auto;gap:8px;align-items:center;font-size:12px" title="' + esc(it.label) + ' ' + fmt(it.value) + (o.unit || '') + '"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(it.label) + '</span><span style="height:10px;background:var(--line-2);border-radius:99px;overflow:hidden"><i style="display:block;height:100%;width:' + w + '%;background:' + c + ';border-radius:99px"></i></span><b style="font-family:var(--fn);min-width:40px;text-align:right">' + fmt(it.value) + (o.unit || '') + '</b></div>'; }).join('') + '</div></div>';
    }
    var W = o.w || 600, padL = 30, padR = 8, padT = 14, padB = 22, mx2 = o.max || niceMax(Math.max.apply(null, items.map(function (x) { return x.value || 0; }))), Y = scale(0, mx2, H - padB, padT), bw = (W - padL - padR) / n, gap = Math.max(4, bw * 0.3);
    var g = ''; for (var t = 0; t <= 4; t++) { var v = mx2 * t / 4, y = Y(v); g += '<line class="gl" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="ax" x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + fmt(v) + '</text>'; }
    var b = items.map(function (it, i) { var x = padL + i * bw + gap / 2, w = bw - gap, y = Y(it.value || 0), h = Math.max(0, H - padB - y), c = it.color || CAT[0], hl = o.hl === i;
      return '<path class="bar ' + (hl ? 'hl' : '') + '" data-i="' + i + '" d="M' + x.toFixed(1) + ' ' + (H - padB) + 'V' + (y + 4).toFixed(1) + 'a4 4 0 0 1 4 -4h' + (w - 8).toFixed(1) + 'a4 4 0 0 1 4 4V' + (H - padB) + 'Z" fill="' + c + '" opacity="' + (o.hl != null && !hl ? .35 : 1) + '"/>' + (hl || (o.labelAll && n <= 8) ? '<text class="lbl" x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle">' + fmt(it.value) + '</text>' : '') +
        '<text class="ax" x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(it.label) + '</text>'; }).join('');
    var data = JSON.stringify({ items: items.map(function (x) { return { label: x.label, value: x.value, sub: x.sub || '', color: x.color || CAT[0] }; }), unit: o.unit || '' }).replace(/"/g, '&quot;');
    return '<div class="ch" data-ch="bars" data-d="' + data + '"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + g + b + '</svg><div class="tip"></div></div>';
  }
  /* โดนัท: items=[{label,value,color}] o={size, center:{big,small}} */
  function donut(o) {
    css(); var size = o.size || 120, r = size / 2 - 8, cx = size / 2, cy = size / 2, tot = o.items.reduce(function (a, x) { return a + (x.value || 0); }, 0) || 1, acc = 0;
    var segs = o.items.map(function (it, i) { var v = (it.value || 0) / tot, a0 = acc * 2 * Math.PI - Math.PI / 2, a1 = (acc + v) * 2 * Math.PI - Math.PI / 2; acc += v; if (v <= 0) return '';
      var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1), big = v > 0.5 ? 1 : 0;
      return '<path d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + 'A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + '" fill="none" stroke="' + (it.color || CAT[i % CAT.length]) + '" stroke-width="12" stroke-linecap="butt"><title>' + esc(it.label) + ' ' + fmt(it.value) + ' (' + Math.round(v * 100) + '%)</title></path>'; }).join('');
    var ring = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--line-2)" stroke-width="12"/>';
    var center = o.center ? '<text x="' + cx + '" y="' + (cy + 2) + '" text-anchor="middle" style="font-family:var(--fn);font-size:20px;font-weight:600;fill:var(--ink)">' + esc(o.center.big) + '</text><text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="ax">' + esc(o.center.small || '') + '</text>' : '';
    var leg = '<div class="leg" style="flex-direction:column;gap:4px">' + o.items.map(function (it, i) { return '<span><i class="sq" style="background:' + (it.color || CAT[i % CAT.length]) + '"></i>' + esc(it.label) + ' <b style="font-family:var(--fn)">' + fmt(it.value) + '</b></span>'; }).join('') + '</div>';
    return '<div class="ch" style="display:flex;gap:14px;align-items:center;width:auto"><svg viewBox="0 0 ' + size + ' ' + size + '" style="width:' + size + 'px;height:' + size + 'px;flex:none">' + ring + segs + center + '</svg>' + leg + '</div>';
  }
  /* hover: เส้น = crosshair + tooltip ทุกซีรีส์ · แท่ง = tooltip ต่อแท่ง */
  function bind(root) {
    (root || document).querySelectorAll('.ch[data-ch="line"]').forEach(function (el) {
      if (el.__b) return; el.__b = 1; var d = JSON.parse(el.getAttribute('data-d')), W = +el.dataset.w, L = +el.dataset.l, R = +el.dataset.r, tip = el.querySelector('.tip'), cur = el.querySelector('.cur'), svg = el.querySelector('svg'), n = d.labels.length;
      var hit = el.querySelector('.hit');
      hit.addEventListener('mousemove', function (e) { var rect = svg.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * W, i = Math.round((x - L) / (W - L - R) * (n - 1)); i = Math.max(0, Math.min(n - 1, i)); var px = L + i / (n - 1) * (W - L - R);
        cur.setAttribute('x1', px); cur.setAttribute('x2', px); cur.style.opacity = 1; el.querySelectorAll('.dot').forEach(function (c) { c.style.opacity = +c.dataset.i === i ? 1 : 0; });
        tip.innerHTML = '<div style="color:#BFD2FF">' + esc(d.labels[i]) + '</div>' + d.series.map(function (s) { return s.values[i] == null ? '' : '<div><i style="background:' + s.color + '"></i>' + esc(s.name) + ' <b>' + fmt(s.values[i]) + d.unit + '</b></div>'; }).join('');
        tip.style.left = (px / W * rect.width) + 'px'; tip.style.top = '8px'; tip.style.opacity = 1; });
      hit.addEventListener('mouseleave', function () { tip.style.opacity = 0; cur.style.opacity = 0; el.querySelectorAll('.dot').forEach(function (c) { c.style.opacity = 0; }); });
    });
    (root || document).querySelectorAll('.ch[data-ch="bars"]').forEach(function (el) {
      if (el.__b) return; el.__b = 1; var d = JSON.parse(el.getAttribute('data-d')), tip = el.querySelector('.tip'), svg = el.querySelector('svg');
      el.querySelectorAll('.bar').forEach(function (b) { b.addEventListener('mousemove', function (e) { var it = d.items[+b.dataset.i], rect = el.getBoundingClientRect(); tip.innerHTML = '<div style="color:#BFD2FF">' + esc(it.label) + '</div><div><i style="background:' + it.color + '"></i><b>' + fmt(it.value) + d.unit + '</b>' + (it.sub ? ' · ' + esc(it.sub) : '') + '</div>'; tip.style.left = (e.clientX - rect.left) + 'px'; tip.style.top = (e.clientY - rect.top - 6) + 'px'; tip.style.opacity = 1; }); b.addEventListener('mouseleave', function () { tip.style.opacity = 0; }); });
    });
  }
  function spark(values, color, w, h) { if (!values || values.length < 2) return ''; var W = w || 120, H = h || 28, lo = Math.min.apply(null, values), hi = Math.max.apply(null, values), rg = hi - lo || 1; var pts = values.map(function (v, i) { return (i / (values.length - 1) * W).toFixed(1) + ',' + ((1 - (v - lo) / rg) * (H - 4) + 2).toFixed(1); }); return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'px;height:' + H + 'px;display:block;overflow:visible"><polyline fill="none" stroke="' + (color || CAT[0]) + '" stroke-width="2" stroke-linejoin="round" points="' + pts.join(' ') + '"/><circle cx="' + W + '" cy="' + ((1 - (values[values.length - 1] - lo) / rg) * (H - 4) + 2).toFixed(1) + '" r="2.5" fill="' + (color || CAT[0]) + '"/></svg>'; }
  return { line: line, bars: bars, donut: donut, bind: bind, spark: spark, CAT: CAT, fmt: fmt };
})();
