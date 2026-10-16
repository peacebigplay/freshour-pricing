/* รอบ 15 · ลดงานคน: "ให้ระบบทำรอบนี้" (ราคากลาง + ใบรายเจ้า + ส่ง Sales ในคลิกเดียว) · ส่งเอง/ก๊อปลิงก์ · ลูกค้าผูก LINE ด้วยโค้ด · โหมดสำรวจปิด · health ไม่ร้องเพราะยังไม่ได้ต่อ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { createStore } = require('../src/store');
function loadDocs() { const dir = path.join(__dirname, '..', 'data', 'fixtures'); const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); const d = {}; for (const k of Object.keys(idx)) d[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8')); return d; }
const docs = loadDocs(), store = createStore(docs, {}), S = docs.state;
const call = (role, method, url, body, rep) => store.handle({ role, rep, method, url, body, origin: 'http://t' });
const okj = (r, m) => { assert.equal(r.status, 200, (m || '') + ' → ' + JSON.stringify(r.body).slice(0, 300)); return r.body; };
const queueStates = () => okj(call('ops', 'GET', '/api/sales-queue')).rows.reduce((a, r) => { a[r.state] = (a[r.state] || 0) + 1; return a; }, {});

test('preview ไม่แตะข้อมูล · บอกชัดว่าระบบจะทำอะไร/คนต้องดูอะไร · เซลล์ 403', () => {
  const before = JSON.stringify(docs.desk.rows.map(r => r.v21 && r.v21.central));
  const p = okj(call('ops', 'POST', '/api/auto-round', { preview: true }));
  assert.ok(p.preview && p.central.auto > 150 && p.central.need.length > 0, JSON.stringify({ auto: p.central.auto, need: p.central.need.length }));
  assert.ok(p.central.need.every(n => n.reasons.length && n.name), 'ทุก SKU ที่ดันออกมาต้องมีเหตุผล');
  assert.ok(p.customers.exceptions.length > 0 && p.customers.exceptions.every(x => x.reasons.length), 'เจ้าที่ต้องคนดูต้องมีเหตุผล');
  assert.equal(JSON.stringify(docs.desk.rows.map(r => r.v21 && r.v21.central)), before, 'preview ห้ามเปลี่ยนราคากลาง');
  assert.equal(call('sale', 'POST', '/api/auto-round', { preview: true }).status, 403);
});

test('คลิกเดียว: ราคากลางแถวปกติยืนยันเอง · ใบรายเจ้าที่ปกติออก+ส่ง Sales เอง · เจ้าที่ขายต่ำกว่าทุน/ขยับแรงถูกดันให้คนดูเสมอ', () => {
  assert.equal(queueStates().ready || 0, 0, 'ก่อนเริ่ม ไม่มีใบที่ส่ง Sales แล้ว');
  const r = okj(call('ops', 'POST', '/api/auto-round', {}));
  assert.ok(r.central.saved >= 150, 'ราคากลางยืนยันเอง: ' + r.central.saved);
  assert.equal(okj(call('ops', 'GET', '/api/desk')).rows.filter(x => x.v21.central && x.v21.central.state === 'approved').length, r.central.saved + r.central.already);
  assert.ok(r.customers.done.length >= 5, 'ใบรายเจ้าออกเอง: ' + r.customers.done.length);
  const q = queueStates(); assert.equal(q.ready, r.customers.done.length, 'ทุกใบที่ออกเองต้องโผล่ที่เซลล์เป็น "พร้อมส่ง"');
  const buddy = r.customers.exceptions.find(x => /Buddy/.test(x.name)), boon = r.customers.exceptions.find(x => x.name === 'บุญนำพา');
  assert.ok(buddy && boon, 'เจ้าที่ราคาสัญญา ≤ ทุน ต้องไม่ถูกออกใบอัตโนมัติ');
  assert.ok(boon.reasons.some(t => /ขยับแรง/.test(t)) && boon.detail.length, JSON.stringify(boon));
  assert.ok(docs.events.some(e => e.action === 'auto-round'), 'ลง log รูปแบบเดียวกัน');
  /* กดซ้ำ = ไม่ทำซ้ำเจ้าที่ส่งแล้ว */
  const r2 = okj(call('ops', 'POST', '/api/auto-round', { preview: true }));
  assert.equal(r2.customers.done.length, 0); assert.ok(r2.customers.skipped.filter(s => /ส่ง Sales แล้ว/.test(s.why)).length >= r.customers.done.length);
});

