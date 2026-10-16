#!/usr/bin/env node
/* สร้าง dist/freshour-demo.html — ทั้งระบบในไฟล์เดียว เปิดในเบราว์เซอร์ได้เลย ไม่ต้องมี server
   โครงเดียวกับไฟล์ "Freshour-ทุกหน้า" ที่พีชส่งมา: แถบเลือกหน้าด้านบน + iframe · ต่างกันที่ "หลังบ้าน" เป็น src/store.js ตัวเดียวกับ server.js
   → กดบันทึกแล้วเปลี่ยนจริง (เก็บใน localStorage ของเครื่องนั้น · ปุ่ม "ล้างข้อมูลทดสอบ" กลับชุดตั้งต้น) */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gz = s => zlib.gzipSync(Buffer.from(s, 'utf8'), { level: 9 }).toString('base64');
const PAGES = JSON.parse(rd('data/pages.json'));
const idx = JSON.parse(rd('data/fixtures/index.json'));
const DOCS = {}; for (const k of Object.keys(idx)) DOCS[k] = fs.readFileSync(path.join(ROOT, 'data/fixtures', idx[k])).toString('base64');
const PAGE_SRC = {}; for (const p of PAGES) PAGE_SRC[p.id] = gz(rd('public/' + p.id + '.html'));
/* เวอร์ชันข้อมูล: เปลี่ยนเมื่อ fixture/ตัวอ่านไฟล์/หลังบ้านเปลี่ยน → สิ่งที่เคยบันทึกไว้ในเบราว์เซอร์จากเวอร์ชันก่อน (เช่น import ทุนจากตัวอ่านเก่าที่อ่านคอลัมน์ผิด) จะไม่ถูกเล่นซ้ำทับข้อมูลชุดใหม่ */
const DATA_VERSION = require('crypto').createHash('sha1').update(Object.keys(DOCS).sort().map(k => DOCS[k]).join('|') + rd('public/alparse.js') + rd('src/store.js') + rd('src/ext.js')).digest('hex').slice(0, 10);
const ASSETS = {}; ['peach.css', 'peach.js', 'catmargin.js', 'charts.js', 'dash.js', 'aiperf.js', 'alparse.js', 'costimport.js', 'trend.js', 'intake.js'].forEach(f => { ASSETS['/' + f] = gz(rd('public/' + f)); });
const FEED = fs.readFileSync(path.join(ROOT, 'data/market-feed-sample.json'), 'utf8');
const stamp = new Date(Date.now() + 7 * 3600e3);
const TH = `${stamp.getUTCDate()} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][stamp.getUTCMonth()]} ${stamp.getUTCFullYear() + 543}`;

