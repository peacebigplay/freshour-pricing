/* ความปลอดภัยก่อนขึ้น production:
   1) เซลล์ไม่ได้รับทุน/margin/floor/นโยบาย/ราคาคู่แข่งจาก API ใดเลย (ตรวจ payload ไม่ใช่แค่หน้าจอ)
   2) เซลล์ข้ามเจ้ากันไม่ได้แม้จะส่งมาแค่ id ของรายการ
   3) server จริง: บัญชีรายคน · session สุ่ม · logout หลุดจริง · ล็อกเมื่อเดารหัส · webhook ต้องมีลายเซ็น · ไม่มีบัญชี = ประตูปิด
   node --test test/security.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createStore } = require('../src/store');
const { createAuth, hashPassword, verifyPassword } = require('../src/auth');

function loadDocs() {
  const dir = path.join(__dirname, '..', 'data', 'fixtures');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const docs = {};
  for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8'));
  return docs;
}
const docs = loadDocs(), store = createStore(docs, { devOpen: true, lineStaff: ['Ustaff1'] });
const call = (role, method, url, body, rep) => store.handle({ role, rep, method, url, body, origin: 'http://t' });
const okj = (r, m) => { assert.equal(r.status, 200, (m || '') + ' → ' + JSON.stringify(r.body).slice(0, 200)); return r.body; };
const SENSITIVE = /"(cost|margin|floor|floorPrice|marks|gap|pos|rec|recState|policy|marginState|centralState|cost_avg|margin_avg|profit_week|gp|costSrc|guard)":/;
const leak = (body) => { const m = JSON.stringify(body).match(SENSITIVE); return m ? m[0] : null; };

test('เซลล์: ทุก endpoint ที่เปิดให้ ไม่มีคีย์ที่บอกทุน/margin/floor/คู่แข่ง', () => {
  const reps = okj(call('anon', 'GET', '/api/reps')).reps; const s1 = reps[0].id;
  const sends = okj(call('sale', 'GET', '/api/sends', null, s1));
  const mine = sends.customers.find(c => c.lines > 0) || sends.customers[0];
  const urls = ['/api/pricelist', '/api/guard', '/api/sends', '/api/history', '/api/preflight', '/api/deliveries', '/api/prospects', '/api/ui-state', '/api/negotiations',
    '/api/dashboard', '/api/sales-queue', '/api/deals', '/api/followups', '/api/doc-requests', '/api/events', '/api/outbox', '/api/sources', '/api/survey', '/api/sales-board',
    '/api/sheet?customer=' + mine.id, '/api/quote-review?customer=' + mine.id, '/api/service-logs?customer=' + mine.id, '/api/events?customer=' + mine.id];
  for (const u of urls) {
    const r = call('sale', 'GET', u, null, s1);
    assert.ok(r.status === 200, u + ' → ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 100));
    assert.equal(leak(r.body), null, u + ' รั่ว: ' + leak(r.body));
  }
  const pl = okj(call('sale', 'GET', '/api/pricelist', null, s1));
  assert.deepEqual(pl.comps, []); assert.ok(pl.rows.length > 100 && pl.rows[0].w2 > 0 && pl.rows[0].retail > 0, 'ยังเห็นราคาขายครบ');
  const sh = okj(call('sale', 'GET', '/api/sheet?customer=' + mine.id, null, s1));
  sh.rows.forEach(r => { assert.equal(r.floor, undefined); assert.notEqual(r.status, 'floored'); });
  const shOps = okj(call('ops', 'GET', '/api/sheet?customer=' + mine.id));
  if (shOps.rows.length) assert.ok(shOps.rows[0].floor >= 0, 'Pricing ยังเห็น floor ตามเดิม');
  assert.ok(okj(call('ops', 'GET', '/api/history'))[0].cost_avg >= 0, 'Pricing ยังเห็นทุนเฉลี่ยในประวัติ');
  /* สิทธิ์ที่เคยเปิดเกิน */
  assert.equal(call('anon', 'GET', '/api/health').status, 401);
  assert.equal(call('sale', 'POST', '/api/alerts/ack', { id: 1 }, s1).status, 403);
});

