#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   Freshour pricing · prototype server (Node ≥ 18 · ไม่มี dependency)

   node server.js            → http://localhost:8787
   FH_PORT=3000              → เปลี่ยนพอร์ต
   FH_PINS=boss:1234,ops:2345,sale:3456,admin:0000  → เปิดโหมดใส่รหัส (ไม่ตั้ง = เลือกชื่อแล้วเข้าได้เลย)
   FH_JOURNAL=0              → ไม่จำสิ่งที่บันทึกข้ามการรีสตาร์ท (ปกติเขียนลง data/journal.jsonl)
   npm run reset             → ล้างข้อมูลที่ทดสอบไว้ กลับเป็นชุดตั้งต้น
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { createStore } = require('./src/store');
const QuotePage = require('./src/quote-page');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.FH_PORT || process.env.PORT || 8787);
const JOURNAL = process.env.FH_JOURNAL === '0' ? null : path.join(DATA, 'journal.jsonl');
const SECRET = process.env.FH_SECRET || 'freshour-prototype';
const PAGES = require('./data/pages.json').map(p => p.id);

/* ── ข้อมูลตั้งต้น ── */
function loadDocs() {
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'fixtures', 'index.json'), 'utf8'));
  const docs = {};
  for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'fixtures', idx[k]))).toString('utf8'));
  return docs;
}
function parsePins() {
  const s = process.env.FH_PINS; if (!s) return null;
  const pins = {}; s.split(',').forEach(kv => { const [r, p] = kv.split(':'); if (r && p) pins[r.trim()] = p.trim(); });
  return Object.keys(pins).length ? pins : null;
}

const t0 = Date.now();
const LINE_TOKEN = process.env.LINE_CHANNEL_TOKEN || '';
const LINE_ADMIN = process.env.LINE_ADMIN_USER_ID || '';
const MARKET_FEED_URL = process.env.MARKET_FEED_URL || '';
const store = createStore(loadDocs(), { pins: parsePins(), lineConfigured: !!LINE_TOKEN });
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
  return JSON.parse(fs.readFileSync(path.join(DATA, 'market-feed-sample.json'), 'utf8')).rows;
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
const INBOX = process.env.FH_INBOX_DIR || path.join(DATA, 'inbox');
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
    if (age > 24) await runMarketSync('ครบรอบ 24 ชม.');
    scanInbox();
    await notifyAlerts();
  } finally { draining = false; }
}
if (process.env.FH_JOBS !== '0') { setTimeout(tick, 800).unref(); setInterval(tick, 20000).unref(); }


/* ── session: cookie เซ็นด้วย HMAC (ไม่ต้องมีฐานข้อมูล session) ── */
function sign(role) { return role + '.' + crypto.createHmac('sha256', SECRET).update(role).digest('base64url').slice(0, 24); }
function roleOf(req) {
  const m = /(?:^|;\s*)fh_role=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const v = decodeURIComponent(m[1]), role = v.split('.')[0];
  return sign(role) === v ? role : null;
}
function setRole(res, role) {
  res.setHeader('Set-Cookie', role ? `fh_role=${encodeURIComponent(sign(role))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
                                   : 'fh_role=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

/* LINE webhook: ตรวจลายเซ็นเมื่อมี LINE_CHANNEL_SECRET · ไม่ตั้ง = โหมดทดสอบ (ยิงเองได้) */
function verifyLine(req, body) {
  const secret = process.env.LINE_CHANNEL_SECRET; if (!secret) return true;
  const sig = req.headers['x-line-signature'] || '';
  return sig === crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('base64');
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
function readBody(req) {
  return new Promise(resolve => {
    let s = ''; req.on('data', c => { s += c; if (s.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { resolve({ __bad: true }); } });
    req.on('error', () => resolve({}));
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
  const role = roleOf(req);
  try {
    if (p === '/api/connectors/test' && req.method === 'POST') { if (!role || store.LVL[role] < 2) return json(res, { status: 403, body: { error: 'ไม่มีสิทธิ์' } }); const b = await readBody(req); const r = await testConnector(b.competitor_id); return json(res, { status: 200, body: r }); }
    if (p === '/api/market-feed-sample') { if (!roleOf(req)) return json(res, { status: 401, body: { error: 'กรุณาเข้าระบบ' } }); return send(res, 200, fs.readFileSync(path.join(DATA, 'market-feed-sample.json'))); }
    if (p.startsWith('/api/')) {
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
      if (body.__bad) return json(res, { status: 400, body: { error: 'อ่าน JSON ไม่ได้' } });
      const entry = { method: req.method, url: u.pathname + u.search, body, role: role || 'anon', origin: `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}` };
      const r = store.handle(entry);
      if (p === '/api/health' && !r.body.ok) r.status = 503;
      if ('session' in r) setRole(res, r.session);
      if (p === '/api/line/webhook' && req.method === 'POST' && !verifyLine(req, body)) return json(res, { status: 401, body: { error: 'ลายเซ็น LINE ไม่ถูกต้อง' } });
      if (req.method !== 'GET' && r.status < 300 && !/\/api\/(login|logout|survey\/parse)$/.test(p)) journal({ method: entry.method, url: entry.url, body, role: entry.role, at: new Date().toISOString() });
      return json(res, r);
    }
    if (p === '/logout') { setRole(res, null); return redirect(res, '/login'); }
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

if (require.main === module) {
  server.listen(PORT, () => console.log(`[freshour] เปิดที่ http://localhost:${PORT}  (เข้าระบบ → /login)`));
}
module.exports = { server, store };
