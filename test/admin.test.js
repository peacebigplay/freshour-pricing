/* หน้าตั้งค่าระบบ: จัดการผู้ใช้ · ตั้งค่า LINE/feed จากหน้าเว็บ · สิทธิ์ · ความลับไม่รั่วกลับหน้าเว็บ
   node --test test/admin.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { hashPassword } = require('../src/auth');
const { createSettings } = require('../src/settings');

test('settings: ตรวจรูปแบบ · ความลับไม่คืนค่าจริง · ค่าหน้าเว็บชนะ env · ล้างค่าแล้วกลับไปใช้ env', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-set-'));
  const s = createSettings(dir, { LINE_CHANNEL_TOKEN: 'E'.repeat(60), MARKET_FEED_URL: '' });
  assert.equal(s.get('line_token').length, 60); assert.equal(s.view().line_token.from, 'ตัวแปรระบบ');
  assert.throws(() => s.update({ market_feed_url: 'http://x.com' }), /https/);
  assert.throws(() => s.update({ line_secret: 'short' }), /32/);
  assert.throws(() => s.update({ line_admin: 'abc' }), /userId/);
  const tok = 'T'.repeat(80), uid = 'U' + 'a'.repeat(32);
  assert.deepEqual(s.update({ line_token: tok, line_admin: uid, line_staff: uid + ', ' + 'U' + 'b'.repeat(32) }).sort(), ['line_admin', 'line_staff', 'line_token']);
  const v = s.view(); assert.equal(v.line_token.value, undefined); assert.equal(v.line_token.hint, '…' + tok.slice(-4)); assert.equal(v.line_token.from, 'หน้าเว็บ');
  assert.ok(!JSON.stringify(v).includes(tok), 'token ตัวจริงต้องไม่อยู่ในมุมมอง');
  assert.equal(s.get('line_token'), tok); assert.equal(s.staff().length, 2);
  assert.equal(fs.statSync(path.join(dir, 'settings.json')).mode & 0o077, 0, 'ไฟล์อ่านได้เฉพาะเจ้าของ');
  s.update({ line_token: '' }); assert.equal(s.get('line_token').length, 60, 'ล้างแล้วกลับไปใช้ env');
  assert.equal(createSettings(dir, {}).get('line_admin'), uid, 'อยู่ข้ามรีสตาร์ท');
});

function startServer(env) {
  return new Promise((resolve, reject) => {
    const varDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-adm-'));
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { FH_PORT: '0', FH_JOBS: '0', FH_JOURNAL: '0', FH_VAR_DIR: varDir, FH_DEV_OPEN: '', FH_ACCESS_LOG: '0' }, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; const onData = d => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: 'http://127.0.0.1:' + m[1], varDir }); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('exit', c => reject(new Error('server ออกก่อนเปิด (' + c + '): ' + out.slice(-400))));
    setTimeout(() => reject(new Error('server ไม่เปิดใน 25 วิ')), 25000).unref();
  });
}
function req(base, method, p, body, cookie) {
  return new Promise((resolve, reject) => {
    const r = http.request(base + p, { method, headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}) }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: s, json: () => { try { return JSON.parse(s); } catch (e) { return {}; } } })); });
    r.on('error', e => reject(new Error(method + ' ' + p + ': ' + e.message))); if (body) r.write(JSON.stringify(body)); r.end();
  });
}

test('server: สิทธิ์ admin/boss/ops · สร้างผู้ใช้ รหัสแสดงครั้งเดียว · เปลี่ยนรหัสแล้วเซสชันเดิมหลุด · ปิดแอดมินคนสุดท้ายไม่ได้ · ตั้ง LINE มีผลทันทีและไม่คืนความลับ · แก้การตั้งค่าลง log', async () => {
  const H = hashPassword('pw-admin-12345');
  const users = JSON.stringify([{ id: 'adm', role: 'admin', name: 'อิ๊บ', hash: H }, { id: 'md', role: 'boss', name: 'พี่หมิง', hash: H }, { id: 'jum', role: 'ops', name: 'พี่จุ๋ม', hash: H }]);
  const { child, base } = await startServer({ FH_USERS_JSON: users });
  const login = async (user) => (await req(base, 'POST', '/api/login', { user, password: 'pw-admin-12345' })).headers['set-cookie'][0].split(';')[0];
  try {
    const adm = await login('adm'), md = await login('md'), jum = await login('jum');
    assert.equal((await req(base, 'GET', '/api/admin/system')).status, 401);
    assert.equal((await req(base, 'GET', '/api/admin/system', null, jum)).status, 403, 'ops เข้าไม่ได้');
    assert.equal((await req(base, 'GET', '/api/admin/system', null, md)).status, 200, 'boss ดูได้');
    assert.equal((await req(base, 'POST', '/api/admin/users', { id: 'x1', role: 'ops' }, md)).status, 403, 'boss แก้ไม่ได้');
    let r = await req(base, 'GET', '/api/admin/system', null, adm); const sys = r.json();
    assert.equal(sys.auth.mode, 'users'); assert.equal(sys.line.token, false); assert.equal(sys.settings.line_token.set, false);
    /* ผู้ใช้ */
    assert.equal((await req(base, 'POST', '/api/admin/users', { id: 'Bad Name', role: 'ops' }, adm)).status, 400);
    assert.equal((await req(base, 'POST', '/api/admin/users', { id: 'sale9', role: 'sale' }, adm)).status, 400, 'เซลล์ต้องมีรหัสเซลล์');
    r = await req(base, 'POST', '/api/admin/users', { id: 'sale9', role: 'sale', rep: 's1', name: 'เซลล์ 1' }, adm); assert.equal(r.status, 200);
    const pw = r.json().password; assert.ok(pw && pw.length >= 12, 'ได้รหัสสุ่มครั้งเดียว');
    r = await req(base, 'POST', '/api/login', { user: 'sale9', password: pw }); assert.equal(r.status, 200); const s9 = r.headers['set-cookie'][0].split(';')[0];
    assert.equal((await req(base, 'GET', '/api/me', null, s9)).json().rep.id, 's1');
    assert.equal(JSON.stringify((await req(base, 'GET', '/api/admin/users', null, adm)).json()).includes('hash'), false, 'ไม่ส่ง hash กลับ');
    r = await req(base, 'POST', '/api/admin/users/passwd', { id: 'sale9' }, adm); assert.equal(r.status, 200);
    assert.equal((await req(base, 'GET', '/api/me', null, s9)).json().role, null, 'เปลี่ยนรหัส = เซสชันเดิมหลุด');
    assert.equal((await req(base, 'POST', '/api/login', { user: 'sale9', password: pw })).status, 401, 'รหัสเก่าใช้ไม่ได้');
    assert.equal((await req(base, 'POST', '/api/admin/users/active', { id: 'sale9', active: false }, adm)).status, 200);
    assert.equal((await req(base, 'POST', '/api/login', { user: 'sale9', password: r.json().password })).status, 401, 'บัญชีที่ปิดเข้าไม่ได้');
    assert.equal((await req(base, 'POST', '/api/admin/users/active', { id: 'adm', active: false }, adm)).status, 409, 'ปิดแอดมินคนสุดท้าย/ตัวเองไม่ได้');
    assert.equal((await req(base, 'POST', '/api/admin/users', { id: 'adm', role: 'ops', name: 'อิ๊บ' }, adm)).status, 409, 'ลดบทบาทแอดมินคนสุดท้ายไม่ได้');
    /* LINE */
    assert.equal((await req(base, 'POST', '/api/admin/settings', { line_token: 'short' }, adm)).status, 400);
    assert.equal((await req(base, 'POST', '/api/admin/test-line', {}, adm)).status, 400, 'ยังไม่ตั้ง token');
    const secret = 'a1b2c3d4'.repeat(4), token = 'X'.repeat(90);
    r = await req(base, 'POST', '/api/admin/settings', { line_token: token, line_secret: secret, line_admin: 'U' + 'c'.repeat(32), market_feed_url: 'https://feed.example.com/x.json' }, adm); assert.equal(r.status, 200);
    assert.ok(!r.text.includes(token) && !r.text.includes(secret), 'ความลับไม่ถูกส่งกลับ');
    sys.line = (await req(base, 'GET', '/api/admin/system', null, adm)).json(); assert.equal(sys.line.line.token, true); assert.equal(sys.line.feed.configured, true);
    assert.ok(!JSON.stringify(sys.line).includes(token));
    /* webhook เริ่มรับด้วย secret ที่เพิ่งตั้งผ่านหน้าเว็บ (ไม่ต้องรีสตาร์ท) */
    const body = JSON.stringify({ events: [] }), crypto = require('crypto');
    assert.equal((await req(base, 'POST', '/api/line/webhook', body, null)).status, 401);
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64');
    r = await new Promise((res, rej) => { const q = http.request(base + '/api/line/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sig } }, x => { x.resume(); x.on('end', () => res(x.statusCode)); }); q.on('error', rej); q.write(body); q.end(); });
    assert.equal(r, 200, 'ลายเซ็นที่ตรงกับ secret ใหม่ผ่านทันที');
    const ev = (await req(base, 'GET', '/api/events?limit=50', null, adm)).json().rows.map(e => e.action + '|' + e.detail).join('\n');
    assert.ok(/user-add\|.*เซลล์ 1/.test(ev) && /settings\|.*LINE token/.test(ev), 'การแก้ตั้งค่าลง log');
    assert.ok(!ev.includes(token) && !ev.includes(secret), 'log ไม่มีความลับ');
  } finally { child.kill(); }
});
