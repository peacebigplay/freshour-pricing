/* ข้อมูลคงทนข้ามรีสตาร์ท/deploy:
   1) เล่น journal ซ้ำด้วยเวลาของรายการนั้น (ไม่ใช่เวลารีสตาร์ท) · 2) token ลิงก์ลูกค้าเดิมยังใช้ได้ · 3) เลขรันไม่ชนของเดิม
   4) ลิงก์หมดอายุใช้ไม่ได้และสร้างใหม่ได้ · 5) server จริง: journal → snapshot → รีสตาร์ท ข้อมูลครบ ไม่ซ้ำ
   node --test test/durability.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const http = require('http');
const { spawn } = require('child_process');
const { createStore } = require('../src/store');

function loadDocs() {
  const dir = path.join(__dirname, '..', 'data', 'fixtures');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const docs = {};
  for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8'));
  return docs;
}
const okj = (r, m) => { assert.equal(r.status, 200, (m || '') + ' → ' + JSON.stringify(r.body).slice(0, 200)); return r.body; };
const mk = () => { const docs = loadDocs(); const store = createStore(docs, { devOpen: true }); return { docs, store, call: (role, method, url, body, rep) => store.handle({ role, rep, method, url, body, origin: 'http://t' }) }; };
/* ทางลัด: ทำให้ลูกค้าหนึ่งรายมีใบราคาที่ Pricing ยืนยันแล้ว (ราคากลาง → ใบรายเจ้า → ส่งเซลล์) */
function readyCustomer(call) {
  const dk = okj(call('ops', 'GET', '/api/desk'));
  const CID = dk.customers.find(c => c.lines > 0).id;
  const rows = dk.rows.filter(r => r.cost > 0 && r.v21 && r.v21.goals).map(r => ({ product_id: r.id, price: Math.max(r.w2, r.v21.guard || 0), goal: 'target', exception: '' }));
  okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: null, rows }), 'ราคากลาง');
  const d2 = okj(call('ops', 'GET', '/api/desk?customer=' + CID));
  const crow = d2.rows.filter(r => r.cust && r.cust.source === 'สัญญา' && r.v21 && r.v21.goals);
  okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: CID, goal: 'target', rows: crow.map(r => ({ product_id: r.id, price: Math.max(r.cust.price, r.v21.guard || 0), goal: 'target', exception: '' })) }), 'ใบรายเจ้า');
  okj(call('ops', 'POST', '/api/handoff', { customer_id: CID }), 'ส่งเซลล์');
  return CID;
}
const sheetPayload = (d2) => d2.rows.filter(r => r.cust && r.cust.source === 'สัญญา' && r.v21 && r.v21.goals).map(r => ({ product_id: r.id, price: Math.max(r.cust.price, r.v21.guard || 0), goal: 'target', exception: '' }));

test('นาฬิกา: เล่นซ้ำด้วยเวลาของรายการ → วันที่/อายุลิงก์/รหัสลูกค้าเท่าเดิม', () => {
  const { store, call } = mk();
  const CID = readyCustomer(call);
  const T = Date.parse('2026-09-01T02:00:00Z');   /* = 09:00 กรุงเทพ */
  store.setClock(T);
  const a = okj(call('ops', 'POST', '/api/customers', { name: 'ร้านทดสอบนาฬิกา', tier: 'w2' }));
  const lk = okj(call('ops', 'POST', '/api/quote-links', { customer_id: CID }));
  const ev = okj(call('ops', 'GET', '/api/events?limit=1')).rows[0];
  store.setClock(null);
  assert.equal(lk.expires_at, '2026-09-15', 'อายุลิงก์นับจากเวลาของรายการ');
  assert.ok(/^2026-09-01[ T]09:/.test(ev.at), 'เหตุการณ์ลงเวลาของรายการ ไม่ใช่เวลาปัจจุบัน: ' + ev.at);
  /* เล่นซ้ำในก้อนใหม่ด้วยเวลาเดิม → ได้รหัสลูกค้าเดิม (hash จากชื่อ+เวลา) */
  const s2 = mk(); s2.store.setClock(T);
  const b = okj(s2.call('ops', 'POST', '/api/customers', { name: 'ร้านทดสอบนาฬิกา', tier: 'w2' }));
  s2.store.setClock(null);
  assert.equal(a.id, b.id, 'รหัสลูกค้าต้องตรงกันทุกครั้งที่เล่นซ้ำ');
});

