#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   Freshour pricing · prototype server (Node ≥ 18 · ไม่มี dependency)

   node server.js            → http://localhost:8787
   FH_PORT=3000              → เปลี่ยนพอร์ต
   บัญชีผู้ใช้              → node tools/users.js add <id> --role ops --name "พี่จุ๋ม" (เก็บใน data/var/users.json)
   FH_DEV_OPEN=1             → เครื่องพัฒนา: ไม่มีบัญชีก็เลือกบทบาทแล้วเข้าได้เลย (ห้ามใช้บน production)
   FH_VAR_DIR=/path          → ที่เก็บของที่เปลี่ยนได้ (journal/บัญชี/session/inbox) · ค่าเริ่มต้น data/var · mount volume ตรงนี้
   FH_JOURNAL=0              → ไม่จำสิ่งที่บันทึกข้ามการรีสตาร์ท
   LINE_CHANNEL_SECRET       → ต้องตั้งเมื่อเปิด webhook จริง (ไม่ตั้ง = webhook ปิด ยกเว้น FH_DEV_OPEN=1)
   LINE_STAFF_USER_IDS       → LINE userId ของทีมงานที่พิมพ์ "ทุน …"/"ตลาด …" เข้า OA ได้ (คั่นด้วย ,)
   npm run reset             → ล้างข้อมูลที่ทดสอบไว้ กลับเป็นชุดตั้งต้น
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { createStore } = require('./src/store');
const { createAuth } = require('./src/auth');
const QuotePage = require('./src/quote-page');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.FH_PORT || process.env.PORT || 8787);
/* ของที่เปลี่ยนได้ตอนรัน (journal · บัญชี · session · inbox) แยกโฟลเดอร์จาก fixtures — volume ของ Render/Fly mount ที่นี่ ไม่ทับข้อมูลตั้งต้น */
const VAR = process.env.FH_VAR_DIR || path.join(DATA, 'var');
try { fs.mkdirSync(VAR, { recursive: true }); } catch (e) { /* อ่านอย่างเดียวก็ยังเปิดได้ */ }
const JOURNAL = process.env.FH_JOURNAL === '0' ? null : path.join(VAR, 'journal.jsonl');
const LEGACY_JOURNAL = path.join(DATA, 'journal.jsonl');
if (JOURNAL && !fs.existsSync(JOURNAL) && fs.existsSync(LEGACY_JOURNAL)) { try { fs.copyFileSync(LEGACY_JOURNAL, JOURNAL); } catch (e) { /* ใช้ของเก่าต่อ */ } }
const DEV_OPEN = process.env.FH_DEV_OPEN === '1';
const PAGES = require('./data/pages.json').map(p => p.id);

/* ── ข้อมูลตั้งต้น ── */
function loadDocs() {
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'fixtures', 'index.json'), 'utf8'));
  const docs = {};
  for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'fixtures', idx[k]))).toString('utf8'));
  return docs;
}

