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
const { createSettings } = require('./src/settings');
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
if (JOURNAL && !process.env.FH_VAR_DIR && !fs.existsSync(JOURNAL) && fs.existsSync(LEGACY_JOURNAL)) {   /* ย้าย journal เก่าเฉพาะโฟลเดอร์เริ่มต้น — โฟลเดอร์ที่ตั้งเองเริ่มสะอาด */ try { fs.copyFileSync(LEGACY_JOURNAL, JOURNAL); } catch (e) { /* ใช้ของเก่าต่อ */ } }
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
/* การเชื่อมต่อ (LINE · feed ตลาด): ค่าจากหน้าตั้งค่าระบบ (settings.json) ก่อน แล้วค่อย env — แก้แล้วมีผลทันที ไม่ต้องรีสตาร์ท */
const SET = createSettings(VAR);
let LINE_TOKEN = SET.get('line_token'), LINE_ADMIN = SET.get('line_admin'), MARKET_FEED_URL = SET.get('market_feed_url');
const SAMPLE_MARKET = process.env.FH_SAMPLE_MARKET === '1';   /* ราคาตลาดตัวอย่าง (ไม่ใช่ของจริง) — เปิดเฉพาะตอนทดสอบ UI */
const DATA_NOTE = 'สินค้า/ทุน/ราคาจากใบราคาขาย+ทุน AL 01-07/10/69 · ลูกค้า/สัญญา/ยอดขายจากระบบเดิม (ก.ย. 69) · ราคาตลาด: ' + (MARKET_FEED_URL ? 'connector ' + MARKET_FEED_URL : SAMPLE_MARKET ? 'ตัวอย่างสมมติ (ไม่ใช่ของจริง)' : 'ยังไม่ต่อ connector — ใช้สำรวจหน้าร้าน');
let LINE_SECRET = SET.get('line_secret');
const LINE_STAFF = SET.staff();   /* แก้ในที่ (ไม่สร้างอาร์เรย์ใหม่) เพราะ store ถือ reference เดียวกันนี้ */
function applySettings() {
  LINE_TOKEN = SET.get('line_token'); LINE_ADMIN = SET.get('line_admin'); MARKET_FEED_URL = SET.get('market_feed_url'); LINE_SECRET = SET.get('line_secret');
  LINE_STAFF.length = 0; SET.staff().forEach(x => LINE_STAFF.push(x)); storeOpts.lineConfigured = !!LINE_TOKEN;
  const mj = store.docs.jobs['market-sync']; if (mj && MARKET_FEED_URL && mj.status === 'off') { mj.status = 'never'; mj.detail = ''; }
}
const auth = createAuth({ varDir: VAR, usersJson: process.env.FH_USERS_JSON, devOpen: DEV_OPEN, log: m => console.error('[freshour] auth:', m) });
if (auth.mode === 'locked') console.error('[freshour] ยังไม่มีบัญชีผู้ใช้ — ประตูปิดอยู่ · สร้างด้วย: node tools/users.js add <id> --role admin --name "ชื่อ"  (หรือ FH_DEV_OPEN=1 เฉพาะเครื่องพัฒนา)');
if (auth.mode === 'open') console.error('[freshour] FH_DEV_OPEN=1 — ไม่ต้องใส่รหัส ใช้เฉพาะเครื่องพัฒนาเท่านั้น');
/* ── ข้อมูลคงทน: snapshot (ภาพรวมทั้งก้อน) + journal (รายการหลัง snapshot) · เล่นซ้ำด้วยเวลาของรายการนั้นจริง ── */
const SNAPSHOT = path.join(VAR, 'snapshot.json.gz');
let snapMeta = null;
function loadSnapshot() {
  if (!JOURNAL || !fs.existsSync(SNAPSHOT)) return null;
  try { const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(SNAPSHOT)).toString('utf8')); if (j && j.v === 1 && j.docs) return j; } catch (e) { console.error('[freshour] snapshot อ่านไม่ได้ — ใช้ fixtures + journal แทน:', e.message); }
  return null;
}
const snap = loadSnapshot();
if (snap) snapMeta = { at: snap.at, upto: snap.upto || 0 };
const storeOpts = { devOpen: auth.mode === 'open', lineConfigured: !!LINE_TOKEN, lineStaff: LINE_STAFF, dataNote: DATA_NOTE, sampleMarket: SAMPLE_MARKET };
const store = createStore(snap ? snap.docs : loadDocs(), storeOpts);
if (!MARKET_FEED_URL && !SAMPLE_MARKET) { const mj = store.docs.jobs['market-sync']; if (mj && mj.status === 'never') { mj.status = 'off'; mj.detail = 'ยังไม่ต่อแหล่งราคาตลาดออนไลน์ — ใช้สำรวจหน้าร้าน/ใบราคา B2B แทน (ผู้ดูแลตั้งค่าได้)'; } }   /* ไม่มี connector = ปิด ไม่ใช่ล้ม — แถบแดง "ขาดรอบ" ทุกวันคือเสียงรบกวน */
let replayed = 0, skipped = 0, journalN = snapMeta ? snapMeta.upto : 0, journalSince = 0;   /* journalN = เลขรายการล่าสุด · journalSince = จำนวนรายการหลัง snapshot */
if (JOURNAL && fs.existsSync(JOURNAL)) {
  for (const line of fs.readFileSync(JOURNAL, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch (x) { continue; }   /* บรรทัดเสีย — ข้าม */
    if (snapMeta && (e.n == null || e.n <= snapMeta.upto)) { skipped++; continue; }   /* อยู่ใน snapshot แล้ว — ไม่ทำซ้ำ */
    if (e.n != null && e.n > journalN) journalN = e.n;
    journalSince++;
    try {
      store.setClock(e.at ? Date.parse(e.at) : null);   /* เวลาของรายการนั้น ไม่ใช่เวลารีสตาร์ท */
      if (e.url === '/api/_drain') { store.docs.outbox.forEach(o => { if (o.status === 'queued') { o.status = 'simulated'; o.sent_at = o.at; } }); } else store.handle(e);
      replayed++;
    } catch (x) { console.error('[freshour] เล่นซ้ำไม่ได้:', e.url, x.message); } finally { store.setClock(null); }
  }
}
console.log(`[freshour] โหลดข้อมูล ${Object.keys(store.docs).length} ก้อน${snapMeta ? ' จาก snapshot ' + snapMeta.at : ''} · เล่นซ้ำ ${replayed} รายการ${skipped ? ' (ข้าม ' + skipped + ' ที่อยู่ใน snapshot แล้ว)' : ''} · ${Date.now() - t0} ms`);
let lastBackupAt = null;
let lastSnapAt = snapMeta ? Date.parse(snapMeta.at) : Date.now();
/* เขียน snapshot แบบ atomic แล้วค่อยตัด journal — ถ้าล้มระหว่างทาง รายการใน journal มีเลข n กำกับ จึงไม่ถูกเล่นซ้ำสองรอบ */
function writeSnapshot(reason) {
  if (!JOURNAL) return false;
  const t = Date.now();
  try {
    const payload = zlib.gzipSync(Buffer.from(JSON.stringify({ v: 1, at: new Date().toISOString(), upto: journalN, reason, docs: store.docs }), 'utf8'));
    fs.writeFileSync(SNAPSHOT + '.tmp', payload); fs.renameSync(SNAPSHOT + '.tmp', SNAPSHOT);
    fs.writeFileSync(JOURNAL, '');
    snapMeta = { at: new Date().toISOString(), upto: journalN }; journalSince = 0; lastSnapAt = Date.now();
    copyBackup(payload);
    console.log(`[freshour] snapshot (${reason}) ${(payload.length / 1024).toFixed(0)} KB · ${Date.now() - t} ms`);
    return true;
  } catch (e) { console.error('[freshour] เขียน snapshot ไม่ได้:', e.message); return false; }
}
/* สำเนา snapshot ไปโฟลเดอร์สำรอง (FH_BACKUP_DIR — mount เป็น volume/ดิสก์คนละก้อน หรือโฟลเดอร์ที่ sync ขึ้นคลาวด์) · วันละไฟล์ เก็บ 14 วัน */
function copyBackup(payload) {
  const dir = process.env.FH_BACKUP_DIR; if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const name = 'snapshot-' + new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10) + '.json.gz';
    fs.writeFileSync(path.join(dir, name + '.tmp'), payload); fs.renameSync(path.join(dir, name + '.tmp'), path.join(dir, name));
    for (const f of ['users.json', 'settings.json']) { try { fs.copyFileSync(path.join(VAR, f), path.join(dir, f)); } catch (e) { /* ยังไม่มี */ } }
    const old = fs.readdirSync(dir).filter(f => /^snapshot-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort().slice(0, -14); old.forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ข้าม */ } });
    lastBackupAt = new Date().toISOString();
  } catch (e) { console.error('[freshour] สำรองข้อมูลไม่ได้:', e.message); store.ext.alert('bad', 'สำรองข้อมูลไม่สำเร็จ', e.message, 'backup'); }
}
function maybeSnapshot() {
  if (!JOURNAL || !journalSince) return;
  let bytes = 0; try { bytes = fs.statSync(JOURNAL).size; } catch (e) { /* ไม่มีไฟล์ */ }
  if (journalSince >= 300 || bytes >= 2e6 || (Date.now() - lastSnapAt > 6 * 36e5)) writeSnapshot(journalSince >= 300 ? 'ครบ 300 รายการ' : bytes >= 2e6 ? 'journal ใหญ่' : 'ครบ 6 ชม.');
}