test('เซลล์ข้ามเจ้า: คำขอต่อรอง/รอบส่งของลูกค้าคนอื่น แตะด้วย id เฉย ๆ ไม่ได้', () => {
  const reps = okj(call('anon', 'GET', '/api/reps')).reps; const s1 = reps[0].id, s2 = reps[1].id;
  const other = okj(call('sale', 'GET', '/api/sends', null, s2)).customers.find(c => c.lines > 0) || okj(call('sale', 'GET', '/api/sends', null, s2)).customers[0];
  /* สร้างคำขอต่อรองของลูกค้า s2 ด้วยมือ (ทางลัดใน store) */
  const pid = docs.pricelist.rows[0].id;
  docs['price-requests'].rows.unshift({ id: 99001, customer_id: other.id, product_id: pid, label: docs.sends.label, want: 1, status: 'open', at: '2026-10-20 09:00', rev: 1 });
  assert.equal(call('sale', 'POST', '/api/price-requests/status', { id: 99001, status: 'cancelled' }, s1).status, 403, 's1 ปิดคำขอของลูกค้า s2 ไม่ได้');
  assert.notEqual(call('sale', 'POST', '/api/price-requests/status', { id: 99001, status: 'cancelled' }, s2).status, 403, 'เจ้าของเองทำได้');
  docs.deliveries.rows.unshift({ id: 99002, customer_id: other.id, date: '2026-10-20', status: 'planned' });
  assert.equal(call('sale', 'POST', '/api/deliveries/update', { id: 99002, note: 'x' }, s1).status, 403);
  assert.equal(call('sale', 'POST', '/api/price-requests/status', { id: 424242, status: 'cancelled' }, s1).status, 404, 'id ที่ไม่มี = 404 ตามเดิม');
});

test('LINE: คำสั่งทุน/ตลาดรับเฉพาะทีมงานที่ลงทะเบียน · ลูกค้าส่งราคาตลาดมาไม่รับ', () => {
  const pid = docs.pricelist.rows.find(r => r.cost > 0);
  const before = pid.cost;
  const wh = okj(call('anon', 'POST', '/api/line/webhook', { events: [{ source: { userId: 'Ustranger' }, message: { type: 'text', text: 'ทุน ' + pid.name + ' 9' } }] }));
  assert.equal(wh.handled[0].result, 'rejected'); assert.equal(pid.cost, before, 'ทุนต้องไม่เปลี่ยน');
  const ok1 = okj(call('anon', 'POST', '/api/line/webhook', { events: [{ source: { userId: 'Ustaff1' }, message: { type: 'text', text: 'ทุน ' + pid.name + ' ' + (before + 1) } }] }));
  assert.ok(/cost 1/.test(ok1.handled[0].result));
});

