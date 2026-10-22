/* งานคนใช้ รอบ 21: ตัวเลข preview ของ "ให้ระบบทำรอบนี้" ต้องตรงกับที่ทำจริง · บันทึกบางส่วนได้ · "ส่งเองแล้ว" เก็บช่องทาง
   node --test test/ux.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createStore } = require('../src/store');

function loadDocs() {
  const dir = path.join(__dirname, '..', 'data', 'fixtures');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const docs = {};
  for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8'));
  return docs;
}
const okj = (r, m) => { assert.equal(r.status, 200, (m || '') + ' → ' + JSON.stringify(r.body).slice(0, 200)); return r.body; };

test('preview ของ "ให้ระบบทำรอบนี้" = จำนวนที่ทำจริง (เคยบอก 0 เจ้า แล้วส่งไป 11)', () => {
  const store = createStore(loadDocs(), { devOpen: true });
  const call = (role, method, url, body) => store.handle({ role, method, url, body, origin: 'http://t' });
  const pv = okj(call('ops', 'POST', '/api/auto-round', { preview: true }));
  const run = okj(call('ops', 'POST', '/api/auto-round', {}));
  assert.equal(run.central.saved, pv.central.auto, 'ราคากลางที่ยืนยันจริง = ที่ preview บอก');
  assert.equal(run.customers.done.length, pv.customers.done.length, 'ใบรายเจ้าที่ออกจริง = ที่ preview บอก (' + pv.customers.done.length + ')');
  assert.ok(run.customers.done.length > 0, 'มีใบรายเจ้าออกจริงอย่างน้อย 1 เจ้า จึงพิสูจน์ได้');
  assert.deepEqual(run.customers.done.map(x => x.id).sort(), pv.customers.done.map(x => x.id).sort(), 'เป็นเจ้าเดียวกัน');
});

test('ราคากลาง: บันทึกบางส่วนได้ (ไม่ต้องครบ 100% ในนั่งเดียว) และด่านใบรายเจ้ายังอยู่', () => {
  const store = createStore(loadDocs(), { devOpen: true });
  const call = (role, method, url, body) => store.handle({ role, method, url, body, origin: 'http://t' });
  const dk = okj(call('ops', 'GET', '/api/desk'));
  const rows = dk.rows.filter(r => r.cost > 0 && r.v21 && r.v21.goals);
  const part = rows.slice(0, 5).map(r => ({ product_id: r.id, price: Math.max(r.w2, r.v21.guard || 0), goal: 'target', exception: '' }));
  const s1 = okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: null, rows: part }));
  assert.equal(s1.saved, 5);
  const dk2 = okj(call('ops', 'GET', '/api/desk'));
  assert.equal(dk2.centralCount.approved, 5); assert.ok(dk2.centralCount.need > 0, 'ที่เหลือยังรอ');
  const CID = dk2.customers.find(c => c.lines > 0).id;
  assert.equal(call('ops', 'POST', '/api/handoff', { customer_id: CID }).status, 400, 'ส่ง Sales ยังต้องครบ');
});

test('"ส่งเองแล้ว" บันทึกช่องทางที่ส่ง และลิงก์แบบ silent ไม่นับว่าส่ง', () => {
  const store = createStore(loadDocs(), { devOpen: true });
  const call = (role, method, url, body) => store.handle({ role, method, url, body, origin: 'http://t' });
  okj(call('ops', 'POST', '/api/auto-round', {}));
  const sends = okj(call('ops', 'GET', '/api/sends'));
  const c = sends.customers.find(x => x.handedAt && x.lines > 0);
  const lk = okj(call('ops', 'POST', '/api/quote-links', { customer_id: c.id, silent: true }));
  assert.ok(lk.token);
  assert.ok(!okj(call('ops', 'GET', '/api/sends')).customers.find(x => x.id === c.id).sentAt, 'คัดลอกลิงก์ยังไม่นับว่าส่ง');
  okj(call('ops', 'POST', '/api/quote-sent', { customer_id: c.id, channel: 'manual', note: 'LINE ส่วนตัว' }));
  assert.ok(okj(call('ops', 'GET', '/api/sends')).customers.find(x => x.id === c.id).sentAt, 'กดส่งเองแล้ว = นับว่าส่ง');
});