const html = `<!doctype html>
<html lang="th"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Freshour · ต้นแบบใช้งานได้ (ทุกหน้า)</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap">
<style>
:root{--ink:#0F172A;--mute:#64748B;--line:#E6EAF2;--soft:#F5F6FA;--act:#0052F3;--bar:#fff}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;background:var(--soft);color:var(--ink);font-family:'Prompt','Sukhumvit Set','Thonburi',sans-serif;font-size:14px}
.reset{position:fixed;right:10px;bottom:10px;z-index:20;font:inherit;font-size:11px;color:var(--mute);background:rgba(255,255,255,.9);border:1px solid var(--line);border-radius:999px;padding:4px 10px;cursor:pointer;opacity:.55}.reset:hover{opacity:1}
.stage{flex:1;position:relative;min-height:0}iframe{border:0;width:100%;height:100%;background:#fff;display:block}
.toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw;z-index:9}
.toast.on{opacity:1}.load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mute);background:#fff}
</style></head><body>
<button class="reset" type="button" onclick="RESET()" title="ล้างข้อมูลทดสอบที่บันทึกไว้ในเครื่องนี้ กลับชุดตั้งต้น">⟲ ล้างข้อมูลทดสอบ</button>
<div class="stage"><div class="load" id="load">กำลังเตรียมข้อมูล…</div><iframe id="fr" title="หน้าเว็บ"></iframe></div>
<div class="toast" id="toast"></div>
<script>${rd('src/ext.js')}</script>
<script>${rd('src/store.js')}</script>
<script>${rd('src/quote-page.js')}</script>
<script>
var PAGES=${JSON.stringify(PAGES)};
var DOCS_B64=${JSON.stringify(DOCS)};
var PAGE_SRC=${JSON.stringify(PAGE_SRC)};
var ASSET_SRC=${JSON.stringify(ASSETS)};
var DATA_VERSION=${JSON.stringify(DATA_VERSION)};var FEED_B64=${JSON.stringify(gz(FEED))};var SAMPLE=${process.env.FH_SAMPLE_MARKET === '1' ? 'true' : 'false'};
(function(){
  var fr=document.getElementById('fr'),LS='fh-demo-journal:'+DATA_VERSION,RS='fh-demo-role',OLD_LS=Object.keys(localStorage).filter(function(k){return k==='fh-demo-journal'||(k.indexOf('fh-demo-journal:')===0&&k!==LS);});
  var ROLE=sessionStorage.getItem(RS)||null,STORE=null,CUR=null,HIST=[],cache={};
  /* ROLE อาจเป็น "sale|s1" (เซลล์ + รหัสคนขาย) — บทบาทจริงคือส่วนหน้า | */
  function roleOnly(r){return String(r||'').split('|')[0]||null;}function repOf(r){return String(r||'').split('|')[1]||null;}
  function unzip(b64){var bin=atob(b64),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
  function cached(k,b64){return cache[k]||(cache[k]=unzip(b64));}
  function toast(t){var el=document.getElementById('toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('on');},2600);}
  function journal(e){try{var j=JSON.parse(localStorage.getItem(LS)||'[]');j.push(e);localStorage.setItem(LS,JSON.stringify(j));}catch(x){}}
  window.RESET=function(){if(!confirm('ล้างทุกอย่างที่บันทึกไว้ในเครื่องนี้ กลับเป็นชุดตั้งต้น?'))return;localStorage.removeItem(LS);sessionStorage.removeItem(RS);location.reload();};
  function who(){}
  /* ตัวแทน fetch/location ในหน้า — ยิงมาที่ store ในกรอบนอกผ่าน postMessage (ส่ง body ด้วย) */
  function shim(page,search){
    return '<script>(function(){var PATH='+JSON.stringify('/'+page)+',SEARCH='+JSON.stringify(search||'')+',n=0,pend={};'+
      'window.__NAV={native:false,get search(){return SEARCH},get pathname(){return PATH},get href(){return PATH+SEARCH},set href(h){parent.postMessage({go:String(h)},"*")},replaceState:function(){},back:function(){parent.postMessage({back:1},"*")}};'+
      'window.location.reload=function(){parent.postMessage({go:PATH+SEARCH},"*")};'+
      'try{navigator.sendBeacon=function(u,b){var t=b&&b.text?b.text():Promise.resolve(String(b||""));t.then(function(s){parent.postMessage({fx:{id:0,url:String(u),method:"POST",body:s}},"*")});return true}}catch(e){}'+
      'window.fetch=function(u,o){return new Promise(function(res){var id=++n;pend[id]=res;parent.postMessage({fx:{id:id,url:String(u),method:(o&&o.method)||"GET",body:o&&o.body?String(o.body):""}},"*")})};'+
      'addEventListener("message",function(e){var d=e.data&&e.data.fxr;if(!d||!pend[d.id])return;var t=d.t;pend[d.id]({ok:d.s>=200&&d.s<300,status:d.s,json:function(){return Promise.resolve(JSON.parse(t))},text:function(){return Promise.resolve(t)},headers:{get:function(){return null}}});delete pend[d.id]});'+
      'document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href^=\\\\"/\\\\"]");if(a&&a.target!=="_blank"){e.preventDefault();e.stopPropagation();parent.postMessage({go:a.getAttribute("href")},"*")}else if(a){e.preventDefault();parent.postMessage({go:a.getAttribute("href")},"*")}},true);'+
      '})();<\\/script>';
  }
  function show(h){fr.srcdoc=h;fr.onload=function(){document.getElementById('load').style.display='none';};}
  function open(id,search,push){
    var page=PAGES.filter(function(p){return p.id===id;})[0];
    if(!page){toast('ไม่มีหน้านี้');return;}
    if(push!==false&&CUR)HIST.push(CUR);
    CUR={id:id,search:search||''};
    document.getElementById('load').style.display='flex';
    var names=Object.keys(ASSET_SRC);
    Promise.all([cached('p:'+id,PAGE_SRC[id])].concat(names.map(function(n){return cached('a:'+n,ASSET_SRC[n]);}))).then(function(v){
      var h=v[0].replace(/<head([^>]*)>/i,function(m){return m+shim(page.id,search);});
      names.forEach(function(n,i){var body=v[i+1];
        if(/\\.css$/.test(n)) h=h.replace('<link rel="stylesheet" href="'+n+'">',function(){return '<style>'+body+'</style>';});
        else h=h.replace('<script src="'+n+'"><\\/script>',function(){return '<script>'+body.replace(/<\\/script>/g,'<\\\\/script>')+'<\\/script>';});});
      show(h);
    });
  }
  var HOME={boss:'/exec',admin:'/exec',ops:'/pricing',sale:'/sales'};
  function route(href){
    var a=document.createElement('a');a.href='https://x'+(href.charAt(0)==='/'?href:'/'+href);
    var p=a.pathname.replace(/\\.html$/,'').replace(/\\/+$/,'')||'/';
    var MOVED={'/price':'/pricing','/market':'/costs','/trend':'/costs?tab=trend','/index':'/'};if(MOVED[p]){a.href='https://x'+MOVED[p];p=a.pathname;}
    if(p==='/logout'){ROLE=null;sessionStorage.removeItem(RS);who();p='/login';}
    if(p==='/')p=ROLE?HOME[roleOnly(ROLE)]:'/login';
    var qm=p.match(/^\\/q\\/([A-Za-z0-9]+)$/);
    if(qm){CUR={id:'q',search:''};document.getElementById('load').style.display='flex';var h=FHQuotePage.render(STORE.publicQuote(qm[1]),qm[1]).replace(/<head([^>]*)>/i,function(m){return m+shim('q/'+qm[1],'');});show(h);return;}
    open(p.slice(1),a.search);
  }
  addEventListener('message',function(e){
    var d=e.data||{};
    if(d.go)return route(d.go);
    if(d.back){var b=HIST.pop();if(b)open(b.id,b.search,false);else route('/');return;}
    if(!d.fx)return;
    var q=d.fx,src=e.source,body={};
    try{body=q.body?JSON.parse(q.body):{};}catch(x){}
    var entry={method:q.method,url:q.url.replace(/^https?:\\/\\/[^/]+/,''),body:body,role:roleOnly(ROLE)||'anon',rep:repOf(ROLE),origin:''};
    var r=entry.url==='/api/market-feed-sample'?{status:200,body:window.__FEED||{rows:[]}}:entry.url==='/api/connectors/test'?(function(){STORE.ext.sourceFail(body.competitor_id,'ไฟล์เดโมในเบราว์เซอร์ดึงข้ามโดเมนไม่ได้ — ของจริงให้ server ดึง');return {status:200,body:{ok:false,error:'เบราว์เซอร์ดึงข้ามโดเมนไม่ได้ (ต้องให้ server ดึง)'}};})():STORE.handle(entry);
    if('session' in r){ROLE=r.session;if(ROLE)sessionStorage.setItem(RS,ROLE);else sessionStorage.removeItem(RS);who();}
    else if(q.method!=='GET'&&r.status<300&&!/\\/(parse|connectors\\/test|log)$/.test(entry.url))journal({method:entry.method,url:entry.url,body:body,role:entry.role,at:new Date().toISOString()});
    if(q.id)src.postMessage({fxr:{id:q.id,s:r.status,t:JSON.stringify(r.body)}},'*');
  });
  /* เตรียมข้อมูล: แตกทุกก้อน → store → เล่นซ้ำสิ่งที่เคยบันทึกในเครื่องนี้ */
  var keys=Object.keys(DOCS_B64),docs={};
  Promise.all(keys.map(function(k){return unzip(DOCS_B64[k]).then(function(t){docs[k]=JSON.parse(t);});})).then(function(){
    STORE=FHStore.createStore(docs,{dataNote:'สินค้า/ทุน/ราคาจากใบราคาขาย+ทุน AL 01-07/10/69 · ลูกค้า/สัญญา/ยอดขายจากระบบเดิม (ก.ย. 69) · ราคาตลาด: '+(SAMPLE?'ตัวอย่างสมมติ (ไม่ใช่ของจริง)':'ยังไม่มี — ของจริงต้องต่อ connector หรือสำรวจหน้าร้าน'),sampleMarket:SAMPLE});
    /* งานที่ระบบทำเอง (เวอร์ชันในเบราว์เซอร์): ดึงราคาตลาดจาก feed ตัวอย่างตอนเปิด · ส่ง LINE แบบจำลองทุก 15 วิ */
    window.__loadSampleMarket=function(){return unzip(FEED_B64).then(function(t){var rows=JSON.parse(t).rows;window.__FEED={rows:rows};return STORE.handle({method:'POST',url:'/api/market-sync/run',body:{observations:rows},role:'system'});});};
    if(SAMPLE)window.__loadSampleMarket();
    setInterval(function(){STORE.ext.drainOutbox(null).then(function(n){if(n)toast('ส่ง LINE (จำลอง) '+n+' ข้อความ');});},15000);
    /* ของที่บันทึกไว้จากเวอร์ชันก่อน: ไม่เล่นซ้ำ (ข้อมูล/ตัวอ่านเปลี่ยนแล้ว) — ลบทิ้งและบอกผู้ใช้ */
    if(OLD_LS.length){var oldN=0;OLD_LS.forEach(function(k){try{oldN+=(JSON.parse(localStorage.getItem(k)||'[]')).length;}catch(x){}localStorage.removeItem(k);});if(oldN)toast('เวอร์ชันข้อมูลเปลี่ยน — ล้างสิ่งที่ทดสอบไว้จากเวอร์ชันก่อน '+oldN+' รายการ');}
    var j=[];try{j=JSON.parse(localStorage.getItem(LS)||'[]');}catch(x){}
    j.forEach(function(e){try{STORE.handle(e);}catch(x){}});
    if(j.length)toast('โหลดสิ่งที่บันทึกไว้ในเครื่องนี้ '+j.length+' รายการ');
    who();
    route((location.hash||'').slice(1)||'/');
  }).catch(function(e){document.getElementById('load').textContent='เปิดไม่ได้ — เบราว์เซอร์นี้ไม่รองรับ (ต้องเป็น Chrome/Edge/Safari รุ่นใหม่): '+e.message;});
})();
</script>
</body></html>`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'freshour-demo.html'), html);
console.log('dist/freshour-demo.html', (html.length / 1048576).toFixed(2), 'MB');