/* ── งานที่ระบบทำเอง (ไม่ใช่คนกด) — ทุกงานลง log กลาง · ล้มแล้วขึ้น alert + แจ้ง LINE admin ── */
function withTimeout(ms) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); t.unref(); return { signal: ac.signal, done: () => clearTimeout(t) }; }
async function lineTransport(to, text) {
  if (!LINE_TOKEN) return { simulated: true };
  const w = withTimeout(15000);
  const r = await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', signal: w.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + LINE_TOKEN }, body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }) }).finally(w.done);
  if (!r.ok) throw new Error('LINE ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return { sent: true };
}
async function loadMarketFeed() {
  if (MARKET_FEED_URL) { const w = withTimeout(30000); const r = await fetch(MARKET_FEED_URL, { signal: w.signal }).finally(w.done); if (!r.ok) throw new Error('feed ' + r.status); const j = await r.json(); return j.rows || j; }
  if (SAMPLE_MARKET) return JSON.parse(fs.readFileSync(path.join(DATA, 'market-feed-sample.json'), 'utf8')).rows;
  return null;
}
async function runMarketSync(reason) {
  try {
    const rows = await loadMarketFeed();
    /* จับคู่ชื่อสินค้าล่วงหน้าทีละก้อน (ปล่อย event loop ระหว่างก้อน) — ตอน sync จริงจะโดน cache หมด ไม่ค้างหน้าเว็บหลายวินาที */
    const names = [...new Set((rows || []).map(o => o.sku || o.name).filter(Boolean))];
    for (let i = 0; i < names.length; i += 150) { names.slice(i, i + 150).forEach(n => { try { store.ext.matchProduct(n); } catch (e) { /* ข้าม */ } }); await new Promise(r => setImmediate(r)); }
    const r = store.handle({ method: 'POST', url: '/api/market-sync/run', body: { observations: rows }, role: 'system' });
    if (r.status !== 200) throw new Error(r.body.error);
    /* ไม่เขียน feed ทั้งก้อนลง journal (เคยโต 900 KB ต่อครั้งและเล่นซ้ำทุกบูต) — เก็บเป็น snapshot แทน */
    if (!writeSnapshot('market-sync')) journal({ method: 'POST', url: '/api/market-sync/run', body: { observations: rows }, role: 'system', at: new Date().toISOString(), system: true });
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
    if (age > 24) { if (MARKET_FEED_URL || SAMPLE_MARKET) await runMarketSync('ครบรอบ 24 ชม.'); else { j.status = 'off'; j.detail = 'ยังไม่ต่อแหล่งราคาตลาดออนไลน์ — ใช้สำรวจหน้าร้าน/ใบราคา B2B แทน (ผู้ดูแลตั้งค่าได้)'; } }
    scanInbox();
    const fj = store.docs.jobs['followup-check'], fage = fj.last_run ? (Date.now() - Date.parse(fj.last_run + '+07:00')) / 36e5 : 99;
    if (fage > 24) { const fr = store.ext.followupTick(); journal({ method: 'POST', url: '/api/followups/tick', body: {}, role: 'system', at: new Date().toISOString(), system: true }); console.log('[freshour] followup-check:', JSON.stringify(fr).slice(0, 160)); }
    await notifyAlerts();
    maybeSnapshot();
  } catch (e) { console.error('[freshour] tick ล้ม:', e && e.stack || e); } finally { draining = false; }
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
  entry.n = ++journalN; journalSince++;
  try { fs.appendFileSync(JOURNAL, JSON.stringify(entry) + '\n'); } catch (e) { console.error('[freshour] เขียน journal ไม่ได้', e.message); }
}
/* access log บรรทัดละคำขอ (JSON) — อ่านด้วย grep/jq ได้ · ไม่มี body */
function accessLog(req, status, t, role) { if (process.env.FH_ACCESS_LOG === '0') return; console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: (req.url || '').split('?')[0], s: status, ms: Date.now() - t, role: role || 'anon', ip: ipOf(req) })); }
const HOME = { boss: '/exec', admin: '/exec', ops: '/pricing', sale: '/sales' };
const MOVED = { '/price': '/pricing', '/market': '/costs', '/trend': '/costs?tab=trend', '/index': '/', '/wiring': '/settings' };