test('auth: scrypt · session สุ่ม/หมดอายุ · ล็อก 5 ครั้ง · โหมด locked/open/users', () => {
  const h = hashPassword('secret-123'); assert.ok(h.startsWith('scrypt$')); assert.ok(verifyPassword('secret-123', h)); assert.ok(!verifyPassword('secret-124', h));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-auth-'));
  const locked = createAuth({ varDir: dir }); assert.equal(locked.mode, 'locked'); assert.equal(locked.login({ role: 'boss' }).status, 503);
  const open = createAuth({ varDir: dir, devOpen: true }); assert.equal(open.mode, 'open'); assert.equal(open.login({ role: 'boss' }).status, 200);
  const a = createAuth({ varDir: dir, usersJson: JSON.stringify([{ id: 'jum', role: 'ops', name: 'พี่จุ๋ม', hash: h }, { id: 's1u', role: 'sale', rep: 's1', hash: h }, { id: 'norep', role: 'sale', hash: h }]) });
  assert.equal(a.mode, 'users');
  assert.equal(a.login({ role: 'ops' }).status, 400, 'เลือกบทบาทเองไม่ได้แล้ว');
  assert.equal(a.login({ user: 'jum', password: 'wrong' }, '1.1.1.1').status, 401);
  const ok = a.login({ user: 'JUM', password: 'secret-123' }, '1.1.1.1'); assert.equal(ok.status, 200); assert.equal(ok.body.role, 'ops'); assert.ok(ok.session.id.length >= 40);
  const ok2 = a.login({ user: 'jum', password: 'secret-123' }, '1.1.1.1'); assert.notEqual(ok.session.id, ok2.session.id, 'session ต้องสุ่มใหม่ทุกครั้ง');
  assert.equal(a.get(ok.session.id).role, 'ops'); a.drop(ok.session.id); assert.equal(a.get(ok.session.id), null, 'logout แล้วใช้ต่อไม่ได้');
  assert.equal(a.login({ user: 's1u', password: 'secret-123' }).body.rep.id, 's1'); assert.equal(a.login({ user: 'norep', password: 'secret-123' }).status, 403);
  for (let i = 0; i < 5; i++) a.login({ user: 'jum', password: 'bad' }, '9.9.9.9');
  assert.equal(a.login({ user: 'jum', password: 'secret-123' }, '9.9.9.9').status, 429, 'เดารหัส 5 ครั้ง → ล็อก');
  assert.equal(a.login({ user: 'jum', password: 'secret-123' }, '1.1.1.1').status, 200, 'IP อื่นไม่โดนหางเลข');
  const s = a.get(ok2.session.id); s.at -= 31 * 864e5; assert.equal(a.get(ok2.session.id), null, 'เกิน 30 วัน หมดอายุ');
  /* CLI: upsert เขียน users.json · เปลี่ยนรหัสแล้ว session เดิมหลุด */
  const u = a.upsert({ id: 'boss1', role: 'boss', name: 'MD' }, 'topsecret-1'); assert.ok(fs.existsSync(path.join(dir, 'users.json')));
  const b1 = a.login({ user: 'boss1', password: 'topsecret-1' }); assert.equal(b1.status, 200);
  a.upsert(u, 'newsecret-1'); assert.equal(a.get(b1.session.id), null);
});

/* server จริงในโหมดบัญชี — รันเป็นโปรเซสแยก เพราะ server.js อ่าน env ตอนโหลด */
function startServer(env) {
  return new Promise((resolve, reject) => {
    const varDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-srv-'));
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { FH_PORT: '0', FH_JOBS: '0', FH_JOURNAL: '0', FH_VAR_DIR: varDir, FH_DEV_OPEN: '' }, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = d => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: 'http://127.0.0.1:' + m[1], varDir }); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('exit', c => reject(new Error('server ออกก่อนเปิด (' + c + '): ' + out.slice(-400))));
    setTimeout(() => reject(new Error('server ไม่เปิดใน 20 วิ: ' + out.slice(-400))), 20000).unref();
  });
}
function req(base, method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const r = http.request(base + p, { method, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: s, json: () => { try { return JSON.parse(s); } catch (e) { return {}; } } })); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

