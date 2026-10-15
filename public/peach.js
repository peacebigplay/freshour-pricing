/* ══════════════════════════════════════════════════════════════════
   เปลือกกลางของดีไซน์พีช — เมนูซ้าย + ตัวช่วยที่ทุกหน้าใช้ร่วมกัน
   ทุกหน้าในชุดนี้เรียก PX.shell() ตัวเดียว เมนูจะได้ตรงกันเสมอ
   ══════════════════════════════════════════════════════════════════ */
/* __NAV = ตัวแทน location/history — ไฟล์เดโม (iframe) ใส่ของตัวเองมาก่อน · บนเว็บจริงใช้ของเบราว์เซอร์ตรงๆ */
if (!window.__NAV) window.__NAV = { native: true,
  get search() { return location.search; }, get pathname() { return location.pathname; },
  get href() { return location.href; }, set href(h) { location.href = h; },
  replaceState: function () { try { history.replaceState.apply(history, arguments); } catch (e) {} },
  back: function () { if (history.length > 1) history.back(); else location.href = '/'; }
};
window.PX = (function () {

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var money = function (n) { return Math.round(n).toLocaleString('en-US'); };

  /* เมนูจริงของชุดนี้ — หน้าไหนยังไม่ได้ทำ ให้บอกตรงๆ ว่ายังไม่ทำ
     ห้ามลิงก์ไปหน้าดีไซน์เก่าเงียบๆ เพราะคนกดแล้วจะนึกว่าระบบพัง */
  var NAV = [
    { id: 'exec', href: '/exec',      ic: '🏠', t: 'ผู้บริหาร',    s: 'ตัดสินใจ' },
    { id: 'pricing', href: '/pricing', ic: '🧮', t: 'ตั้งราคา', s: 'พุธ · ใบละเจ้า', badge: 'work' },
    { id: 'cust', href: '/customers', ic: '👥', t: 'ลูกค้า',       s: 'สัญญา + Margin Guard', badge: 'low' },
    { id: 'sale', href: '/sales', ic: '📊', t: 'Sales',        s: 'ประกาศราคา' },
    { id: 'cost', href: '/costs', ic: '📦', t: 'รับทุน & ตลาด', s: 'อังคาร · ทุน + ราคาตลาด' }
  ];
  /* TOOLS = ของที่ไม่ได้ใช้ทุกวัน · บนมือถือยุบเป็นปุ่มเดียวเปิดเป็นแผงแทน
     เดิม 11 ปุ่มเรียงในแถบล่าง กดพลาดตลอด */
  var TOOLS = [
    { id: 'brain', href: '/brain', ic: '🧠', t: 'สรุป', s: 'อยู่ตรงไหน ไปไหนต่อ' },
    { id: 'flow', href: '/process', ic: '🛤', t: 'เส้นทาง', s: 'ตันสถานีไหน' },
    { id: 'memory', href: '/memory', ic: '🗂', t: 'ความจำ', s: 'ย้อนดูทุกอย่าง' },
    { id: 'logic', href: '/logic', ic: '📜', t: 'หลักการ', s: 'กฎที่ระบบใช้จริง' },
    { id: 'guard', href: '/guard', ic: '⚙️', t: 'ตั้งค่า Margin Guard', s: 'เกณฑ์ + เพดานต่อรอง' },
    { id: 'wire', href: '/wiring', ic: '🔌', t: 'การต่อ', s: 'ต่อติดจริงไหม' },
    { id: 'trend', href: '/trend', ic: '📈', t: 'แนวโน้มตลาด', s: 'ดึงเองทุกวัน · เตือนถูกกี่ครั้ง' },
    { id: 'log', href: '/log', ic: '🧾', t: 'บันทึกเหตุการณ์', s: 'คน + ระบบ · ล้มแล้วรู้' }
  ];

  function item(n, cur) {
    var on = n.id === cur;
    return '<a class="' + (on ? 'on' : '') + '" data-id="' + n.id + '" href="' + n.href + '">' +
      '<i>' + n.ic + '</i><span class="txt">' + esc(n.t) +
      (n.s ? '<em>' + esc(n.s) + '</em>' : '') + '</span>' +
      (n.badge ? '<span class="bdg" data-bdg="' + n.badge + '">—</span>' : '') + '</a>';
  }

  /* วาดเปลือก แล้วคืน element ของเนื้อหาให้หน้าไปเติมเอง */
  /* บทบาทไหนเห็นเมนูอะไร — ต้องตรงกับสิทธิ์จริงที่ API บังคับ
     ให้เห็นเมนูที่กดแล้วเจอ "ไม่มีสิทธิ์" คือหลอกให้เสียเวลา */
  var CAN = { sale: ['sale'],
              ops:   ['pricing','cust','sale','cost','flow','memory','logic','guard','wire','trend','log'],
              boss:  ['exec','brain','pricing','cust','sale','cost','flow','memory','logic','guard','wire','trend','log'],
              admin: ['exec','brain','pricing','cust','sale','cost','flow','memory','logic','guard','wire','trend','log'] };

  function applyRole(role) {
    var ok = CAN[role] || CAN.ops;
    document.querySelectorAll('.nav a').forEach(function (a) {
      var id = a.getAttribute('data-id');
      if (id && ok.indexOf(id) < 0) a.remove();
    });
    var lbs = document.querySelectorAll('.side .lb');
    lbs.forEach(function (lb) {
      var n = lb.nextElementSibling;
      if (n && n.classList.contains('nav') && !n.children.length) { lb.remove(); n.remove(); }
    });
  }

  /* ไอคอนแท็บ — ทุกหน้าเคยยิง /favicon.ico แล้วได้ 404 ทุกครั้งที่โหลด
     ใส่ที่เดียวตรงนี้ ดีกว่าไปเติม <link> ในไฟล์ html ทั้ง 12 ไฟล์ */
  (function () {
    var l = document.createElement('link');
    l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = '/favicon.svg';
    document.head.appendChild(l);
  })();

  function shell(cur, floatCard) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="app"><aside class="side">' +
        /* โลโก้คือปุ่มกลับหน้าแรก — / จะพาไปหน้าเริ่มงานของบทบาทนั้นเอง */
        '<a class="brand" href="/" title="กลับหน้าแรกของคุณ"><span class="mk">F</span>' +
          '<span><b>Freshour</b><span>ราคาหมูสด</span></span></a>' +
        /* เมนูเลื่อนได้ในตัวเอง — การ์ดงานถัดไปกับปุ่มออกจากระบบต้องอยู่ให้เห็นเสมอ
           ไม่ใช่ตกไปอยู่ใต้จอจนคนหาไม่เจอ */
        '<div class="navs">' +
          '<div class="lb">MENU</div>' +
          '<nav class="nav">' + NAV.map(function (n) { return item(n, cur); }).join('') + '</nav>' +
          '<div class="lb">TOOLS</div>' +
          '<nav class="nav" id="toolNav">' +
            TOOLS.map(function (n) { return item(n, cur); }).join('') + '</nav>' +
        '</div>' +
        /* ปุ่มนี้โผล่เฉพาะจอมือถือ (CSS คุม) — กดแล้วกาง TOOLS เป็นแผงเต็มจอ */
        '<button class="toolbtn" onclick="PX.tools()"><i>⋯</i><span>เครื่องมือ</span></button>' +
        (floatCard || '') +
        '<a class="out" href="/logout">ออกจากระบบ</a>' +
      '</aside><main class="main" id="main">' +
        '<p class="err">กำลังอ่านข้อมูล…</p>' +
      '</main></div><div id="tip"></div>');
    /* เมนูเลื่อนในตัวเอง — ถ้าหน้าปัจจุบันอยู่นอกจอที่เห็น คนจะนึกว่าเมนูหาย
       เลื่อนให้เห็นตัวเองเสมอตั้งแต่เปิดหน้า */
    var cur2 = document.querySelector('.navs .nav a.on');
    if (cur2) cur2.scrollIntoView({ block: 'nearest' });
    /* ถามสิทธิ์จริงแล้วตัดเมนูที่เข้าไม่ได้ทิ้ง */
    fetch('/api/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { if (me && me.role) { ME = me; applyRole(me.role); fillGreet(); } })
      .catch(function () {});
    return document.getElementById('main');
  }

  function badge(name, text) {
    var el = document.querySelector('[data-bdg="' + name + '"]');
    if (el) el.textContent = text;
  }

  /* ── pop-up อธิบายการคำนวณ: คิดยังไง / มาจากไหน / เชื่อได้แค่ไหน ── */
  function why(t, how, src, trust) {
    return ' class="why" data-why="' + esc(t + '|' + how + '|' + src + '|' + trust) + '"';
  }
  function bindTips() {
    var TIP = document.getElementById('tip');
    if (!TIP) return;
    /* มือถือไม่มี hover — ป้ายอธิบายที่เปิดด้วย hover อย่างเดียวคือคนมือถือไม่เคยเห็นเลย
       จึงผูกทั้ง hover (จอใหญ่) และ click (ทุกจอ) */
    var show = function (el) {
      var p = el.getAttribute('data-why').split('|');
        TIP.innerHTML = '<b>' + esc(p[0]) + '</b>' +
          '<div class="r"><em>คิดยังไง</em><span>' + esc(p[1]) + '</span></div>' +
          '<div class="r"><em>มาจากไหน</em><span>' + esc(p[2]) + '</span></div>' +
          '<div class="r"><em>เชื่อได้แค่ไหน</em><span>' + esc(p[3]) + '</span></div>';
        TIP.classList.add('on');
        var r = el.getBoundingClientRect();
        TIP.style.left = Math.min(innerWidth - 312, Math.max(8, r.left)) + 'px';
      TIP.style.top = (r.bottom + 8 + 200 > innerHeight
        ? r.top - 8 - TIP.offsetHeight : r.bottom + 8) + 'px';
    };
    var hide = function () { TIP.classList.remove('on'); };
    document.querySelectorAll('[data-why]').forEach(function (el) {
      el.classList.add('whyq');
      el.onmouseenter = function () { show(el); };
      el.onmouseleave = hide;
      el.onclick = function (e) {
        e.stopPropagation();
        if (TIP.classList.contains('on') && TIP.dataset.for === el.dataset.why) hide();
        else { show(el); TIP.dataset.for = el.dataset.why; }
      };
    });
    document.onclick = function () { hide(); };
    TIP.onclick = function (e) { e.stopPropagation(); };
  }

  /* แผง TOOLS สำหรับมือถือ */
  function tools() {
    var n = document.getElementById('toolNav');
    if (n) n.classList.toggle('open');
  }

  /* ── ดึงข้อมูล: เปิดลิงก์แล้วต้องเห็นเลย ไม่ต้องล็อกอินที่หน้าอื่นก่อน
       ในเครื่อง PUBLIC=false จึงเข้าได้ทันที · บนเว็บจริงยังต้องใส่รหัสตามเดิม ── */
  /* ยังไม่ได้เข้าระบบ → ส่งไปประตู พร้อมจำไว้ว่าเขากำลังจะไปหน้าไหน
     สัญญาที่ไม่ยอม resolve คือตั้งใจ — กันไม่ให้หน้าวาดข้อความ error แวบก่อนเปลี่ยนหน้า */
  function toLogin() {
    __NAV.href= '/login?next=' + encodeURIComponent(__NAV.pathname);
    return new Promise(function () {});
  }

  function get(url) {
    var go = function () { return fetch(url, { credentials: 'same-origin' }); };
    return go().then(function (r) {
      if (r.ok) return r;
      /* ล็อกอินให้อัตโนมัติได้เฉพาะตอน "ยังไม่ได้ล็อกอินเลย" และเครื่องนี้ไม่ต้องใช้รหัส
         ถ้ามี session อยู่แล้ว (เช่นเซลล์) ห้ามยกระดับเป็นผู้ออกราคาเด็ดขาด */
      return fetch('/api/me', { credentials: 'same-origin' })
        .then(function (m) { return m.ok ? m.json() : {}; })
        .catch(function () { return {}; })
        .then(function (me) {
          if (me && me.role) return r;          // ล็อกอินอยู่แล้วแต่ไม่มีสิทธิ์ → คืน 403 ตามจริง
          if (me && me.needPin) return toLogin();
          return fetch('/api/login', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'ops' }), credentials: 'same-origin'
          }).then(function (lr) { return lr.ok ? go() : toLogin(); });
        });
    }).then(function (r) {
      if (r.status === 403) throw new Error('บัญชีนี้ไม่มีสิทธิ์เปิดหน้านี้');
      if (r.status === 401) return toLogin();
      /* เก็บข้อความภาษาไทยจาก server ไว้ (เช่น "ยังไม่ผ่าน Pricing — …") — เดิมเหลือแค่ "เปิดข้อมูลไม่ได้ (400)" */
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error(j.error || ('เปิดข้อมูลไม่ได้ (' + r.status + ')')); e.body = j; e.status = r.status; throw e; });
      return r.json();
    });
  }

  function fail(e) {
    document.getElementById('main').innerHTML =
      '<p class="err"><b>เปิดไม่ได้</b> — ' + esc(e.message) +
      '<br><a class="lnk2" href="/logout">เข้าระบบใหม่ด้วยชื่ออื่น</a></p>';
  }

  /* V30: ทุกหน้ามีปุ่มกลับ + คำทักทายตามบทบาท (วันนี้วันที่เท่าไหร่ เวลา และวันนี้ต้องทำอะไร)
     opt.back = ชื่อฟังก์ชันที่หน้านั้นใช้ย้อนกลับเอง (เช่นมุมมองย่อยในหน้าเดียว) · ไม่ส่ง = ย้อนหน้าก่อน */
  function head(title, sub, who, opt) {
    opt = opt || {};
    var back = '<button type="button" class="px-back" onclick="' + (opt.back ? esc(opt.back) + '()' : 'PX.back()') + '"><i>←</i>' +
      esc(opt.backLabel || 'กลับ') + '</button>';
    return back + '<div class="top"><div><h1>' + esc(title) + '</h1><p>' + sub + '</p></div>' +
      '<div class="who"><span class="av">' + esc(who[0]) + '</span>' +
      '<span><b>' + esc(who[1]) + '</b><span>' + esc(who[2]) + '</span></span></div></div>' +
      '<div class="px-greet" id="pxGreet">' + greetHTML() + '</div>';
  }
  function back() {
    var r = document.referrer || '';
    if (true && r.indexOf('/login') < 0 && 2 > 1) __NAV.back();
    else __NAV.href= '/';
  }

  var ME = null;
  var ROLE_NAME = { boss: 'พี่หมิง', ops: 'พี่จุ๋ม', sale: 'ทีมเซลล์', admin: 'ผู้ดูแลระบบ' };
  /* งานตามรอบสัปดาห์ (อ. ทุนเข้า · พ. ยืนยันราคากลาง · พฤ. ประกาศ+ส่งใบ) — ตรงกับ cron ใน wrangler.toml */
  var TODO = {
    boss: ['วันหยุด — ดูสรุปที่ Overview ได้', 'สรุปสัปดาห์ที่แล้ว + ปัญหาค้าง', 'ทุนรอบใหม่เข้า — ดูต้นทุนขยับ',
           'วันยืนยันราคากลาง — ดู Margin Guard', 'วันประกาศราคา — ตรวจจุดเสี่ยงก่อนประกาศ', 'ดูปัญหาลูกค้า + ขนส่งของสัปดาห์', 'วันหยุด — ดูสรุปที่ Overview ได้'],
    ops:  ['วันหยุด — ไม่มีงานตามรอบ', 'ตอบคำขอต่อรองที่ค้าง', 'รับทุนจาก AL + ราคาตลาด',
           'ยืนยันราคากลาง + ทำใบรายเจ้า', 'ประกาศราคา + ส่งต่อ Sales', 'ตอบคำขอต่อรองที่ค้าง', 'วันหยุด — ไม่มีงานตามรอบ'],
    sale: ['วันหยุด — ไม่มีงานตามรอบ', 'ตามลูกค้าที่ยังไม่ตอบใบราคา', 'ตามลูกค้าที่ยังไม่ตอบใบราคา',
           'เตรียมรายชื่อลูกค้า — พรุ่งนี้ราคาใหม่ออก', 'ส่งใบราคารอบใหม่ให้ลูกค้าทุกเจ้า', 'ตามคำตอบ + บันทึก invoice', 'วันหยุด — ไม่มีงานตามรอบ']
  };
  var TODO_LINK = { boss: '/exec', admin: '/exec', ops: ['/pricing','/pricing','/costs','/pricing','/pricing','/pricing','/pricing'], sale: '/sales' };
  function bkk() { return new Date(Date.now() + (new Date().getTimezoneOffset() + 420) * 60000); }
  function greetHTML() {
    if (!ME || !ME.role) return '';
    var d = bkk(), h = d.getHours(), wd = d.getDay(), role = ME.role === 'admin' ? 'boss' : ME.role;
    var hi = h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
    var DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
    var MON = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    var z = function (n) { return String(n).padStart(2, '0'); };
    var link = TODO_LINK[ME.role] || TODO_LINK[role] || '/';
    if (Array.isArray(link)) link = link[wd];
    var todo = (TODO[role] || TODO.boss)[wd];
    return '<div><div class="g-hi">' + hi + ', ' + esc(ROLE_NAME[ME.role] || '') + '<span>' + (wd === 0 || wd === 6 ? 'พักผ่อนบ้างนะ' : 'วันนี้มีอะไรต้องทำบ้าง') + '</span></div>' +
      '<div class="g-when">วัน' + DAYS[wd] + 'ที่ <b>' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + (d.getFullYear() + 543) + '</b> · <b class="g-clock">' + z(h) + ':' + z(d.getMinutes()) + '</b> น.</div></div>' +
      '<div class="g-todo"><span class="g-day">วันนี้</span><a href="' + esc(link) + '">' + esc(todo) + ' →</a></div>';
  }
  /* ── บันทึกเวลาใช้งานจริง (activity log) ─────────────────────────
     นับเฉพาะตอนแท็บเปิดอยู่ + มีการขยับ (คลิก/พิมพ์/เลื่อน) ภายใน 60 วิล่าสุด — เปิดค้างไว้เฉยๆ ไม่นับ
     ส่งทุก 60 วิ และตอนปิดหน้า · หน้าผู้บริหารเอาไปคิด "ระบบลดงานไปเท่าไหร่" (src/ops.js teamTime) */
  var ACT_MS = 0, lastMove = Date.now(), lastTick = Date.now(), VIS = document.visibilityState === 'visible';
  ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart', 'mousemove'].forEach(function (ev) {
    addEventListener(ev, function () { lastMove = Date.now(); }, { passive: true, capture: true });
  });
  function tickAct() {
    var now = Date.now(), dt = Math.min(now - lastTick, 15000);
    if (VIS && now - lastMove < 60000) ACT_MS += dt;        /* VIS = สถานะช่วงที่ผ่านมา ไม่ใช่ตอนนี้ */
    lastTick = now;
  }
  function flushAct(beacon) {
    tickAct();
    if (!ME || !ME.role || ACT_MS < 1000) return;
    var body = JSON.stringify({ page: __NAV.pathname.replace(/\.html$/, ''), ms: Math.min(ACT_MS, 120000) });
    ACT_MS = 0;
    try {
      if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/activity', new Blob([body], { type: 'application/json' }));
      else fetch('/api/activity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, credentials: 'same-origin', keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  setInterval(tickAct, 5000);
  setInterval(function () { flushAct(false); }, 60000);
  addEventListener('pagehide', function () { flushAct(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { flushAct(true); VIS = false; }      /* นับช่วงที่เห็นอยู่ก่อนซ่อน แล้วค่อยปิด */
    else { tickAct(); VIS = true; }                                                   /* ช่วงที่ซ่อนไม่นับ */
  });

  function fillGreet() { var g = document.getElementById('pxGreet'); if (g) g.innerHTML = greetHTML(); }
  setInterval(function () {
    var c = document.querySelector('#pxGreet .g-clock'); if (!c) return;
    var d = bkk(); c.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }, 30000);

  /* สีชุดโดนัท — เป็นข้อมูล (แต่ละกลุ่มสินค้า) ไม่ใช่ของตกแต่ง */
  var COL = ['var(--band-5)','var(--gold)','var(--band-4)','var(--violet)','var(--band-1)',
             'var(--teal)','var(--pink)','var(--band-3)','var(--slate)','var(--brown)',
             'var(--sea)','var(--plum)'];

  /* ── เลขหน้า: หน้าแรก · รอบหน้าปัจจุบัน · หน้าสุดท้าย (−1 = …) — ตารางยาวกดไปได้ทุกหน้า ── */
  function pageNums(pg, pages) {
    var out = [], add = function (i) { if (i >= 0 && i < pages && out.indexOf(i) < 0) out.push(i); };
    add(0); for (var i = pg - 2; i <= pg + 2; i++) add(i); add(pages - 1);
    out.sort(function (a, b) { return a - b; });
    var res = []; out.forEach(function (i, k) { if (k && i - out[k - 1] > 1) res.push(-1); res.push(i); });
    return res;
  }

  /* ── ส่งข้อมูล: ทุกปุ่มที่เขียนจริงต้องผ่านตัวนี้ตัวเดียว
       จะได้จัดการ error กับข้อความแจ้งผลแบบเดียวกันทั้งระบบ ── */
  function post(url, body, method) {
    return fetch(url, {
      method: method || 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}), credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.error) { var e = new Error(j.error || ('ผิดพลาด ' + r.status)); e.body = j; e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* ── แจ้งผล: บอกสิ่งที่เกิดขึ้นจริง ไม่ใช่ alert ที่ต้องกดปิด ── */
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || 'ok');
    t.innerHTML = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('on'); });
    setTimeout(function () {
      t.classList.remove('on');
      setTimeout(function () { t.remove(); }, 250);
    }, kind === 'bad' ? 5200 : 2800);
  }

  /* ── กล่องโต้ตอบ: ใช้แทน prompt/alert เพื่อให้กรอกหลายช่องได้ ──
       fields = [{k,label,value,hint,type}] · onOk(values) คืน Promise ได้ */
  function modal(opt) {
    var f = opt.fields || [];
    var wrap = document.createElement('div');
    wrap.className = 'mdl';
    wrap.innerHTML =
      '<div class="mdl-bd"><div class="mdl-hd"><b>' + esc(opt.title) + '</b>' +
        (opt.sub ? '<span>' + opt.sub + '</span>' : '') +
        '<button class="mdl-x" aria-label="ปิด">✕</button></div>' +
      '<div class="mdl-bo">' + (opt.html || '') +
      f.map(function (x) {
        return '<label class="fld"><span>' + esc(x.label) + '</span>' +
          (x.type === 'area'
            ? '<textarea data-k="' + x.k + '" rows="' + (x.rows || 7) + '" placeholder="' +
              esc(x.ph || '') + '">' + esc(x.value || '') + '</textarea>'
            : '<input data-k="' + x.k + '" value="' + esc(x.value == null ? '' : x.value) +
              '" placeholder="' + esc(x.ph || '') + '"' +
              (x.type === 'num' ? ' inputmode="numeric"' : '') + '>') +
          (x.hint ? '<em>' + x.hint + '</em>' : '') + '</label>';
      }).join('') + '</div>' +
      '<div class="mdl-ft">' + (opt.note ? '<span class="nt">' + opt.note + '</span>' : '') +
        '<button class="btn mdl-c">ยกเลิก</button>' +
        (opt.ok === false ? '' : '<button class="btn pri mdl-o">' +
          esc(opt.okText || 'บันทึก') + '</button>') + '</div></div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add('on'); });
    /* opt.onClose ทำงานทุกทางที่ปิด (X · ยกเลิก · คลิกพื้นหลัง · ปุ่มยืนยัน) และครั้งเดียว —
       ฟอร์มที่บันทึกระหว่างเปิดอยู่ (เช่นแก้เป้ารายตัว) ต้องบอกหน้าแม่ให้โหลดใหม่ ไม่ว่าจะปิดด้วยปุ่มไหน */
    var closed = false;
    var close = function () {
      if (closed) return; closed = true;
      wrap.classList.remove('on');
      setTimeout(function () { wrap.remove(); }, 200);
      if (opt.onClose) { try { opt.onClose(); } catch (e) { /* หน้าแม่โหลดใหม่ไม่ได้ ≠ ปิดฟอร์มไม่ได้ */ } }
    };
    wrap.querySelector('.mdl-x').onclick = close;
    wrap.querySelector('.mdl-c').onclick = close;
    wrap.onclick = function (e) { if (e.target === wrap) close(); };
    var ok = wrap.querySelector('.mdl-o');
    if (ok) ok.onclick = function () {
      var v = {};
      wrap.querySelectorAll('[data-k]').forEach(function (el) { v[el.dataset.k] = el.value.trim(); });
      var r = opt.onOk ? opt.onOk(v, close) : null;
      if (r && r.then) {
        ok.disabled = true; ok.textContent = 'กำลังบันทึก…';
        r.then(close).catch(function (e) {
          ok.disabled = false; ok.textContent = opt.okText || 'บันทึก';
          toast('บันทึกไม่สำเร็จ — ' + esc(e.message), 'bad');
          /* server บอกว่าข้อมูลบนจอเก่าแล้ว (ราคา/รอบ/คำขอเปลี่ยน) — ปิดฟอร์มเก่า แล้วให้หน้าโหลดของใหม่ */
          if (e.body && (e.body.reload || e.body.changed) && opt.onStale) { close(); opt.onStale(e); }
        });
      } else if (r !== false) close();
    };
    var first = wrap.querySelector('[data-k]');
    if (first) first.focus();
    return { close: close, el: wrap };
  }

  /* ── ดาวน์โหลด CSV จากตารางที่เห็นอยู่ ── */
  function csv(name, rows) {
    var q = function (v) {
      v = v == null ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var blob = new Blob(['\ufeff' + rows.map(function (r) { return r.map(q).join(','); }).join('\n')],
      { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ── ลิ้นชักรายละเอียดสินค้า ────────────────────────────────────
     ใช้ร่วมทุกหน้า เพื่อไม่ให้กราฟกับตารางเป็นทางตัน
     กดตัวเลขไหนก็ตาม ต้องเข้าไปดูของจริงที่อยู่หลังตัวเลขนั้นได้ */
  function product(id) {
    var d = document.getElementById('pdrawer');
    if (!d) {
      document.body.insertAdjacentHTML('beforeend',
        '<div class="scrim" id="pscrim"></div><aside class="drw" id="pdrawer"></aside>');
      d = document.getElementById('pdrawer');
      document.getElementById('pscrim').onclick = closeProduct;
    }
    d.innerHTML = '<div class="drw-bo"><p class="err">กำลังอ่าน…</p></div>';
    document.getElementById('pscrim').classList.add('on');
    d.classList.add('on');

    get('/api/product?id=' + encodeURIComponent(id)).then(function (j) {
      var p = j.p;
      var mgc = p.margin < 0 ? 'var(--red)' : p.margin < j.floorPct ? 'var(--amber)' : 'var(--green)';
      var h = '<div class="drw-hd"><button class="mdl-x" onclick="PX.closeProduct()">✕</button>' +
        '<span class="pill2 b">' + esc(p.grp) + '</span>' +
        '<b>' + esc(p.name) + '</b>' +
        '<span>' + (p.vol ? money(p.vol) + ' กก./สัปดาห์' : 'ยังไม่รู้ปริมาณขาย') + '</span></div>' +
        '<div class="drw-bo">';

      h += '<div class="dgrid">' +
        '<div class="dg"><span>ทุน / กก.</span><b>' + p.cost + ' ฿</b></div>' +
        '<div class="dg lead"><span>ราคาส่ง 2kg</span><b>' + p.w2 + ' ฿</b></div>' +
        '<div class="dg"><span>margin</span><b style="color:' + mgc + '">' + p.margin + '%</b></div>' +
        '<div class="dg"><span>จุดคุ้ม</span><b>' + p.floorPrice + ' ฿</b></div>' +
        '</div>';

      h += '<h4>ราคาทุกระดับ</h4><div class="dgrid c4">' +
        [['ปลีก', p.retail], ['ส่ง 2kg', p.w2], ['ส่ง 5kg', p.s5], ['ส่ง 10kg+', p.s10]]
          .map(function (x) { return '<div class="dg sm"><span>' + x[0] + '</span><b>' +
            x[1] + ' ฿</b></div>'; }).join('') + '</div>' +
        '<p class="dnote">เซลล์ลดได้ถึง <b>' + p.saleFloor + ' ฿</b> (เพดาน ' + j.haggle + ' ฿) ' +
        'ต่ำกว่านี้ต้องขออนุมัติ</p>';

      var any = j.marks.filter(function (m) { return m.price > 0; });
      h += '<h4>ราคาคู่แข่ง</h4>' + (any.length
        ? '<table class="dtbl"><tbody>' + j.marks.map(function (m) {
            if (!m.price) return '<tr><td>' + esc(m.label) + '</td>' +
              '<td colspan="2" style="color:var(--tx-3)">ยังไม่รู้ราคา</td></tr>';
            var gap = p.w2 - m.price;
            return '<tr><td>' + esc(m.label) + '<em>' + (m.tier === 'r' ? 'ปลีก' : 'ส่ง') + '</em></td>' +
              '<td' + (m.state === 'expired' ? ' style="text-decoration:line-through;color:var(--tx-3)"' : '') +
              '>' + m.price + ' ฿</td><td>' +
              (m.state === 'expired'
                ? '<span class="pill2 a">เก่า ' + m.age + ' วัน</span>'
                : gap > 0 ? '<span class="pill2 r">เราแพงกว่า ' + gap + '</span>'
                : gap < 0 ? '<span class="pill2 g">เราถูกกว่า ' + (-gap) + '</span>'
                : '<span class="pill2 b">เท่ากัน</span>') + '</td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="dnote">ยังไม่รู้ราคาใครเลย — ราคาตัวนี้ตั้งจากทุน + ส่วนเผื่อล้วน</p>');

      h += '<h4>ใครซื้อตัวนี้ (' + j.customers.length + ' เจ้า)</h4>' + (j.customers.length
        ? '<table class="dtbl"><thead><tr><th>ลูกค้า</th><th>ได้ราคา</th><th>margin</th></tr></thead>' +
          '<tbody>' + j.customers.map(function (c) {
            return '<tr><td>' + esc(c.name) + '</td><td>' + c.price + ' ฿</td>' +
              '<td style="color:' + (c.margin < 0 ? 'var(--red)'
                : c.margin < j.floorPct ? 'var(--amber)' : 'var(--green)') + '">' +
              c.margin + '%</td></tr>'; }).join('') + '</tbody></table>'
        : '<p class="dnote">ยังไม่มีเจ้าไหนล็อกราคาตัวนี้ — ทุกเจ้าใช้ราคากลาง</p>');

      if (j.hist.length > 1) {
        var ps = j.hist.map(function (x) { return x.price; });
        var cs = j.hist.map(function (x) { return x.cost || x.price; });
        var lo = Math.min.apply(null, ps.concat(cs)) - 3;
        var hi = Math.max.apply(null, ps.concat(cs)) + 3;
        var W2 = 300, H2 = 70;
        var X = function (i) { return (i / (j.hist.length - 1) * W2).toFixed(1); };
        var Y = function (v) { return ((1 - (v - lo) / (hi - lo)) * H2).toFixed(1); };
        var ln = function (a) { return a.map(function (v, i) {
          return (i ? 'L' : 'M') + X(i) + ' ' + Y(v); }).join(' '); };
        h += '<h4>ราคาย้อนหลัง ' + j.hist.length + ' งวด</h4>' +
          '<svg class="dspark" viewBox="0 -6 ' + W2 + ' ' + (H2 + 12) + '">' +
          '<path d="' + ln(cs) + '" fill="none" stroke="var(--tx-3)" stroke-width="1.5" ' +
            'stroke-dasharray="4 3"/>' +
          '<path d="' + ln(ps) + '" fill="none" stroke="var(--blue)" stroke-width="2.2"/>' +
          '<circle cx="' + X(j.hist.length - 1) + '" cy="' + Y(ps[ps.length - 1]) +
            '" r="4" fill="var(--red)"/></svg>' +
          '<p class="dnote">เส้นทึบ = ราคาที่ออก · เส้นประ = ทุน · ' +
          'ล่าสุด ' + ps[ps.length - 1] + ' ฿ · เคยสูงสุด ' + Math.max.apply(null, ps) +
          ' · ต่ำสุด ' + Math.min.apply(null, ps) + '</p>';
      }

      h += '<div class="drw-ft">' +
        '<a class="btn" href="/costs?q=' + encodeURIComponent(p.name) + '">แก้ทุน / ราคาตลาด</a>' +
        '<a class="btn pri" href="/sales?q=' + encodeURIComponent(p.name) + '">ดูในตารางขาย</a>' +
        '</div></div>';
      d.innerHTML = h;
    }).catch(function (e) {
      d.innerHTML = '<div class="drw-bo"><p class="err">เปิดไม่ได้ — ' + esc(e.message) + '</p></div>';
    });
  }
  function closeProduct() {
    var d = document.getElementById('pdrawer'), sc = document.getElementById('pscrim');
    if (d) d.classList.remove('on');
    if (sc) sc.classList.remove('on');
  }

  /* ประเภทปัญหาจากลูกค้า — ชุดเดียวทั้งหน้าเซลล์และหน้าผู้บริหาร (นับ "เรื่องเดิมเกิดซ้ำ" ด้วยชื่อประเภท)
     เรื่องส่ง/ขนส่ง ต้องบอกผู้ขนส่ง — ตรงกับด่านที่ server (/api/service-logs) */
  var ISSUE_TYPES = ['คุณภาพหมู', 'ส่งช้า / ระยะเวลาส่ง', 'ส่งก่อนเวลา', 'ระบบขนส่ง / อุณหภูมิ', 'สินค้าเสียหาย', 'สินค้าผิด / ขาด', 'อื่นๆ'];
  function issueNeedsCarrier(t) { return /ขนส่ง|ส่งช้า|ล่าช้า|ก่อนเวลา|อุณหภูมิ/.test(String(t || '')); }


  /* ── ฟอร์มกลาง: รอบขนส่ง + prospect — หน้าผู้บริหารกับหน้าเซลล์ใช้ตัวเดียวกัน (เขียนผ่าน /api/deliveries · /api/prospects) ── */
  function deliveryForm(o, done){
    o=o||{}; var names=o.customers||[], carriers=o.carriers||[];
    var today=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
    var sel='style="width:100%;font-family:var(--ff);font-size:13.5px;padding:9px 12px;border:1px solid var(--line);border-radius:10px"';
    var m=PX.modal({title:'บันทึกรอบส่ง',sub:'เวลาส่งจริงเว้นว่างได้ถ้ารถยังไม่ถึง — มาใส่ทีหลัง',
      html:'<datalist id="dlvCust">'+names.map(function(n){return '<option value="'+esc(n)+'"></option>';}).join('')+'</datalist>'+
        '<datalist id="dlvCar">'+carriers.map(function(n){return '<option value="'+esc(n)+'"></option>';}).join('')+'</datalist>'+
        '<label class="fld"><span>ส่งครบตามออเดอร์ไหม</span><select data-k="in_full" '+sel+'><option value="1">ครบ</option><option value="0">ไม่ครบ</option></select></label>',
      fields:[{k:'delivered_on',label:'วันที่ส่ง',value:today},{k:'round',label:'รอบ',ph:'เช่น รอบเช้า / รอบโรงแรม'},
        {k:'carrier',label:'ผู้ขนส่ง',ph:'เช่น รถบริษัท / Lalamove'},{k:'customer',label:'ลูกค้า (ถ้ามี)',ph:'พิมพ์แล้วเลือก'},
        {k:'promised',label:'เวลานัดส่ง',ph:'07:00'},{k:'actual',label:'เวลาส่งจริง',ph:'07:12 (เว้นว่างได้)'},{k:'note',label:'หมายเหตุ'}],
      okText:'บันทึก',
      onOk:function(v,close){ v.in_full=v.in_full!=='0'; return PX.post('/api/deliveries',v).then(function(){ close(); PX.toast('บันทึกรอบส่งแล้ว'); return done&&done(); }); }});
    var c=m.el.querySelector('[data-k="customer"]'); if(c) c.setAttribute('list','dlvCust');
    var k=m.el.querySelector('[data-k="carrier"]'); if(k) k.setAttribute('list','dlvCar');
    var d=m.el.querySelector('[data-k="delivered_on"]'); if(d){d.type='date';d.max=today;}
    ['promised','actual'].forEach(function(f){var e=m.el.querySelector('[data-k="'+f+'"]'); if(e) e.type='time';});
  }
  function deliveryFinish(r, done){
    var id=r.id;
    var sel='style="width:100%;font-family:var(--ff);font-size:13.5px;padding:9px 12px;border:1px solid var(--line);border-radius:10px"';
    var m=PX.modal({title:'เวลาส่งจริง · '+r.carrier,sub:esc(r.delivered_on+' · '+(r.round||'')+' · นัด '+r.promised),
      html:'<label class="fld"><span>ส่งครบตามออเดอร์ไหม</span><select data-k="in_full" '+sel+'><option value="1">ครบ</option><option value="0">ไม่ครบ</option></select></label>',
      fields:[{k:'actual',label:'เวลาส่งจริง',ph:'07:12'},{k:'note',label:'หมายเหตุ (ถ้าช้า บอกสาเหตุ)'}],okText:'บันทึก',
      onOk:function(v,close){ v.id=id; v.in_full=v.in_full!=='0'; return PX.post('/api/deliveries/update',v).then(function(){ close(); PX.toast('บันทึกแล้ว'); return done&&done(); }); }});
    var e=m.el.querySelector('[data-k="actual"]'); if(e) e.type='time';
  }
  
  function prospectForm(r, done){
    r=r||{}; var id=r.id||0;
    var today=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
    var sel='style="width:100%;font-family:var(--ff);font-size:13.5px;padding:9px 12px;border:1px solid var(--line);border-radius:10px"';
    var ST=[['new','ใหม่'],['contacted','คุยแล้ว'],['quoted','เสนอราคาแล้ว'],['won','ได้ลูกค้า'],['lost','ไม่ได้']];
    var m=PX.modal({title:id?'แก้ prospect · '+r.name:'เพิ่ม prospect',
      html:'<label class="fld"><span>ขั้น</span><select data-k="stage" '+sel+'>'+ST.map(function(x){return '<option value="'+x[0]+'"'+(r.stage===x[0]?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select></label>',
      fields:[{k:'name',label:'ชื่อลูกค้า / ร้าน',value:r.name},{k:'contact',label:'ผู้ติดต่อ / เบอร์',value:r.contact},
        {k:'value_month',label:'มูลค่าคาดการณ์ต่อเดือน (บาท)',value:r.value_month,type:'num'},{k:'owner',label:'เซลล์ที่ดูแล',value:r.owner},
        {k:'last_contact',label:'คุยล่าสุดวันที่',value:(r.last_contact||today).slice(0,10)},{k:'next_step',label:'ขั้นต่อไป',value:r.next_step}],
      okText:'บันทึก',
      onOk:function(v,close){ if(id) v.id=id; return PX.post('/api/prospects',v).then(function(){ close(); PX.toast('บันทึกแล้ว'); return done&&done(); }); }});
    var d=m.el.querySelector('[data-k="last_contact"]'); if(d){d.type='date';d.max=today;}
  }

  /* เวลาแบบอ่านง่าย: "3 นาทีก่อน" · "เมื่อวาน 14:02" — หน้า log/กระดานใช้ร่วมกัน */
  function ago(iso) {
    if (!iso) return '—';
    var t = Date.parse(String(iso).length <= 10 ? iso + 'T00:00:00+07:00' : iso + (/[Z+]/.test(iso) ? '' : '+07:00')); if (isNaN(t)) return String(iso);
    var d = (Date.now() - t) / 1000;
    if (d < 60) return 'เมื่อกี้'; if (d < 3600) return Math.floor(d / 60) + ' นาทีก่อน'; if (d < 86400) return Math.floor(d / 3600) + ' ชม.ก่อน';
    if (d < 86400 * 7) return Math.floor(d / 86400) + ' วันก่อน';
    return String(iso).slice(0, 10).split('-').reverse().join('/');
  }
  return { esc: esc, money: money, shell: shell, ago: ago, badge: badge, why: why, pageNums: pageNums,
           ISSUE_TYPES: ISSUE_TYPES, issueNeedsCarrier: issueNeedsCarrier,
           bindTips: bindTips, get: get, fail: fail, head: head, back: back, COL: COL,
           deliveryForm: deliveryForm, deliveryFinish: deliveryFinish, prospectForm: prospectForm,
           post: post, toast: toast, modal: modal, csv: csv, tools: tools,
           product: product, closeProduct: closeProduct, applyRole: applyRole };
})();