const t0 = Date.now();
const LINE_TOKEN = process.env.LINE_CHANNEL_TOKEN || '';
const LINE_ADMIN = process.env.LINE_ADMIN_USER_ID || '';
const MARKET_FEED_URL = process.env.MARKET_FEED_URL || '';
const SAMPLE_MARKET = process.env.FH_SAMPLE_MARKET === '1';   /* ราคาตลาดตัวอย่าง (ไม่ใช่ของจริง) — เปิดเฉพาะตอนทดสอบ UI */
const DATA_NOTE = 'สินค้า/ทุน/ราคาจากใบราคาขาย+ทุน AL 01-07/10/69 · ลูกค้า/สัญญา/ยอดขายจากระบบเดิม (ก.ย. 69) · ราคาตลาด: ' + (MARKET_FEED_URL ? 'connector ' + MARKET_FEED_URL : SAMPLE_MARKET ? 'ตัวอย่างสมมติ (ไม่ใช่ของจริง)' : 'ยังไม่ต่อ connector — ใช้สำรวจหน้าร้าน');
const LINE_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_STAFF = (process.env.LINE_STAFF_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
const auth = createAuth({ varDir: VAR, usersJson: process.env.FH_USERS_JSON, devOpen: DEV_OPEN, log: m => console.error('[freshour] auth:', m) });
if (auth.mode === 'locked') console.error('[freshour] ยังไม่มีบัญชีผู้ใช้ — ประตูปิดอยู่ · สร้างด้วย: node tools/users.js add <id> --role admin --name "ชื่อ"  (หรือ FH_DEV_OPEN=1 เฉพาะเครื่องพัฒนา)');
if (auth.mode === 'open') console.error('[freshour] FH_DEV_OPEN=1 — ไม่ต้องใส่รหัส ใช้เฉพาะเครื่องพัฒนาเท่านั้น');
const store = createStore(loadDocs(), { devOpen: auth.mode === 'open', lineConfigured: !!LINE_TOKEN, lineStaff: LINE_STAFF, dataNote: DATA_NOTE, sampleMarket: SAMPLE_MARKET });
if (!MARKET_FEED_URL && !SAMPLE_MARKET) { const mj = store.docs.jobs['market-sync']; if (mj && mj.status === 'never') { mj.status = 'off'; mj.detail = 'ยังไม่ต่อ connector ราคาตลาด (ตั้ง MARKET_FEED_URL) — ไม่นับเป็นระบบล้ม'; } }   /* ไม่มี connector = ปิด ไม่ใช่ล้ม — แถบแดง "ขาดรอบ" ทุกวันคือเสียงรบกวน */
let replayed = 0;
if (JOURNAL && fs.existsSync(JOURNAL)) {
  for (const line of fs.readFileSync(JOURNAL, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e.url === '/api/_drain') { store.docs.outbox.forEach(o => { if (o.status === 'queued') { o.status = 'simulated'; o.sent_at = o.at; } }); } else store.handle(e); replayed++; } catch (e) { /* บรรทัดเสีย — ข้าม */ }
  }
}
console.log(`[freshour] โหลดข้อมูล ${Object.keys(store.docs).length} ก้อน · เล่นซ้ำที่บันทึกไว้ ${replayed} รายการ · ${Date.now() - t0} ms`);

/* ── งานที่ระบบทำเอง (ไม่ใช่คนกด) — ทุกงานลง log กลาง · ล้มแล้วขึ้น alert + แจ้ง LINE admin ── */
async function lineTransport(to, text) {
  if (!LINE_TOKEN) return { simulated: true };
  const r = await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + LINE_TOKEN }, body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }) });
  if (!r.ok) throw new Error('LINE ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return { sent: true };
}
async function loadMarketFeed() {
  if (MARKET_FEED_URL) { const r = await fetch(MARKET_FEED_URL); if (!r.ok) throw new Error('feed ' + r.status); const j = await r.json(); return j.rows || j; }
  if (SAMPLE_MARKET) return JSON.parse(fs.readFileSync(path.join(DATA, 'market-feed-sample.json'), 'utf8')).rows;
  return null;
}
async function runMarketSync(reason) {
  try {
    const rows = await loadMarketFeed();
    const r = store.handle({ method: 'POST', url: '/api/market-sync/run', body: { observations: rows }, role: 'system' });
    if (r.status !== 200) throw new Error(r.body.error);
    journal({ method: 'POST', url: '/api/market-sync/run', body: { observations: rows }, role: 'system', at: new Date().toISOString(), system: true });
    console.log(`[freshour] market-sync (${reason}): ${r.body.added} ใหม่ · SKU ${r.body.coverage.known}/${r.body.coverage.total}`);
  } catch (e) { store.ext.alert('bad', 'ดึงราคาตลาดไม่สำเร็จ', e.message, 'market-sync'); console.error('[freshour] market-sync ล้ม:', e.message); }
}
async function notifyAlerts() {
  const open = store.docs.alerts.filter(a => !a.acked && !a.notified && a.level === 'bad');
  for (const a of open) {
    a.notified = true;
    const msg = `⚠ Freshour: ${a.title}\n${a.detail || ''}`.slice(0, 900);
    if (LINE_ADMIN) { try { await lineTransport(LINE_ADMIN, msg); } catch (e) { console.error('[freshour] แจ้ง admin ไม่ได้:', e.message); } }
    console.error('[freshour] ALERT', a.title, '—', a.detail);
  }
}
/* ── กล่องรับไฟล์ทุนจากโรงงาน (อัตโนมัติ): วางไฟล์ .csv/.json ใน data/inbox (จาก email forwarder / LINE bot / shared folder)
   ระบบอ่านทุก 20 วิ → เข้าด่านตรวจเดียวกับการอัปโหลด → ย้ายไป inbox/done · PDF/Excel ให้แปลงเป็น CSV ก่อน (หรืออัปโหลดในหน้าเว็บ ซึ่งอ่านได้ทั้งสองแบบ) ── */