test('server โหมดบัญชี: login ด้วยชื่อ+รหัส · cookie Secure หลัง proxy https · ไม่มี auto-login · logout หลุดจริง · webhook ต้องมีลายเซ็น', async () => {
  const H = hashPassword('pw-jum-12345');
  const users = JSON.stringify([{ id: 'jum', role: 'ops', name: 'พี่จุ๋ม', hash: H }, { id: 'sale1', role: 'sale', rep: 's1', name: 'เซลล์ 1', hash: H }]);
  const { child, base } = await startServer({ FH_USERS_JSON: users, LINE_CHANNEL_SECRET: 'linesecret' });
  try {
    let r = await req(base, 'GET', '/api/me'); assert.equal(r.json().role, null); assert.equal(r.json().mode, 'users'); assert.equal(r.json().needPin, true);
    r = await req(base, 'POST', '/api/login', { role: 'ops' }); assert.equal(r.status, 400, 'เลือกบทบาทเองไม่ได้');
    r = await req(base, 'GET', '/api/pricelist'); assert.equal(r.status, 401, 'ไม่ล็อกอิน = 401 (ไม่ล็อกอินให้เองเป็น ops อีกแล้ว)');
    r = await req(base, 'GET', '/api/reps'); assert.equal(r.status, 401);
    r = await req(base, 'POST', '/api/login', { user: 'jum', password: 'nope' }); assert.equal(r.status, 401);
    r = await req(base, 'POST', '/api/login', { user: 'jum', password: 'pw-jum-12345' }, { 'x-forwarded-proto': 'https' }); assert.equal(r.status, 200);
    const sc = r.headers['set-cookie'][0]; assert.ok(/^fh_sid=/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc), sc);
    const ck = sc.split(';')[0];
    r = await req(base, 'GET', '/api/me', null, { cookie: ck }); assert.equal(r.json().role, 'ops'); assert.equal(r.json().user.id, 'jum');
    r = await req(base, 'GET', '/api/pricelist', null, { cookie: ck }); assert.equal(r.status, 200); assert.ok(r.json().seeCost);
    r = await req(base, 'GET', '/api/me', null, { cookie: 'fh_sid=' + crypto.randomBytes(32).toString('base64url') }); assert.equal(r.json().role, null, 'id มั่วไม่ผ่าน');
    r = await req(base, 'GET', '/logout', null, { cookie: ck }); assert.equal(r.status, 302);
    r = await req(base, 'GET', '/api/me', null, { cookie: ck }); assert.equal(r.json().role, null, 'logout แล้ว cookie เดิมใช้ไม่ได้');
    /* เซลล์: บทบาทและชื่อมาจากบัญชี เลือก rep คนอื่นเองไม่ได้ */
    r = await req(base, 'POST', '/api/login', { user: 'sale1', password: 'pw-jum-12345', rep: 's2' }); const ck2 = r.headers['set-cookie'][0].split(';')[0];
    r = await req(base, 'GET', '/api/me', null, { cookie: ck2 }); assert.equal(r.json().role, 'sale'); assert.equal(r.json().rep.id, 's1');
    r = await req(base, 'GET', '/api/pricelist', null, { cookie: ck2 }); assert.equal(r.status, 200); assert.equal(leak(r.json()), null);
    /* webhook: ตรวจลายเซ็นจากไบต์ดิบก่อนแตะข้อมูล */
    const body = JSON.stringify({ events: [{ source: { userId: 'Ux' }, message: { type: 'text', text: 'ทุน มันแข็งหมู 1' } }] });
    r = await req(base, 'POST', '/api/line/webhook', body, { 'x-line-signature': 'bad' }); assert.equal(r.status, 401);
    const sig = crypto.createHmac('sha256', 'linesecret').update(body).digest('base64');
    r = await req(base, 'POST', '/api/line/webhook', body, { 'x-line-signature': sig }); assert.equal(r.status, 200);
    r = await req(base, 'GET', '/healthz'); assert.equal(r.status, 200); assert.equal(r.json().auth, 'users');
    r = await req(base, 'GET', '/api/health'); assert.equal(r.status, 401);
    r = await req(base, 'POST', '/api/log', 'x'.repeat(5e6 + 10), { cookie: ck2 }); assert.equal(r.status, 413);
  } finally { child.kill(); }
});

test('server ไม่มีบัญชีและไม่ได้เปิด FH_DEV_OPEN = ประตูปิด (fail-closed) · webhook ปิดเมื่อไม่มี secret', async () => {
  const { child, base } = await startServer({});
  try {
    let r = await req(base, 'GET', '/api/me'); assert.equal(r.json().locked, true);
    r = await req(base, 'POST', '/api/login', { role: 'boss' }); assert.equal(r.status, 503);
    r = await req(base, 'POST', '/api/login', { user: 'x', password: 'y' }); assert.equal(r.status, 503);
    r = await req(base, 'POST', '/api/line/webhook', { events: [] }); assert.equal(r.status, 503);
    r = await req(base, 'GET', '/healthz'); assert.equal(r.status, 200);
  } finally { child.kill(); }
});
