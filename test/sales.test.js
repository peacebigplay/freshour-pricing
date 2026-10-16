/* ทีมขาย: เซลล์หลายคน ถือลูกค้าคนละชุด — เห็น/แตะได้เฉพาะของตัวเอง · แดชบอร์ดเซลล์เป็นงานขาย · งานตามลูกค้าเงียบรายวัน · log บอกว่าเซลล์คนไหนทำ */
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
const store = createStore(loadDocs(), {});
const call = (role, method, url, body, rep) => store.handle({ role, rep, method, url, body, origin: 'http://t' });
const okj = r => { assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200)); return r.body; };

test('เซลล์ต้องเลือกชื่อตอนเข้า · เห็นเฉพาะลูกค้าของตัวเอง · แตะลูกค้าคนอื่นได้ 403 · หัวหน้าเห็นทุกคนและกรองรายคนได้', () => {
  const reps = okj(call('anon', 'GET', '/api/reps'));
  assert.ok(reps.reps.length >= 2 && reps.unassigned === 0, 'ลูกค้าทุกเจ้ามีคนถือ');
  assert.equal(call('anon', 'POST', '/api/login', { role: 'sale' }).status, 400, 'ไม่เลือกชื่อ = เข้าไม่ได้');
  const lg = call('anon', 'POST', '/api/login', { role: 'sale', rep: 's1' }); assert.equal(lg.session, 'sale|s1');
  assert.equal(okj(call('sale', 'GET', '/api/me', null, 's1')).rep.id, 's1');
  const s1 = okj(call('sale', 'GET', '/api/sends', null, 's1')), s2 = okj(call('sale', 'GET', '/api/sends', null, 's2')), all = okj(call('ops', 'GET', '/api/sends'));
  assert.ok(s1.total > 0 && s2.total > 0 && s1.total + s2.total < all.total, 'แต่ละคนเห็นแค่ส่วนของตัวเอง');
  assert.ok(!s1.customers.some(c => s2.customers.some(d => d.id === c.id)), 'ไม่ทับกัน');
  const other = s2.customers[0].id, mine = s1.customers[0].id;
  assert.equal(call('sale', 'GET', '/api/sheet?customer=' + other, null, 's1').status, 403);
  assert.equal(call('sale', 'GET', '/api/sheet?customer=' + mine, null, 's1').status, 200);
  assert.equal(call('sale', 'POST', '/api/price-request', { customer_id: other, product_id: 'x', want: 1 }, 's1').status, 403);
  assert.equal(call('sale', 'POST', '/api/customers/' + other, { line_user_id: 'Uxx' }, 's1').status, 403);
  assert.equal(call('ops', 'GET', '/api/sheet?customer=' + other).status, 200, 'ออปส์เห็นทุกเจ้า');
  assert.equal(okj(call('sale', 'GET', '/api/guard', null, 's1')).customers.length, s1.customers.length);
  /* หัวหน้า/ออปส์ตั้งชื่อเซลล์จริงและย้ายลูกค้าได้ */
  const up = okj(call('ops', 'POST', '/api/reps', { id: 's2', name: 'เซลล์สอง', customers: [mine] }));
  assert.ok(up.reps.some(r => r.id === 's2' && r.name === 'เซลล์สอง'));
  assert.equal(call('sale', 'GET', '/api/sheet?customer=' + mine, null, 's1').status, 403, 'ย้ายแล้ว s1 แตะไม่ได้');
  assert.equal(call('sale', 'POST', '/api/reps', { name: 'x' }, 's1').status, 403, 'เซลล์ตั้งเองไม่ได้');
  okj(call('ops', 'POST', '/api/customers/' + mine, { owner: 's1' }));
});

test('แดชบอร์ดเซลล์ = งานขายของคนนั้น (ลูกค้าอยู่ขั้นไหน · ค้างอะไร · 7 วันทำอะไร · ช่องทาง LINE) · ไม่มีทุน/margin · หน้าเซลล์เป็นมุมมองขายเสมอ', () => {
  const d = okj(call('sale', 'GET', '/api/dashboard', null, 's1'));
  assert.equal(d.role, 'sale'); assert.equal(d.rep.id, 's1');
  assert.ok(d.customers.every(c => c.owner === 's1'));
  ['send', 'follow', 'inform', 'close', 'total'].forEach(k => assert.equal(typeof d.todo[k], 'number'));
  ['sent', 'follow', 'closed', 'replied'].forEach(k => assert.equal(typeof d.done7[k], 'number'));
  assert.ok(!/"cost"|"margin"|"gp"/.test(JSON.stringify(d)), 'ไม่มีทุน/กำไรใน payload ของเซลล์');
  const b = okj(call('boss', 'GET', '/api/dashboard?view=sales'));
  assert.equal(b.role, 'sale'); assert.ok(b.reps.length >= 2 && b.customers.length > d.customers.length, 'หัวหน้าเห็นรวมทุกคน + สรุปรายคน');
  const b2 = okj(call('boss', 'GET', '/api/dashboard?view=sales&rep=s2'));
  assert.ok(b2.customers.every(c => c.owner === 's2') && b2.rep.id === 's2');
  assert.equal(okj(call('boss', 'GET', '/api/dashboard')).role, 'boss', 'ไม่ใส่ view = แดชบอร์ดของตัวเอง');
});

test('ตามเจ้าที่เงียบ: งานระบบรายวันส่ง LINE ให้เอง/ยกเป็นงานค้าง · ปิดดีลบันทึกราคาที่ตกลง · log ทุกขั้นรูปแบบเดียวกันและบอกว่าเซลล์คนไหน', () => {
  const s1 = okj(call('sale', 'GET', '/api/sends', null, 's1'));
  const c = s1.customers[0];
  /* เซลล์บันทึกว่าตามลูกค้าแล้ว → event ติดชื่อเซลล์ */
  okj(call('sale', 'POST', '/api/followups', { customer_id: c.id, channel: 'โทร', note: 'คุยกับเฮียแล้ว', next_in_days: 2 }, 's1'));
  const ev = okj(call('ops', 'GET', '/api/events?q=' + encodeURIComponent(c.name)));
  const mineEv = ev.rows.find(e => e.rep === 's1' && e.actor === 'sale');
  assert.ok(mineEv, 'เหตุการณ์ของเซลล์มี rep กำกับ: ' + JSON.stringify(ev.rows.slice(0, 2)));
  ['at', 'actor', 'kind', 'action', 'entity', 'status', 'step'].forEach(k => assert.ok(k in mineEv, 'ฟิลด์มาตรฐาน ' + k));
  /* เซลล์อีกคนไม่เห็น log ของลูกค้าที่ไม่ใช่ของตัวเอง */
  const ev2 = okj(call('sale', 'GET', '/api/events', null, 's2'));
  assert.ok(!ev2.rows.some(e => e.id === mineEv.id));
  /* งานระบบ: followup-check รันได้ ลง log เป็น job */
  const t = okj(call('system', 'POST', '/api/followups/tick', {}));
  assert.ok('due' in t && Array.isArray(t.sent));
  const job = okj(call('ops', 'GET', '/api/health')).jobs.find(j => j.key === 'followup-check');
  assert.equal(job.status, 'ok');
  assert.ok(okj(call('ops', 'GET', '/api/events?kind=system')).rows.some(e => e.action === 'followup-check'));
});