const server = http.createServer(async (req, res) => {
  const tReq = Date.now();
  const u = new URL(req.url, 'http://x');
  let p = u.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  const sid = sidOf(req), sess = auth.get(sid); let role = sess ? sess.role : null, rep = sess ? sess.rep : null;
  /* เซลล์ต้องระบุคน — บัญชีเซลล์ที่ยังไม่ผูกชื่อในทีมขาย ให้เข้าระบบใหม่ (จะได้เห็นเฉพาะลูกค้าของตัวเอง) */
  if (role === 'sale' && !rep && (store.docs.state.sales_reps || []).length) { role = null; rep = null; }
  try {
    if (p === '/healthz') return json(res, { status: 200, body: { ok: true, up_s: Math.round((Date.now() - t0) / 1000), auth: auth.mode, journal: { since_snapshot: journalSince, last: journalN }, snapshot_at: snapMeta ? snapMeta.at : null } });   /* liveness ของแพลตฟอร์ม — ไม่ปนกับเรื่องธุรกิจ */
    if (p === '/api/login' && req.method === 'POST') {
      const rb = await readBody(req); if (rb.__bad || rb.__big) return json(res, { status: 400, body: { error: 'อ่าน JSON ไม่ได้' } });
      const r = auth.login(rb.body, ipOf(req));
      /* ใครเข้าระบบเมื่อไร = หลักฐาน ต้องอยู่ข้ามรีสตาร์ท → ลง journal ด้วย */
      if (r.session) { setSid(res, req, r.session.id); const le = { method: 'POST', url: '/api/log', role: r.session.role, rep: r.session.rep, body: { action: 'login', detail: (r.session.name || r.session.uid) + ' เข้าระบบ' }, at: new Date().toISOString() }; store.handle(le); journal(le); }
      else if (r.status === 401 || r.status === 429) { const fe = { method: 'POST', url: '/api/log', role: 'system', body: { action: 'login-fail', detail: 'เข้าระบบไม่สำเร็จ: ' + String(rb.body && (rb.body.user || rb.body.role) || '?').slice(0, 40) + ' จาก ' + ipOf(req), status: 'warn' }, at: new Date().toISOString() }; store.handle(fe); journal(fe); }
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
      if (!LINE_TOKEN) return json(res, { status: 503, body: { error: 'ยังไม่ได้ต่อ LINE OA — ให้ผู้ดูแลตั้งค่าก่อน' } });
      const mid = String(u.searchParams.get('id') || '').replace(/[^0-9A-Za-z_-]/g, ''); if (!mid) return json(res, { status: 400, body: { error: 'ไม่มี id' } });
      const lr = await fetch('https://api-data.line.me/v2/bot/message/' + mid + '/content', { headers: { authorization: 'Bearer ' + LINE_TOKEN } });
      if (!lr.ok) return json(res, { status: 502, body: { error: 'LINE ' + lr.status } });
      const buf = Buffer.from(await lr.arrayBuffer()); res.writeHead(200, { 'content-type': lr.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=300' }); return res.end(buf);
    }
    if (p.startsWith('/api/admin/') && p !== '/api/admin/snapshot') {
      /* หน้าตั้งค่าระบบ: ดูได้ boss/admin · แก้ได้เฉพาะ admin · ไม่คืนความลับกลับไปหน้าเว็บเลย */
      if (!role) return json(res, { status: 401, body: { error: 'กรุณาเข้าระบบ' } });
      if (store.LVL[role] < 3) return json(res, { status: 403, body: { error: 'ไม่มีสิทธิ์' } });
      const write = req.method !== 'GET';
      if (write && role !== 'admin') return json(res, { status: 403, body: { error: 'เฉพาะผู้ดูแลระบบแก้ได้' } });
      const rb = write ? await readBody(req) : { body: {} };
      if (rb.__bad || rb.__big) return json(res, { status: 400, body: { error: 'อ่าน JSON ไม่ได้' } });
      const b = rb.body || {}, rec = (action, detail) => { const e = { method: 'POST', url: '/api/log', role, rep: null, body: { action, detail }, at: new Date().toISOString() }; store.handle(e); journal(e); };
      const bad = (m, s2) => json(res, { status: s2 || 400, body: { error: m } });
      const randPw = () => { const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.randomBytes(12)).map(x => A[x % A.length]).join(''); };
      const activeAdmins = () => auth.list().filter(u => u.active && (u.role === 'admin'));
      if (p === '/api/admin/system' && req.method === 'GET') {
        let sz = {}; for (const f of ['journal.jsonl', 'snapshot.json.gz', 'users.json', 'settings.json']) { try { sz[f] = fs.statSync(path.join(VAR, f)).size; } catch (e) { sz[f] = null; } }
        const hh = store.handle({ method: 'GET', url: '/api/health', role, rep: null, body: {} }).body || {};
        return json(res, { status: 200, body: { auth: { mode: auth.mode, users: auth.list().length }, uptime_s: Math.round(process.uptime()), node: process.version, snapshot_at: snapMeta ? snapMeta.at : null, journal: { since_snapshot: journalSince, last: journalN }, storage: sz,
          backup: { configured: !!process.env.FH_BACKUP_DIR, dir: process.env.FH_BACKUP_DIR ? 'ตั้งแล้ว' : '', last: lastBackupAt }, line: { webhook_path: '/api/line/webhook', token: !!LINE_TOKEN, secret: !!LINE_SECRET, admin: !!LINE_ADMIN, staff: LINE_STAFF.length },
          feed: { configured: !!MARKET_FEED_URL || SAMPLE_MARKET }, settings: SET.view(), health: { ok: hh.ok, jobs: (hh.jobs || []).map(j => ({ key: j.key, label: j.label, status: j.status, stale: j.stale, last_run: j.last_run, detail: j.detail })), outbox: hh.outbox, alerts: (hh.alerts || []).slice(0, 8).map(a => ({ level: a.level, title: a.title, at: a.at })) } } });
      }
      if (p === '/api/admin/users' && req.method === 'GET') return json(res, { status: 200, body: { mode: auth.mode, users: auth.list(), reps: (store.docs.state.sales_reps || []).map(r => ({ id: r.id, name: r.name })) } });
      if (auth.mode !== 'users' && p.startsWith('/api/admin/users')) return bad('โหมดเครื่องพัฒนาไม่มีบัญชีผู้ใช้ — สร้างบัญชีแรกด้วย node tools/users.js แล้วเริ่มระบบใหม่', 409);
      if (p === '/api/admin/users' && req.method === 'POST') {
        try {
          const id = String(b.id || '').trim().toLowerCase(); if (!/^[a-z0-9._-]{2,24}$/.test(id)) return bad('ชื่อผู้ใช้ใช้ตัวอังกฤษ/ตัวเลข 2–24 ตัว ไม่มีช่องว่าง');
          if (!auth.ROLES[b.role]) return bad('เลือกบทบาท');
          if (b.role === 'sale' && !String(b.rep || '').trim()) return bad('บัญชีเซลล์ต้องระบุรหัสเซลล์ (เช่น s1)');
          const cur = auth.userById(id), pw = b.password ? String(b.password) : (cur ? '' : randPw());
          if (pw && pw.length < 8) return bad('รหัสผ่านอย่างน้อย 8 ตัว');
          if (cur && cur.role === 'admin' && b.role !== 'admin' && activeAdmins().length <= 1) return bad('ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน', 409);
          const u = auth.upsert({ id, role: b.role, name: String(b.name || id).trim(), rep: b.role === 'sale' ? String(b.rep).trim() : null, active: cur ? cur.active : true }, pw || null);
          rec(cur ? 'user-edit' : 'user-add', (u.name || u.id) + ' (' + u.role + ')');
          return json(res, { status: 200, body: { ok: true, user: { id: u.id, name: u.name, role: u.role, rep: u.rep }, password: cur ? undefined : pw } });
        } catch (e) { return bad(e.message); }
      }
      if (p === '/api/admin/users/passwd' && req.method === 'POST') {
        const u = auth.userById(b.id); if (!u) return bad('ไม่พบบัญชี', 404);
        const pw = b.password ? String(b.password) : randPw(); if (pw.length < 8) return bad('รหัสผ่านอย่างน้อย 8 ตัว');
        try { auth.upsert(u, pw); } catch (e) { return bad(e.message); }
        rec('user-passwd', 'ตั้งรหัสใหม่ให้ ' + u.name); return json(res, { status: 200, body: { ok: true, password: b.password ? undefined : pw } });
      }
      if (p === '/api/admin/users/active' && req.method === 'POST') {
        const u = auth.userById(b.id); if (!u) return bad('ไม่พบบัญชี', 404);
        const on = !!b.active; if (!on && u.role === 'admin' && activeAdmins().length <= 1) return bad('ปิดไม่ได้ — ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน', 409);
        if (!on && sess && u.id === sess.uid) return bad('ปิดบัญชีที่กำลังใช้อยู่ไม่ได้', 409);
        try { auth.upsert(Object.assign({}, u, { active: on })); } catch (e) { return bad(e.message); }
        rec('user-active', (on ? 'เปิด' : 'ปิด') + 'บัญชี ' + u.name); return json(res, { status: 200, body: { ok: true } });
      }
      if (p === '/api/admin/settings' && req.method === 'POST') {
        try {
          const changed = SET.update(b); applySettings();
          if (changed.length) rec('settings', 'แก้การเชื่อมต่อ: ' + changed.map(k => ({ line_token: 'LINE token', line_secret: 'LINE secret', line_admin: 'ผู้ดูแลรับแจ้งเตือน', line_staff: 'ทีมงาน LINE', market_feed_url: 'feed ราคาตลาด' }[k] || k)).join(', '));
          return json(res, { status: 200, body: { ok: true, changed, settings: SET.view() } });
        } catch (e) { return bad(e.message); }
      }
      if (p === '/api/admin/test-line' && req.method === 'POST') {
        if (!LINE_TOKEN) return bad('ยังไม่ได้ใส่ Channel access token'); if (!LINE_ADMIN) return bad('ยังไม่ได้ใส่ LINE userId ของผู้ดูแลที่จะรับข้อความทดสอบ');
        try { await lineTransport(LINE_ADMIN, '✅ ทดสอบจาก Freshour — ถ้าเห็นข้อความนี้ แปลว่า LINE ต่อติดแล้ว'); rec('line-test', 'ส่งข้อความทดสอบถึงผู้ดูแล สำเร็จ'); return json(res, { status: 200, body: { ok: true } }); }
        catch (e) { rec('line-test', 'ส่งข้อความทดสอบไม่สำเร็จ: ' + String(e.message).slice(0, 100)); return bad('ส่งไม่สำเร็จ — ' + String(e.message).slice(0, 160), 502); }
      }
      return bad('ไม่มีเส้นทางนี้', 404);
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
      if (p === '/api/admin/snapshot' && req.method === 'POST') { if (!role || store.LVL[role] < 3) return json(res, { status: 403, body: { error: 'ไม่มีสิทธิ์' } }); const okS = writeSnapshot('สั่งเอง'); return json(res, { status: okS ? 200 : 500, body: { ok: okS, at: snapMeta && snapMeta.at } }); }
      const entry = { method: req.method, url: u.pathname + u.search, body, role: role || 'anon', rep: rep || null, user: sess ? sess.uid : null, origin: `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}` };
      const r = store.handle(entry);
      if (req.method !== 'GET' && r.status < 300 && !/\/api\/(login|logout|survey\/parse)$/.test(p)) journal({ method: entry.method, url: entry.url, body: r.journal ? Object.assign({}, body, r.journal) : body, role: entry.role, rep: entry.rep, at: new Date().toISOString() });
      if (r.journal) delete r.journal;
      accessLog(req, r.status, tReq, role);
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
    console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', m: req.method, p: p, msg: e && e.message, stack: e && e.stack }));
    accessLog(req, 500, tReq, role);
    send(res, 500, JSON.stringify({ error: 'ระบบขัดข้อง — ลองใหม่อีกครั้ง หรือแจ้งผู้ดูแล' }));
  }
});

server.requestTimeout = 30000; server.headersTimeout = 35000;
process.on('unhandledRejection', e => console.error('[freshour] unhandledRejection', e && e.stack || e));
process.on('uncaughtException', e => { console.error('[freshour] uncaughtException', e && e.stack || e); });
function shutdown(sig) { console.log('[freshour] ' + sig + ' — ปิดอย่างเรียบร้อย'); if (journalSince) writeSnapshot(sig); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
if (require.main === module) {
  process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
  server.listen(PORT, () => console.log(`[freshour] เปิดที่ http://localhost:${server.address().port}  (เข้าระบบ → /login) · โหมดบัญชี: ${auth.mode}`));
}
module.exports = { server, store, auth };
