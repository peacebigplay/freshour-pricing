/* รอบ 17 · Executive Decision Cockpit (/api/exec): ตอบ 4 คำถาม · ทุกส่วนบอกที่มา · ไม่เดาเมื่อยังไม่มีข้อมูลจริง */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { createStore } = require('../src/store');
function loadDocs() { const dir = path.join(__dirname, '..', 'data', 'fixtures'); const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); const d = {}; for (const k of Object.keys(idx)) d[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8')); return d; }
const docs = loadDocs(), store = createStore(docs, {}), S = docs.state;
const call = (role, method, url, body, rep) => store.handle({ role, rep, method, url, body, origin: 'http://t' });
const okj = (r, m) => { assert.equal(r.status, 200, (m || '') + ' → ' + JSON.stringify(r.body).slice(0, 300)); return r.body; };

test('สิทธิ์ + โครง 10 ส่วน · Coverage = ตัวเดียวกับที่ "ให้ระบบทำรอบนี้" ใช้ · ยังไม่มี invoice/มูลค่า → บอกว่าไม่มี ไม่เดา', () => {
  assert.equal(call('ops', 'GET', '/api/exec').status, 403); assert.equal(call('sale', 'GET', '/api/exec').status, 403);
  const e = okj(call('boss', 'GET', '/api/exec'));
  ['ai', 'flow', 'bottlenecks', 'commercial', 'actual', 'marginByGroup', 'customers', 'sales', 'intel', 'automation', 'decisions', 'ytdSku', 'sources'].forEach(k => assert.ok(k in e, k));
  const pv = okj(call('ops', 'POST', '/api/auto-round', { preview: true, step: 'central' }));
  assert.equal(e.ai.coverage.auto, pv.central.auto + pv.central.already, 'Automation Coverage ต้องตรงกับจำนวนที่ระบบยืนยันเองได้');
  assert.equal(e.ai.review.n, e.ai.coverage.total - e.ai.coverage.auto);
  assert.equal(Object.values(e.ai.review.reasons).reduce((a, b) => a + b, 0) >= e.ai.review.n, true);
  assert.equal(e.ai.acceptance.decided, 0); assert.equal(e.ai.acceptance.pct, null, 'ยังไม่มีคนยืนยัน → ไม่มี % ไม่ใช่ 0%');
  assert.equal(e.ai.market.blind, 210); assert.ok(e.ai.market.note, 'ต้องบอกตรง ๆ ว่าไม่มีตลาด');
  assert.ok(e.actual.none && e.actual.margin == null && /Invoice/.test(e.actual.basis));
  assert.equal(e.commercial.portfolio.known, 0); assert.match(e.commercial.basis, /0\/44/);
  assert.equal(e.flow.steps.length, 5); assert.equal(e.flow.steps[0].n, 210); assert.equal(e.flow.steps[2].n, e.ai.coverage.auto);
  assert.ok(e.bottlenecks.length >= 2 && e.bottlenecks[0].rank === 1 && e.bottlenecks.every(b => b.action && b.action.href));
  assert.ok(e.marginByGroup.length >= 5 && e.marginByGroup.every(g => g.basis === 'contract' && g.target > 0 && g.min > 0));
  assert.equal(e.sales.length, 3); assert.ok(e.sales.every(s => s.winRate == null && s.customers > 0));
  assert.equal(e.automation.ok, true); assert.equal(e.intel.pct, null);
  assert.ok(e.decisions.some(d => d.type === 'process') && e.decisions.some(d => d.type === 'commercial' && /≤ ทุน/.test(d.title)) && e.decisions.some(d => d.type === 'market'), JSON.stringify(e.decisions.map(d => d.title)));
  assert.ok(e.decisions.every(d => d.options.length >= 2 && d.href));
});

test('หลังระบบทำรอบนี้ + คนแก้ราคา 1 ตัว: auto ไม่นับเป็น acceptance · override บอกทิศ · flow/คอขวดขยับ · invoice จริงทำให้ actual + margin กลุ่มสลับไปใช้บิล', () => {
  okj(call('ops', 'POST', '/api/auto-round', {}));
  let e = okj(call('boss', 'GET', '/api/exec'));
  assert.ok(e.ai.acceptance.autoApproved >= 150 && e.ai.acceptance.decided === 0, 'ยืนยันโดยระบบไม่นับเป็นคนยอมรับ');
  assert.ok(e.flow.steps[3].n >= 150 && e.flow.steps[4].n >= 5);
  /* คนแก้ราคาแถวหนึ่งขึ้น +5 จากที่ AI เสนอ */
  const d = docs.desk.rows.find(r => r.v21 && r.v21.central && r.v21.central.state === 'approved' && r.v21.rec && r.v21.rec.price > 0);
  const px = Math.round(d.v21.rec.price) + 5;
  okj(call('ops', 'POST', '/api/save-price-sheet', { rows: [{ product_id: d.id, price: px, goal: 'manual' }] }));
  e = okj(call('boss', 'GET', '/api/exec'));
  assert.equal(e.ai.acceptance.decided, 1); assert.equal(e.ai.acceptance.up, 1); assert.equal(e.ai.acceptance.avgDelta, 5); assert.match(e.ai.acceptance.direction, /ขึ้น/);
  /* invoice จริง → actual + กลุ่มนั้นใช้ margin จากบิล (cost snapshot) */
  const q = okj(call('ops', 'GET', '/api/sales-queue')).rows.find(r => r.state === 'ready'); const cid = q.id;
  const sh = docs['sheet:' + cid], line = sh.rows.find(r => r.inOffer);
  okj(call('ops', 'POST', '/api/quote-sent', { customer_id: cid, channel: 'manual' }));
  okj(call('ops', 'POST', '/api/quote-response', { customer_id: cid, kind: 'accept', all: true }), 'ลูกค้ายืนยันทุกรายการ');
  okj(call('ops', 'POST', '/api/invoices', { customer_id: cid, invoice_no: 'INV-T1', invoice_date: '2026-10-16', lines: [{ product_id: line.pid, qty_kg: 100, price: line.offer }] }), 'ออก invoice');
  e = okj(call('boss', 'GET', '/api/exec'));
  assert.equal(e.actual.none, false); assert.equal(e.actual.invoices, 1); assert.equal(e.actual.revenue, 100 * line.offer); assert.equal(e.actual.kg, 100);
  const P = S.products.find(p => p.id === line.pid), g = e.marginByGroup.find(x => x.grp === P.grp);
  assert.equal(g.basis, 'invoice'); assert.equal(g.actual, Math.round((line.offer - P.cost) / line.offer * 1000) / 10);
  assert.equal(e.ytdSku.length, 1); assert.equal(e.ytdSku[0].kg, 100);
});