test('token ลิงก์ลูกค้า: handler บอก server ให้เก็บลง journal · เล่นซ้ำแล้วลิงก์เดิมเปิดได้', () => {
  const { store, call } = mk();
  const CID = readyCustomer(call);
  const r = call('ops', 'POST', '/api/quote-links', { customer_id: CID }); okj(r);
  assert.equal(r.journal.__token, r.body.token, 'journal patch ต้องมี token ที่สุ่มได้');
  assert.ok(store.publicQuote(r.body.token), 'ลิงก์ใช้ได้');
  const s2 = mk(); readyCustomer(s2.call);
  const r2 = okj(s2.call('ops', 'POST', '/api/quote-links', { customer_id: CID, __token: r.body.token }));
  assert.equal(r2.token, r.body.token); assert.ok(s2.store.publicQuote(r.body.token), 'เล่นซ้ำด้วย token เดิม → ลูกค้าเปิดลิงก์เดิมได้');
  assert.equal(okj(s2.call('ops', 'POST', '/api/quote-links', { customer_id: CID })).token, r.body.token, 'ขอซ้ำได้ token เดิม ไม่สุ่มใหม่');
});

test('ลิงก์หมดอายุ: เปิดไม่ได้ ตอบไม่ได้ (410) · เซลล์ขอใหม่ได้ token ใหม่', () => {
  const { store, call } = mk();
  const CID = readyCustomer(call);
  const lk = okj(call('ops', 'POST', '/api/quote-links', { customer_id: CID }));
  store.setClock(Date.now() + 20 * 864e5);
  assert.equal(store.publicQuote(lk.token), null);
  assert.equal(call('anon', 'POST', '/api/public-quotes/' + lk.token + '/respond', { kind: 'accept', all: true }).status, 410);
  const lk2 = okj(call('ops', 'POST', '/api/quote-links', { customer_id: CID }));
  store.setClock(null);
  assert.notEqual(lk2.token, lk.token); assert.ok(lk2.expires_at > lk.expires_at);
});

test('เลขรัน: ต่อจาก id สูงสุดที่มีอยู่ (เปิดจาก snapshot/fixtures แล้วไม่ชน)', () => {
  const { docs, call } = mk();
  const maxEv = Math.max(...docs.events.map(e => Number(e.id) || 0));
  okj(call('ops', 'POST', '/api/log', { action: 'note', detail: 'ทดสอบเลขรัน' }));
  const ev = okj(call('ops', 'GET', '/api/events?limit=1')).rows[0];
  assert.ok(Number(ev.id) > maxEv, 'event ใหม่ ' + ev.id + ' ต้องมากกว่า ' + maxEv);
  assert.equal(docs.events.filter(e => e.id === ev.id).length, 1, 'id ใหม่ไม่ซ้ำกับของเดิม');   /* fixture เดิมมี id ซ้ำกันเองอยู่ก่อนแล้ว (seq เคยเริ่ม 0) — ไม่ใช่เรื่องของรอบนี้ */
  const maxReq = Math.max(...docs['price-requests'].rows.map(r => Number(r.id) || 0));
  docs['price-requests'].rows.unshift({ id: 777, customer_id: 'x', product_id: 'y', status: 'closed' });
  const s2 = createStore(docs, { devOpen: true });
  const CID = readyCustomer((role, method, url, body) => s2.handle({ role, method, url, body, origin: 'http://t' }));
  const pid = s2.handle({ role: 'ops', method: 'GET', url: '/api/desk?customer=' + CID }).body.rows.find(r => r.cust && r.cust.source === 'สัญญา').id;
  const pr = s2.handle({ role: 'ops', method: 'POST', url: '/api/price-request', body: { customer_id: CID, product_id: pid, want: 1, reason: 'ทดสอบ' }, origin: 'http://t' });
  assert.equal(pr.status, 200, JSON.stringify(pr.body).slice(0, 150)); assert.ok(pr.body.id > 777, 'คำขอใหม่ต้องเกิน 777 ไม่ใช่ ' + pr.body.id);
  assert.ok(maxReq >= 1);
});