const INBOX = process.env.FH_INBOX_DIR || path.join(VAR, 'inbox');
function parseCsv(text) {
  const rows = [], t = text.replace(/^\uFEFF/, ''); let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
function scanInbox() {
  try { fs.mkdirSync(path.join(INBOX, 'done'), { recursive: true }); } catch (e) { return; }
  for (const f of fs.readdirSync(INBOX)) {
    const fp = path.join(INBOX, f); if (!fs.statSync(fp).isFile() || !/\.(csv|json|txt)$/i.test(f)) continue;
    let rows = [], note = '';
    try {
      const txt = fs.readFileSync(fp, 'utf8');
      if (/\.json$/i.test(f)) { const j = JSON.parse(txt); rows = (j.rows || j).map(r => ({ product: r.product || r.name || r.sku, cost: r.cost || r.price })); }
      else { const t = parseCsv(txt); const head = t[0].map(x => String(x).toLowerCase()); let ni = head.findIndex(h => /สินค้า|รายการ|ชื่อ|product|item|sku/.test(h)), ci = head.findIndex(h => /ทุน|cost|ราคา|price/.test(h)); const hasHead = ni >= 0 || ci >= 0; if (ni < 0) ni = 0; if (ci < 0) ci = 1; rows = (hasHead ? t.slice(1) : t).map(r => ({ product: r[ni], cost: r[ci] })); }
      const r = store.handle({ method: 'POST', url: '/api/import/costs', body: { rows, commit: true, source: 'inbox: ' + f, channel: 'inbox' }, role: 'system' });
      note = r.status === 200 ? `ใช้ ${r.body.applied} · รอตรวจ ${r.body.flagged} · จับคู่ไม่ได้ ${r.body.problemCount}` : r.body.error;
      journal({ method: 'POST', url: '/api/import/costs', body: { rows, commit: true, source: 'inbox: ' + f, channel: 'inbox' }, role: 'system', at: new Date().toISOString(), system: true });
      store.handle({ method: 'POST', url: '/api/inbox/note', body: { file: f, status: r.status === 200 ? 'ok' : 'fail', detail: note }, role: 'system' });
      fs.renameSync(fp, path.join(INBOX, 'done', Date.now() + '-' + f));
      console.log('[freshour] inbox:', f, '→', note);
    } catch (e) { store.ext.alert('bad', 'อ่านไฟล์ทุนจากกล่องรับไม่ได้: ' + f, e.message, 'cost-import'); try { fs.renameSync(fp, path.join(INBOX, 'done', 'FAILED-' + Date.now() + '-' + f)); } catch (x) {} }
  }
}
/* ทดสอบว่าดึงราคาออนไลน์จากแหล่งนี้ได้ไหม — ดึงไม่ได้ 2 ครั้ง ระบบสลับเป็นโหมดสำรวจหน้าร้านเอง */
async function testConnector(cid) {
  const c = store.docs.pricelist.comps.find(x => x.id === cid); if (!c) return { ok: false, error: 'ไม่รู้จักแหล่ง' };
  const url = /^https?:/.test(c.source || '') ? c.source : c.source ? 'https://' + c.source : '';
  if (!url) { store.ext.sourceFail(cid, 'ยังไม่ระบุ URL ของแหล่งข้อมูล'); return { ok: false, error: 'ยังไม่ระบุ URL' }; }
  try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000); const r = await fetch(url, { method: 'GET', signal: ac.signal, headers: { 'user-agent': 'freshour-pricing/0.1 (+market-connector)' } }); clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ss = store.docs.source_status[cid] = store.docs.source_status[cid] || {}; ss.reachable = true; ss.last_try = new Date().toISOString(); ss.last_error = null;
    return { ok: true, status: r.status, note: 'ติดต่อได้ — ขั้นต่อไปคือ parser/feed ที่ได้รับสิทธิ์ของแหล่งนี้' };
  } catch (e) { const why = /abort/i.test(e.message) ? 'หมดเวลา 8 วินาที' : e.message.slice(0, 120); store.ext.sourceFail(cid, why); return { ok: false, error: why }; }
}
let draining = false;
async function tick() {
  if (draining) return; draining = true;
  try {
    const n = await store.ext.drainOutbox(lineTransport);
    if (n) journal({ method: 'POST', url: '/api/_drain', body: {}, role: 'system', at: new Date().toISOString(), system: true });
    const j = store.docs.jobs['market-sync'], age = j.last_run ? (Date.now() - Date.parse(j.last_run + '+07:00')) / 36e5 : 99;
    if (age > 24) { if (MARKET_FEED_URL || SAMPLE_MARKET) await runMarketSync('ครบรอบ 24 ชม.'); else { j.status = 'off'; j.detail = 'ยังไม่ต่อ connector ราคาตลาด (ตั้ง MARKET_FEED_URL) — ใช้สำรวจหน้าร้านแทน'; } }
    scanInbox();
    const fj = store.docs.jobs['followup-check'], fage = fj.last_run ? (Date.now() - Date.parse(fj.last_run + '+07:00')) / 36e5 : 99;
    if (fage > 24) { const fr = store.ext.followupTick(); journal({ method: 'POST', url: '/api/followups/tick', body: {}, role: 'system', at: new Date().toISOString(), system: true }); console.log('[freshour] followup-check:', JSON.stringify(fr).slice(0, 160)); }
    await notifyAlerts();
  } finally { draining = false; }
}
if (process.env.FH_JOBS !== '0') { setTimeout(tick, 800).unref(); setInterval(tick, 20000).unref(); }


