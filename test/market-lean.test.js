/* รอบ 16 · ไม่มี connector ตลาดก็อยู่ได้: (2) ใบราคาคู่แข่งที่ลูกค้าถือ → ราคาตลาดโดยไม่ต้องไปร้าน · (4) แผนสำรวจแบบประหยัด (เฉพาะ SKU ที่มีผล · สัปดาห์ละ 1 ร้าน · ≤15 SKU) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { createStore } = require('../src/store');
function loadDocs() { const dir = path.join(__dirname, '..', 'data', 'fixtures'); const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); const d = {}; for (const k of Object.keys(idx)) d[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8')); return d; }
const docs = loadDocs(), store = createStore(docs, {}), S = docs.state;
const call = (role, method, url, body, rep) => store.handle({ role, rep, method, url, body, origin: 'http://t' });
const okj = (r, m) => { assert.equal(r.status, 200, (m || '') + ' → ' + JSON.stringify(r.body).slice(0, 300)); return r.body; };

test('แผนสำรวจแบบประหยัด: เปิดอยู่ · สัปดาห์ละ 1 ร้าน · ≤15 SKU · เฉพาะหมวดแข่งขัน+ตัวขายดี', () => {
  const p = okj(call('ops', 'GET', '/api/survey'));
  assert.ok(p.lean && !p.off); assert.equal(p.stores.length, 3);
  assert.equal(p.stores.filter(s => s.dueThisWeek).length, 1, 'ถึงคิวแค่ร้านเดียวต่อสัปดาห์');
  const due = p.stores.find(s => s.dueThisWeek); assert.ok(due.targets.length > 0 && due.targets.length <= 15, 'ร้านที่ถึงคิว ≤15 SKU');
  p.stores.filter(s => !s.dueThisWeek).forEach(s => assert.equal(s.targets.length, 0, 'ร้านที่ยังไม่ถึงคิวไม่มีงาน: ' + s.label));
  const comp = new Set(docs.desk.rows.filter(r => r.v21 && r.v21.category && r.v21.category.key === 'competitive').map(r => r.id));
  due.targets.forEach(t => assert.ok(comp.has(t.id) || t.focus === 'ขายดี', 'นอกโฟกัส: ' + t.name));
  assert.ok(p.focus.competitive >= 50 && p.focus.top <= 10, JSON.stringify(p.focus));
  /* ปรับเพดานได้ · ปิดได้ */
  okj(call('ops', 'POST', '/api/config', { survey_max_sku: 8 })); assert.ok(okj(call('ops', 'GET', '/api/survey')).stores.find(s => s.dueThisWeek).targets.length <= 8);
  okj(call('ops', 'POST', '/api/config', { survey_max_sku: 15 }));
});

test('ใบราคาคู่แข่ง: เซลล์ส่งใบ CPF (แบรนด์ใหม่) ลงวันที่บนใบ → คู่แข่งถูกสร้าง · ราคาเข้า market_obs ป้าย sheet · ไม่นับเป็นออนไลน์ · ร้านนั้นสัปดาห์นี้ไม่ต้องไปสำรวจ', () => {
  const p0 = okj(call('ops', 'GET', '/api/survey')), due = p0.stores.find(s => s.dueThisWeek);
  const pids = S.products.slice(0, 3).map(p => p.id);
  const r = okj(call('sale', 'POST', '/api/survey/submit', { store: '', new_store: 'CPF', mode: 'sheet', observed_at: '2026-10-14', rows: pids.map((id, i) => ({ product_id: id, price: 100 + i })) }, 's1'));
  assert.equal(r.n, 3);
  const cpf = S.competitors.find(c => c.label === 'CPF'); assert.ok(cpf, 'สร้างคู่แข่งใหม่');
  assert.ok(docs.pricelist.rows.every(x => x.marks.some(m => m.id === cpf.id)), 'ทุกแถวมีช่องราคาของ CPF');
  const obs = docs.market_obs.filter(o => o.competitor_id === cpf.id); assert.equal(obs.length, 3);
  obs.forEach(o => { assert.equal(o.via, 'sheet'); assert.equal(o.observed_at, '2026-10-14'); assert.match(o.by, /sale\|s1/); });
  const src = okj(call('ops', 'GET', '/api/sources')).sources.find(x => x.id === cpf.id); assert.equal(src.mode, 'survey', 'ใบราคาไม่ใช่ออนไลน์'); assert.ok(src.lastSurvey);
  assert.ok(docs.events.some(e => e.action === 'competitor-sheet'));
  /* ส่งใบของร้านที่ถึงคิว → ไม่ต้องไปร้านสัปดาห์นี้ */
  okj(call('sale', 'POST', '/api/survey/submit', { store: due.competitor_id, mode: 'sheet', rows: [{ product_id: pids[0], price: 99 }] }, 's1'));
  const d2 = okj(call('ops', 'GET', '/api/survey')).stores.find(s => s.competitor_id === due.competitor_id); assert.equal(d2.needed, false); assert.match(d2.note, /ได้ใบราคาคู่แข่งแล้ว/);
});

test('รูป/ไฟล์ที่ส่งเข้า LINE OA → กล่องรอตรวจ (เฉพาะ Pricing เห็น) → อ่านแล้วปิดรายการ', () => {
  const wh = okj(call('anon', 'POST', '/api/line/webhook', { events: [{ source: { userId: 'Uimg' }, message: { type: 'image', id: '777001' } }] }));
  assert.equal(wh.handled[0].result, 'image-queued');
  const pend = okj(call('ops', 'GET', '/api/survey')).lineInbox; assert.ok(pend.some(x => x.message_id === '777001' && x.status === 'pending'));
  assert.equal(okj(call('sale', 'GET', '/api/survey', null, 's1')).lineInbox, undefined, 'เซลล์ไม่เห็นกล่องรอตรวจ');
  okj(call('ops', 'POST', '/api/inbox/done', { id: '777001', status: 'ok' }));
  assert.ok(!okj(call('ops', 'GET', '/api/survey')).lineInbox.some(x => x.message_id === '777001'));
  assert.ok(docs.events.some(e => e.action === 'line-image'));
});