/* ── server จริง: journal → รีสตาร์ท → snapshot → รีสตาร์ท ── */
function startServer(varDir, extra) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { FH_PORT: '0', FH_JOBS: '0', FH_VAR_DIR: varDir, FH_DEV_OPEN: '1', FH_ACCESS_LOG: '0' }, extra || {}), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = d => { out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, base: 'http://127.0.0.1:' + m[1], log: () => out }); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('exit', c => reject(new Error('server ออกก่อนเปิด (' + c + '): ' + out.slice(-500))));
    setTimeout(() => reject(new Error('server ไม่เปิดใน 25 วิ: ' + out.slice(-500))), 25000).unref();
  });
}
function stop(child) { return new Promise(r => { child.once('exit', r); child.kill('SIGTERM'); setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} r(); }, 5000).unref(); }); }
function req(base, method, p, body, cookie) {
  return new Promise((resolve, reject) => {
    const r = http.request(base + p, { method, headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}) }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: () => { try { return JSON.parse(s); } catch (e) { return {}; } } })); });
    r.on('error', e => reject(new Error(method + ' ' + p + ': ' + e.message))); if (body) r.write(JSON.stringify(body)); r.end();
  });
}

test('server: บันทึก → รีสตาร์ท (journal) → snapshot → รีสตาร์ท (snapshot+journal) → SIGTERM snapshot · เวลาเดิม ไม่ซ้ำ ลิงก์เดิมใช้ได้', async () => {
  const varDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-dur-'));
  let { child, base, log } = await startServer(varDir);
  const login = async () => (await req(base, 'POST', '/api/login', { role: 'boss' })).headers['set-cookie'][0].split(';')[0];
  let ck = await login();
  try {
    assert.equal((await req(base, 'POST', '/api/log', { action: 'note', detail: 'รอบที่ 1' }, ck)).status, 200);
    const ev1 = (await req(base, 'GET', '/api/events?limit=1', null, ck)).json().rows[0];
    /* สร้างลิงก์ลูกค้าจริงผ่าน API */
    const dk = (await req(base, 'GET', '/api/desk', null, ck)).json(); const CID = dk.customers.find(c => c.lines > 0).id;
    const rows = dk.rows.filter(r => r.cost > 0 && r.v21 && r.v21.goals).map(r => ({ product_id: r.id, price: Math.max(r.w2, r.v21.guard || 0), goal: 'target', exception: '' }));
    assert.equal((await req(base, 'POST', '/api/save-price-sheet', { customer_id: null, rows }, ck)).status, 200);
    const sh = (await req(base, 'GET', '/api/desk?customer=' + CID, null, ck)).json();
    assert.equal((await req(base, 'POST', '/api/save-price-sheet', { customer_id: CID, goal: 'target', rows: sheetPayload(sh) }, ck)).status, 200);
    assert.equal((await req(base, 'POST', '/api/handoff', { customer_id: CID }, ck)).status, 200);
    const lk = (await req(base, 'POST', '/api/quote-links', { customer_id: CID }, ck)).json(); assert.ok(lk.token);
    assert.equal((await req(base, 'GET', '/api/public-quotes/' + lk.token)).status, 200);
    const evBefore = (await req(base, 'GET', '/api/events?limit=500', null, ck)).json(); const nEvents = evBefore.total;
    const jl = fs.readFileSync(path.join(varDir, 'journal.jsonl'), 'utf8').trim().split('\n'); assert.ok(jl.length >= 5); assert.ok(JSON.parse(jl[jl.length - 1]).n >= 5, 'ทุกบรรทัดมีเลข n');
    assert.ok(jl.some(l => l.includes('"__token":"' + lk.token + '"')), 'token อยู่ใน journal');

    /* รีสตาร์ท 1: journal ล้วน */
    await stop(child); ({ child, base, log } = await startServer(varDir)); ck = await login();
    const ev1b = (await req(base, 'GET', '/api/events?limit=500', null, ck)).json().rows.find(e => e.detail === 'รอบที่ 1');
    assert.equal(ev1b.at, ev1.at, 'เวลาเดิมหลังเล่นซ้ำ'); assert.equal(ev1b.id, ev1.id);
    assert.equal((await req(base, 'GET', '/api/public-quotes/' + lk.token)).status, 200, 'ลิงก์ลูกค้าเดิมยังใช้ได้หลัง deploy');
    const evAfter = (await req(base, 'GET', '/api/events?limit=500', null, ck)).json();
    const key = e => e.action + '|' + e.actor + '|' + (e.detail || '').slice(0, 60);
    const keys = ev => ev.rows.filter(e => !/^(login|quote-open)$/.test(e.action)).map(key);   /* login/quote-open เกิดใหม่ทุกครั้งที่ใช้งานจริง ไม่ใช่ของงอกจากการเล่นซ้ำ */
    const kb = keys(evBefore), ka = keys(evAfter);
    assert.deepEqual(ka.filter(k => !kb.includes(k)), [], 'เหตุการณ์ที่งอกจากการเล่นซ้ำ');
    assert.deepEqual(kb.filter(k => !ka.includes(k)), [], 'เหตุการณ์ที่หายหลังเล่นซ้ำ');

    /* snapshot แล้ว journal ว่าง · เขียนต่อ → รีสตาร์ท 2 */
    assert.equal((await req(base, 'POST', '/api/admin/snapshot', {}, ck)).status, 200);
    assert.ok(fs.existsSync(path.join(varDir, 'snapshot.json.gz'))); assert.equal(fs.readFileSync(path.join(varDir, 'journal.jsonl'), 'utf8'), '');
    assert.equal((await req(base, 'POST', '/api/log', { action: 'note', detail: 'หลัง snapshot' }, ck)).status, 200);
    const hz = (await req(base, 'GET', '/healthz')).json(); assert.equal(hz.journal.since_snapshot, 1); assert.ok(hz.snapshot_at);
    await stop(child); ({ child, base, log } = await startServer(varDir)); ck = await login();
    const all = (await req(base, 'GET', '/api/events?limit=500', null, ck)).json();
    assert.deepEqual(keys(all).sort(), kb.concat(['note|boss|หลัง snapshot']).sort(), 'snapshot + journal ครบ ไม่ซ้ำ');
    assert.equal(all.rows.filter(e => e.action === 'login').length, 3, 'เหตุการณ์ login ทั้ง 3 ครั้งอยู่ครบ (journaled)');
    assert.ok(all.rows.find(e => e.detail === 'รอบที่ 1') && all.rows.find(e => e.detail === 'หลัง snapshot'));
    assert.equal((await req(base, 'GET', '/api/public-quotes/' + lk.token)).status, 200);
    /* SIGTERM → snapshot เอง journal ว่าง · รีสตาร์ท 3 ครบเท่าเดิม */
    assert.equal((await req(base, 'POST', '/api/log', { action: 'note', detail: 'ก่อนปิด' }, ck)).status, 200);
    await stop(child);
    assert.equal(fs.readFileSync(path.join(varDir, 'journal.jsonl'), 'utf8'), '', 'SIGTERM แล้วต้อง snapshot + ตัด journal');
    ({ child, base } = await startServer(varDir)); ck = await login();
    assert.deepEqual(keys((await req(base, 'GET', '/api/events?limit=500', null, ck)).json()).sort(), kb.concat(['note|boss|หลัง snapshot', 'note|boss|ก่อนปิด']).sort());
  } catch (e) { console.error('SERVER LOG:\n' + log().slice(-1500)); throw e; } finally { await stop(child); }
});