/* ── session: cookie ถือแค่ id สุ่ม · ตัวจริงอยู่ฝั่ง server (src/auth.js) · logout = ลบจริง ── */
function sidOf(req) { const m = /(?:^|;\s*)fh_sid=([^;]+)/.exec(req.headers.cookie || ''); return m ? decodeURIComponent(m[1]) : null; }
function isHttps(req) { return process.env.FH_SECURE === '1' || (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'; }
function setSid(res, req, sid) {
  const sec = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', sid ? `fh_sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax${sec}; Max-Age=2592000`
                                  : `fh_sid=; Path=/; HttpOnly; SameSite=Lax${sec}; Max-Age=0`);
}
function ipOf(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }

/* LINE webhook: ตรวจลายเซ็นจาก body ดิบ (ไบต์เดียวกับที่ LINE เซ็น) ก่อนทำอะไรทั้งนั้น · ไม่ตั้ง secret = ปิด webhook (ยกเว้นเครื่องพัฒนา) */
function verifyLine(req, raw) {
  if (!LINE_SECRET) return DEV_OPEN;
  const sig = Buffer.from(String(req.headers['x-line-signature'] || ''), 'base64');
  const want = crypto.createHmac('sha256', LINE_SECRET).update(raw).digest();
  return sig.length === want.length && crypto.timingSafeEqual(sig, want);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
function send(res, status, body, type, extra) {
  const h = Object.assign({ 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra || {});
  res.writeHead(status, h); res.end(body);
}
function json(res, r) { send(res, r.status, JSON.stringify(r.body)); }
function redirect(res, to) { res.writeHead(302, { location: to, 'cache-control': 'no-store' }); res.end(); }
function file(res, p) {
  const ext = path.extname(p);
  send(res, 200, fs.readFileSync(p), MIME[ext] || 'application/octet-stream', ext === '.html' ? {} : { 'cache-control': 'public, max-age=300' });
}
const BODY_MAX = 5e6;
function readBody(req) {
  return new Promise(resolve => {
    const chunks = []; let n = 0, over = false;
    req.on('data', c => { n += c.length; if (n > BODY_MAX) { over = true; return; } chunks.push(c); });
    req.on('end', () => { if (over) return resolve({ __big: true, raw: '' }); const raw = Buffer.concat(chunks).toString('utf8'); try { resolve({ raw, body: raw ? JSON.parse(raw) : {} }); } catch (e) { resolve({ __bad: true, raw }); } });
    req.on('error', () => resolve({ raw: '', body: {} }));
  });
}
function journal(entry) {
  if (!JOURNAL) return;
  try { fs.appendFileSync(JOURNAL, JSON.stringify(entry) + '\n'); } catch (e) { console.error('[freshour] เขียน journal ไม่ได้', e.message); }
}
const HOME = { boss: '/exec', admin: '/exec', ops: '/pricing', sale: '/sales' };
const MOVED = { '/price': '/pricing', '/market': '/costs', '/trend': '/costs?tab=trend', '/index': '/' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = u.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  const sid = sidOf(req), sess = auth.get(sid); let role = sess ? sess.role : null, rep = sess ? sess.rep : null;
  /* เซลล์ต้องระบุคน — บัญชีเซลล์ที่ยังไม่ผูกชื่อในทีมขาย ให้เข้าระบบใหม่ (จะได้เห็นเฉพาะลูกค้าของตัวเอง) */
  if (role === 'sale' && !rep && (store.docs.state.sales_reps || []).length) { role = null; rep = null; }
  try {
    if (p === '/healthz') return json(res, { status: 200, body: { ok: true, up_s: Math.round((Date.now() - t0) / 1000), auth: auth.mode } });   /* liveness ของแพลตฟอร์ม — ไม่ปนกับเรื่องธุรกิจ */
    if (p === '/api/login' && req.method === 'POST') {
      const rb = await readBody(req); if (rb.__bad || rb.__big) return json(res, { status: 400, body: { error: 'อ่าน JSON ไม่ได้' } });
      const r = auth.login(rb.body, ipOf(req));
      if (r.session) { setSid(res, req, r.session.id); store.handle({ method: 'POST', url: '/api/log', role: r.session.role, rep: r.session.rep, body: { action: 'login', detail: (r.session.name || r.session.uid) + ' เข้าระบบ' } }); }
      else if (r.status === 401 || r.status === 429) store.handle({ method: 'POST', url: '/api/log', role: 'system', body: { action: 'login-fail', detail: 'เข้าระบบไม่สำเร็จ: ' + String(rb.body && (rb.body.user || rb.body.role) || '?').slice(0, 40) + ' จาก ' + ipOf(req), status: 'warn' } });
      return json(res, { status: r.status, body: r.body });
    }
    if (p === '/api/logout') { if (sid) auth.drop(sid); setSid(res, req, null); return json(res, { status: 200, body: { ok: true } }); }
    if (p === '/api/me') {
      if (!sess || !role) return json(res, { status: 200, body: { role: null, needPin: auth.mode !== 'open', mode: auth.mode, locked: auth.mode === 'locked' } });
      const r = store.handle({ method: 'GET', url: '/api/me', role, rep, body: {} });
      if (r.status === 200) Object.assign(r.body, { needPin: auth.mode !== 'open', mode: auth.mode, user: { id: sess.uid, name: sess.name } });
      return json(res, r);
    }
    if (p === '/api/connectors/test' && req.method === 'POST') { if (!role || store.LVL[role] < 2) return json(res, { status: 403, body: { error: 'ไม่มีสิทธิ์' } }); const b = (await readBody(req)).body || {}; const r = await testConnector(b.competitor_id); return json(res, { status: 200, body: r }); }
    if (p === '/api/line/content') {   /* รูป/ไฟล์ที่ส่งเข้า LINE OA → ดึงมาอ่านในเบราว์เซอร์ (OCR) — เฉพาะ Pricing ขึ้นไป */
      if (!role || store.LVL[role] < 2) return json(res, { status: 403, body: { error: 'ไม่มีสิทธิ์' } });
      if (!LINE_TOKEN) return json(res, { status: 503, body: { error: 'ยังไม่ตั้ง LINE_CHANNEL_TOKEN' } });
      const mid = String(u.searchParams.get('id') || '').replace(/[^0-9A-Za-z_-]/g, ''); if (!mid) return json(res, { status: 400, body: { error: 'ไม่มี id' } });
      const lr = await fetch('https://api-data.line.me/v2/bot/message/' + mid + '/content', { headers: { authorization: 'Bearer ' + LINE_TOKEN } });
      if (!lr.ok) return json(res, { status: 502, body: { error: 'LINE ' + lr.status } });
      const buf = Buffer.from(await lr.arrayBuffer()); res.writeHead(200, { 'content-type': lr.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=300' }); return res.end(buf);
    }
    if (p === '/api/market-feed-sample') { if (!role) return json(res, { status: 401, body: { error: 'กรุณาเข้าระบบ' } }); return send(res, 200, fs.readFileSync(path.join(DATA, 'market-feed-sample.json'))); }
    if (p.startsWith('/api/')) {
      const rb = req.method === 'GET' || req.method === 'HEAD' ? { raw: '', body: {} } : await readBody(req);
      if (rb.__big) return json(res, { status: 413, body: { error: 'ไฟล์/ข้อมูลใหญ่เกิน 5 MB' } });
      if (rb.__bad) return json(res, { status: 400, body: { error: 'อ่าน JSON ไม่ได้' } });
      const body = rb.body;
      if (p === '/api/line/webhook') {   /* ตรวจลายเซ็นก่อน แล้วค่อยให้ store แตะข้อมูล */
        if (req.method !== 'POST') return json(res, { status: 405, body: { error: 'POST เท่านั้น' } });
        if (!LINE_SECRET && !DEV_OPEN) return json(res, { status: 503, body: { error: 'webhook ปิดอยู่ — ยังไม่ตั้ง LINE_CHANNEL_SECRET' } });
        if (!verifyLine(req, rb.raw)) return json(res, { status: 401, body: { error: 'ลายเซ็น LINE ไม่ถูกต้อง' } });
      }
      const entry = { method: req.method, url: u.pathname + u.search, body, role: role || 'anon', rep: rep || null, user: sess ? sess.uid : null, origin: `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}` };
      const r = store.handle(entry);
      if (req.method !== 'GET' && r.status < 300 && !/\/api\/(login|logout|survey\/parse)$/.test(p)) journal({ method: entry.method, url: entry.url, body, role: entry.role, rep: entry.rep, at: new Date().toISOString() });
      return json(res, r);
    }
    if (p === '/logout') { if (sid) auth.drop(sid); setSid(res, req, null); return redirect(res, '/login'); }
    if (MOVED[p]) { if (MOVED[p].indexOf('?') >= 0) return redirect(res, MOVED[p]); p = MOVED[p]; }
    if (p === '/') return redirect(res, role ? HOME[role] || '/pricing' : '/login');
    const qm = p.match(/^\/q\/([A-Za-z0-9]+)$/);
    if (qm) return send(res, 200, QuotePage.render(store.publicQuote(qm[1]), qm[1]), MIME['.html']);
    if (PAGES.includes(p.slice(1))) return file(res, path.join(PUB, p.slice(1) + '.html'));
    const sp = path.normalize(path.join(PUB, u.pathname));
    if (sp.startsWith(PUB) && fs.existsSync(sp) && fs.statSync(sp).isFile()) return file(res, sp);
    send(res, 404, '<!doctype html><meta charset="utf-8"><title>404</title><p style="font-family:system-ui;padding:40px">ไม่มีหน้านี้ — <a href="/">กลับหน้าแรก</a></p>', MIME['.html']);
  } catch (e) {
    console.error(e);
    send(res, 500, JSON.stringify({ error: 'ระบบขัดข้อง — ' + e.message }));
  }
});

server.requestTimeout = 30000; server.headersTimeout = 35000;
process.on('unhandledRejection', e => console.error('[freshour] unhandledRejection', e && e.stack || e));
process.on('uncaughtException', e => { console.error('[freshour] uncaughtException', e && e.stack || e); });
function shutdown(sig) { console.log('[freshour] ' + sig + ' — ปิดอย่างเรียบร้อย'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
if (require.main === module) {
  process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
  server.listen(PORT, () => console.log(`[freshour] เปิดที่ http://localhost:${server.address().port}  (เข้าระบบ → /login) · โหมดบัญชี: ${auth.mode}`));
}
module.exports = { server, store, auth };