test('ส่งเอง: ก๊อปลิงก์ (silent) ไม่นับส่ง · กด "ส่งเองแล้ว" = Quote V1 + SLA เริ่ม + log · ลูกค้าผูก LINE ด้วยโค้ดแล้วระบบรู้จักทันที', () => {
  const row = okj(call('ops', 'GET', '/api/sales-queue')).rows.find(x => x.state === 'ready');
  const cid = row.id, rep = S.customers.find(c => c.id === cid).owner;
  const rv = okj(call('sale', 'GET', '/api/quote-review?customer=' + cid, null, rep));
  assert.match(rv.bindCode, /^FH-[0-9A-F]{5}$/); assert.equal(rv.line, false);
  const lk = okj(call('sale', 'POST', '/api/quote-links', { customer_id: cid, silent: true }, rep)); assert.ok(lk.url && lk.expires_at);
  assert.equal(okj(call('ops', 'GET', '/api/sales-queue')).rows.find(x => x.id === cid).state, 'ready', 'แค่ก๊อปลิงก์ยังไม่นับว่าส่ง');
  okj(call('sale', 'POST', '/api/quote-sent', { customer_id: cid, channel: 'manual' }, rep));
  const after = okj(call('ops', 'GET', '/api/sales-queue')).rows.find(x => x.id === cid);
  assert.ok(['sent', 'waiting_customer'].includes(after.state), after.state);
  assert.equal(docs['sheet:' + cid].quote_version, 1);
  assert.ok(docs.events.some(e => e.action === 'quote-sent' && e.entity_id === cid && /manual/.test(e.detail)));
  /* ลูกค้าพิมพ์โค้ดใน OA → ผูกเอง (พิมพ์เล็ก/มีช่องว่างก็รับ) */
  const wh = okj(call('anon', 'POST', '/api/line/webhook', { events: [{ source: { userId: 'Utest-bind-1' }, message: { text: ' ' + rv.bindCode.toLowerCase().replace('-', ' ') + ' ' } }] }));
  assert.equal(wh.handled[0].result, 'bound');
  assert.equal(S.customers.find(c => c.id === cid).line_user_id, 'Utest-bind-1');
  assert.equal(okj(call('sale', 'GET', '/api/quote-review?customer=' + cid, null, rep)).line, true);
  assert.ok(docs.events.some(e => e.action === 'line-bind' && e.entity_id === cid));
  /* โค้ดมั่ว = ไม่ผูก */
  assert.equal(okj(call('anon', 'POST', '/api/line/webhook', { events: [{ source: { userId: 'Ux' }, message: { text: 'FH-ZZZZZ' } }] })).handled[0].result, 'unknown');
});

test('โหมดสำรวจหน้าร้านปิดเป็นค่าเริ่มต้น (เปิดได้จากตั้งค่า) · งานที่ยังไม่เคยรันไม่นับว่าล้ม', () => {
  assert.equal(okj(call('ops', 'GET', '/api/survey')).off, true);
  okj(call('ops', 'POST', '/api/config', { survey_mode: true })); assert.ok(!okj(call('ops', 'GET', '/api/survey')).off && okj(call('ops', 'GET', '/api/survey')).stores.length);
  okj(call('ops', 'POST', '/api/config', { survey_mode: false })); assert.equal(okj(call('ops', 'GET', '/api/survey')).off, true);
  const h = okj(call('ops', 'GET', '/api/health'));
  assert.ok(h.jobs.every(j => !j.stale), 'เพิ่งเปิดระบบ งานรายวันยังไม่ถึงรอบ ต้องไม่ขึ้น "ขาดรอบ": ' + JSON.stringify(h.jobs.map(j => [j.key, j.status, j.stale])));
  assert.equal(h.ok, true);
});
