/* รอบ 16 · ไม่มี connector ตลาดก็อยู่ได้: (2) ใบราคาคู่แข่งที่ "เราขอมาเองในนาม B2B" → ราคาตลาดโดยไม่ต้องไปร้าน ไม่ขอจากลูกค้า · (4) แผนสำรวจแบบประหยัด (เฉพาะร้านที่ไม่มี connector/B2B · SKU ที่มีผล · สัปดาห์ละ 1 ร้าน · ≤15) */
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

test('ใบราคาคู่แข่ง = เราขอมาเองในนาม B2B: ตั้งบัญชี → ร้านหลุดจากคิวสำรวจ · บันทึกใบ (ops เท่านั้น เซลล์ 403) → ราคาป้าย sheet ลงวันที่บนใบ · แบรนด์ใหม่สร้างคู่แข่งเอง', () => {
  const pids = S.products.slice(0, 3).map(p => p.id);
  assert.equal(call('sale', 'POST', '/api/survey/submit', { store: 'b', mode: 'sheet', rows: [{ product_id: pids[0], price: 111 }] }, 's1').status, 403, 'เซลล์ไม่ขอราคาคู่แข่งจากลูกค้า');
  okj(call('ops', 'POST', '/api/sources/b2b', { competitor_id: 'b', account: 'Betagro Shop', channel: 'line', cadence_days: 7, contact: 'เซลล์เบทาโกร' }));
  const cpf = okj(call('ops', 'POST', '/api/sources/b2b', { new_store: 'CPF', channel: 'email', cadence_days: 7 }));
  assert.ok(S.competitors.find(c => c.id === cpf.competitor_id && c.label === 'CPF'), 'สร้างคู่แข่งใหม่พร้อมบัญชี');
  assert.ok(docs.pricelist.rows.every(x => x.marks.some(m => m.id === cpf.competitor_id)), 'ทุกแถวมีช่องราคาของ CPF');
  let src = okj(call('ops', 'GET', '/api/sources')).sources;
  assert.equal(src.find(x => x.id === 'b').mode, 'sheet'); assert.equal(src.find(x => x.id === 'b').sheetDue, true, 'ยังไม่เคยได้ใบ = รอใบรอบนี้');
  const plan = okj(call('ops', 'GET', '/api/survey'));
  assert.ok(plan.stores.filter(s => s.mode === 'survey').length === 2 && plan.stores.filter(s => s.dueThisWeek).length === 1, 'เหลือคิวสำรวจเฉพาะร้านที่ไม่มีบัญชี B2B');
  assert.ok(!plan.stores.find(s => s.competitor_id === 'b').dueThisWeek && plan.sheets.length === 2);
  const r = okj(call('ops', 'POST', '/api/survey/submit', { store: cpf.competitor_id, mode: 'sheet', observed_at: '2026-10-14', rows: pids.map((id, i) => ({ product_id: id, price: 100 + i })) }));
  assert.equal(r.n, 3);
  const obs = docs.market_obs.filter(o => o.competitor_id === cpf.competitor_id); assert.equal(obs.length, 3);
  obs.forEach(o => { assert.equal(o.via, 'sheet'); assert.equal(o.observed_at, '2026-10-14'); });
  src = okj(call('ops', 'GET', '/api/sources')).sources; const sc = src.find(x => x.id === cpf.competitor_id);
  assert.equal(sc.mode, 'sheet'); assert.equal(sc.sheetDue, false, 'ได้ใบรอบนี้แล้ว'); assert.equal(sc.lastSheet, '2026-10-14'); assert.ok(!sc.lastOnline, 'ใบราคาไม่นับเป็นดึงออนไลน์');
  assert.ok(docs.events.some(e => e.action === 'competitor-sheet' && /B2B/.test(e.detail)) && docs.events.some(e => e.action === 'b2b-source'));
  /* ถึงรอบแล้วใบไม่มา → งานรายวันเตือนให้ทวง (ไม่มีใครต้องจำ) */
  docs.source_status.b.b2b.since = '2026-09-20';
  store.ext.followupTick();
  assert.ok(docs.alerts.some(a => /ใบราคา Betagro รอบนี้ยังไม่มา/.test(a.title)), JSON.stringify(docs.alerts.map(a => a.title)));
  assert.ok(!docs.alerts.some(a => /CPF/.test(a.title)), 'CPF เพิ่งได้ใบ ไม่เตือน');
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
