/* หน้าที่ลูกค้าเห็นจากลิงก์ใบราคา (/q/:token) — ใช้ร่วมกันระหว่าง server.js และไฟล์เดโม
   ส่งออกเฉพาะ customer-safe fields: สินค้า · ราคารอบก่อน · ราคาใหม่ · ส่วนต่าง · ปุ่มยืนยัน/ขอต่อรอง (ไม่มีทุน/margin/ขั้นต่ำ/คู่แข่ง) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FHQuotePage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function E(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var CSS = "body{margin:0;font-family:'IBM Plex Sans Thai',system-ui,sans-serif;background:#f6f2ed;color:#1d1a17}.w{max-width:760px;margin:0 auto;padding:20px 16px 60px}.hd{display:flex;align-items:center;gap:12px;margin-bottom:6px}.mk{width:38px;height:38px;border-radius:10px;background:#DF3A20;color:#fff;display:grid;place-items:center;font-weight:700;font-size:20px}" +
    "h1{font-size:20px;margin:0}p.sub{margin:0 0 16px;color:#6b635b;font-size:13px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}th,td{padding:10px 12px;border-bottom:1px solid #eee7df;text-align:left;font-size:14px;vertical-align:middle}th{font-size:12px;color:#6b635b;font-weight:600;background:#fbf8f4}" +
    "td small{display:block;color:#9a9087;font-size:11.5px}.n{text-align:right;font-variant-numeric:tabular-nums}.big{font-weight:700;font-size:16px}.up{color:#c0392b}.dn{color:#1e8449}.pill{display:inline-block;padding:3px 9px;border-radius:999px;background:#eee7df;font-size:12px;font-weight:600}.pill.g{background:#e3f5e9;color:#1e8449}.pill.a{background:#fff3d6;color:#9a6700}" +
    "button{font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid #e4ddd5;background:#fff;cursor:pointer}button.ok{background:#1d1a17;color:#fff;border-color:#1d1a17}.bar{display:flex;gap:10px;align-items:center;margin:14px 0;flex-wrap:wrap}.bar b{font-size:13px}.msg{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#1d1a17;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;display:none}.ft{margin-top:18px;font-size:12px;color:#6b635b}" +
    "@media(max-width:560px){th:nth-child(2),td:nth-child(2){display:none}td,th{padding:8px}}";
  /* q = ผลจาก store.publicQuote(token) · null = ลิงก์ใช้ไม่ได้ */
  function render(q, token) {
    if (!q) return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ลิงก์หมดอายุ</title></head><body style="font-family:system-ui;padding:40px;text-align:center"><h2>ลิงก์นี้ใช้ไม่ได้แล้ว</h2><p>ติดต่อเซลล์ Freshour เพื่อขอลิงก์ใหม่</p></body></html>';
    var rows = q.rows.map(function (r) {
      return '<tr data-p="' + E(r.pid) + '"><td><b>' + E(r.name) + '</b><small>' + E(r.grp) + '</small></td><td class="n">' + (r.prev || '—') + '</td><td class="n big">' + r.price + '</td>' +
        '<td class="n ' + (r.diff > 0 ? 'up' : r.diff < 0 ? 'dn' : '') + '">' + (r.diff == null ? '—' : (r.diff > 0 ? '+' : '') + r.diff) + '</td>' +
        '<td>' + (r.pending ? '<span class="pill a">รอ Freshour ตอบ ' + r.askWant + ' ฿</span>' : r.response === 'accept' ? '<span class="pill g">✓ ยืนยันแล้ว</span>' : r.response === 'decline' ? '<span class="pill">ไม่เอารอบนี้</span>' :
          '<button class="ok" onclick="act(\'' + E(r.pid) + '\',\'accept\')">ยืนยัน</button> <button onclick="nego(\'' + E(r.pid) + '\',' + r.price + ')">ขอต่อรอง</button>') + '</td></tr>';
    }).join('');
    var acc = q.rows.filter(function (r) { return r.response === 'accept'; }).length;
    return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ใบราคา Freshour · ' + E(q.customer) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet"><style>' + CSS + '</style></head><body><div class="w">' +
      '<div class="hd"><span class="mk">F</span><div><h1>ใบราคา Freshour · รอบ ' + E(q.label) + '</h1><p class="sub">สำหรับ <b>' + E(q.customer) + '</b> · ราคาส่ง ฿/กก. · กดยืนยันทีละรายการ หรือยืนยันทั้งใบ</p></div></div>' +
      '<div class="bar"><button class="ok" onclick="act(null,\'accept\',true)">ยืนยันทั้งใบ</button><b id="sum">ยืนยันแล้ว ' + acc + ' / ' + q.rows.length + ' รายการ</b></div>' +
      '<table><thead><tr><th>สินค้า</th><th class="n">รอบก่อน</th><th class="n">ราคาใหม่</th><th class="n">ต่าง</th><th>คำตอบ</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="ft">ราคานี้ใช้ได้ถึงรอบถัดไป · ขอต่อรองได้ทีละรายการ ทีมตั้งราคา Freshour จะตอบกลับในใบนี้</p></div><div class="msg" id="msg"></div>' +
      '<script>var T=' + JSON.stringify(token) + ';function say(t){var m=document.getElementById("msg");m.textContent=t;m.style.display="block";setTimeout(function(){m.style.display="none";},2600);}' +
      'function post(b){return fetch("/api/public-quotes/"+T+"/respond",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){if(!r.ok||j.error)throw new Error(j.error||r.status);return j;});});}' +
      'function reload(){if(window.__NAV&&!window.__NAV.native){__NAV.href="/q/"+T;}else location.reload();}' +
      'function act(p,k,all){post(all?{kind:k,all:true}:{product_id:p,kind:k}).then(function(){say("บันทึกคำตอบแล้ว ขอบคุณครับ");setTimeout(reload,700);}).catch(function(e){say("ไม่สำเร็จ — "+e.message);});}' +
      'function nego(p,px){var w=prompt("ราคาที่ต้องการ (฿/กก.) · ราคาเสนอ "+px+" ฿");if(!w)return;post({product_id:p,kind:"nego",want:Number(w),reason:"ลูกค้าขอผ่านลิงก์"}).then(function(){say("ส่งคำขอให้ Freshour แล้ว");setTimeout(reload,700);}).catch(function(e){say("ไม่สำเร็จ — "+e.message);});}' +
      '<\/script></body></html>';
  }
  return { render: render };
});
