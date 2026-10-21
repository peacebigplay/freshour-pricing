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
const store = createStore(loadDocs(), { devOpen: true });
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
  /* SALES LOGIC: Performance · Pipeline (สถานะเดียวต่อเจ้า) · My Work (เฉพาะงานของเซลล์) แยกจาก Waiting (รอ Pricing/ลูกค้า) · Board · Closed */
  ['customers', 'quoteSent', 'quoteSentPct', 'won', 'lost', 'portfolioValue', 'valueUnknown'].forEach(k => assert.equal(typeof d.perf[k], 'number', 'perf.' + k));
  assert.ok(d.perf.winRate == null || (d.perf.winRate >= 0 && d.perf.winRate <= 100));
  const sum = Object.keys(d.pipeline).reduce((a, k) => a + d.pipeline[k], 0); assert.equal(sum, d.customers.length, 'ทุกเจ้าอยู่สถานะเดียว');
  assert.ok(d.work.every(r => r.isSalesTask && r.action) && d.waiting.every(r => !r.isSalesTask), 'งานเซลล์ต้องมี action · รอคนอื่นไม่ใช่งานเซลล์');
  assert.ok(d.work.every((r, i, arr) => i === 0 || arr[i - 1].priority <= r.priority), 'คิวเรียงตาม priority');
  assert.ok(!d.waiting.some(r => r.state === 'ready'), 'พร้อมส่ง = งานเซลล์ ไม่ใช่รอ');
  assert.ok(d.customers.filter(r => r.state === 'waiting_pricing').every(r => !r.isSalesTask), 'รอ Pricing ไม่นับเป็นงานค้างของเซลล์');
  ['sent', 'follow', 'closed', 'replied'].forEach(k => assert.equal(typeof d.done7[k], 'number'));
  assert.ok(d.sla && d.sla.responseH === 48 && d.lostReasons.no_response);
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

test('SALES LOGIC: ส่งแล้วต่อเมื่อ LINE สำเร็จจริง · ส่งไม่สำเร็จ = งาน P1 · ราคาต่อรองที่ Pricing ตัดสินแล้ว = P1 · เงียบเกิน SLA → ตาม → เกิน 7 วันต้องตัดสินใจ · Lost ต้องมีเหตุผลแบบโครงสร้าง', async () => {
  const docs2 = loadDocs(); const st2 = createStore(docs2, { devOpen: true });
  const c2 = (role, method, url, body, rep) => st2.handle({ role, rep, method, url, body, origin: 'http://t' });
  const q = () => okj(c2('sale', 'GET', '/api/sales-queue', null, 's1')).rows;
  /* Pricing: ยืนยันราคากลาง → บันทึกใบรายเจ้าของลูกค้า s1 หนึ่งเจ้า → ส่ง Sales = เข้าคิว "พร้อมส่ง" ของเซลล์ 1 (ก่อนหน้านั้นเป็น "รอ Pricing" ไม่ใช่งานเซลล์) */
  let dk = okj(c2('ops', 'GET', '/api/desk'));
  okj(c2('ops', 'POST', '/api/save-price-sheet', { customer_id: null, goal: 'target', rows: dk.rows.filter(r => r.cost > 0 && r.v21 && r.v21.goals).map(r => ({ product_id: r.id, price: Math.max(r.w2, r.v21.guard || 0), goal: 'target', exception: '' })) }));
  let pick = null, d2 = null, crow = [];
  for (const cand of q().filter(r => r.state === 'waiting_pricing')) { const dd = okj(c2('ops', 'GET', '/api/desk?customer=' + cand.id)); const cr = dd.rows.filter(r => r.cust && r.cust.source === 'สัญญา' && r.v21.goals); if (cr.length) { pick = cand; d2 = dd; crow = cr; break; } }
  assert.ok(pick && !pick.isSalesTask, 'มีลูกค้าสัญญาที่รอ Pricing');
  okj(c2('ops', 'POST', '/api/save-price-sheet', { customer_id: pick.id, goal: 'target', rows: crow.map(r => ({ product_id: r.id, price: Math.max(r.cust.price, r.v21.guard || 0), goal: 'target', exception: '' })) }));
  okj(c2('ops', 'POST', '/api/handoff', { customer_id: pick.id }));
  const ready = q().find(r => r.id === pick.id); assert.equal(ready.state, 'ready'); assert.equal(ready.priority, 3); assert.equal(ready.action.key, 'send');
  /* ผูก LINE แล้วสั่งส่ง → ยังไม่ใช่ "ส่งแล้ว" จนกว่าจะส่งสำเร็จ */
  okj(c2('sale', 'POST', '/api/customers/' + ready.id, { line_user_id: 'U-test-1' }, 's1'));
  okj(c2('sale', 'POST', '/api/line/send', { customer_id: ready.id, kind: 'quote' }, 's1'));
  assert.equal(q().find(r => r.id === ready.id).state, 'ready', 'เข้าคิวแล้วแต่ยังไม่ถึงลูกค้า');
  await st2.ext.drainOutbox(() => Promise.reject(new Error('LINE OA timeout')));
  let row = q().find(r => r.id === ready.id); assert.equal(row.state, 'ready'); assert.equal(row.lineStatus, 'queued');
  /* ล้มครบ 3 รอบ (ถอยหลัง 1/5/15 นาที) → send_failed = P1 งานเซลล์ + alert */
  for (let i = 0; i < 3; i++) { st2.docs.outbox.forEach(o => { o.next_try = null; }); await st2.ext.drainOutbox(() => Promise.reject(new Error('LINE OA timeout'))); }
  row = q().find(r => r.id === ready.id); assert.equal(row.state, 'send_failed'); assert.equal(row.priority, 1); assert.equal(row.action.key, 'resend');
  assert.ok(okj(c2('ops', 'GET', '/api/health')).alerts.some(a => /ส่ง LINE ไม่สำเร็จ/.test(a.title)));
  /* retry สำเร็จ → sent (Quote V1) + event quote-sent */
  okj(c2('ops', 'POST', '/api/line/retry', {})); await st2.ext.drainOutbox(() => Promise.resolve({ sent: true }));
  row = q().find(r => r.id === ready.id); assert.equal(row.state, 'sent'); assert.equal(row.quoteVersion, 1);
  assert.ok(okj(c2('ops', 'GET', '/api/events?customer=' + ready.id)).rows.some(e => e.action === 'quote-sent'));
  /* ลูกค้าเปิดใบ → รอลูกค้า (เห็นต่างจากยังไม่เปิด) · เงียบเกิน 48 ชม. → ต้องตาม · เกิน 7 วัน → ต้องตัดสินใจ */
  const sr = st2.docs.sends.customers.find(c => c.id === ready.id); sr.opened = sr.sentAt;
  assert.equal(q().find(r => r.id === ready.id).state, 'waiting_customer');
  const back = h => new Date(Date.now() - h * 36e5).toISOString().slice(0, 19); sr.sentAt = back(52); sr.opened = back(50);
  row = q().find(r => r.id === ready.id); assert.equal(row.state, 'followup_due'); assert.equal(row.priority, 2);
  const tick = st2.ext.followupTick(); assert.ok(tick.sent.some(n => n.indexOf(sr.name) === 0), 'ระบบส่ง LINE ตาม #1 ให้เอง');
  row = q().find(r => r.id === ready.id); assert.equal(row.reminders, 1); assert.ok(row.state !== 'followup_due', 'ตามแล้วกลับไปรอ');
  sr.sentAt = back(24 * 8); st2.docs.followups.forEach(f => { if (f.customer_id === ready.id) f.at = back(24 * 6); });
  row = q().find(r => r.id === ready.id); assert.equal(row.state, 'decide'); assert.equal(row.action.key, 'decide');
  /* Lost ต้องมีเหตุผลแบบโครงสร้าง · ปิดแล้วหลุดจากงานค้าง */
  assert.equal(c2('sale', 'POST', '/api/deal-close', { customer_id: ready.id, outcome: 'lost' }, 's1').status, 400);
  okj(c2('sale', 'POST', '/api/deal-close', { customer_id: ready.id, outcome: 'lost', reason_code: 'no_response' }, 's1'));
  row = q().find(r => r.id === ready.id); assert.equal(row.state, 'lost'); assert.equal(row.outcome.reasonCode, 'no_response'); assert.ok(!row.isSalesTask);
  /* ราคาต่อรองที่ Pricing ตัดสินแล้ว = P1 ส่งราคาใหม่ · มี round */
  const nego = q().find(r => r.state === 'revised_ready');
  if (nego) { assert.equal(nego.priority, 1); assert.equal(nego.action.key, 'send_revised'); assert.ok(nego.round >= 1); }
  const d = okj(c2('sale', 'GET', '/api/dashboard', null, 's1'));
  assert.ok(d.work.every(r => r.isSalesTask) && d.perf.lost >= 1 && d.closed.length >= 1);
  assert.ok(!/"cost"|"margin"|"gp"|"floor"/.test(JSON.stringify(d.work.concat(d.board))), 'คิวงานไม่มีทุน/margin/floor');
});

test('ส่งใบราคาเป็นลิงก์ ไม่ใช่เอกสาร: เซลล์ตรวจก่อนส่ง → LINE ส่งลิงก์ (ไม่มีราคาในข้อความ) → ลูกค้ารับ/ต่อรองในลิงก์ → Pricing ตอบในใบเดียวกัน → ยืนยันครบ → Won → ระบบขอ Quotation/Invoice ให้แอดมินเอง', async () => {
  const docs3 = loadDocs(); const st = createStore(docs3, { devOpen: true });
  const c3 = (role, method, url, body, rep) => st.handle({ role, rep, method, url, body, origin: 'http://t' });
  /* Pricing เตรียมใบของลูกค้า s1 หนึ่งเจ้า */
  let dk = okj(c3('ops', 'GET', '/api/desk'));
  okj(c3('ops', 'POST', '/api/save-price-sheet', { customer_id: null, goal: 'target', rows: dk.rows.filter(r => r.cost > 0 && r.v21 && r.v21.goals).map(r => ({ product_id: r.id, price: Math.max(r.w2, r.v21.guard || 0), goal: 'target', exception: '' })) }));
  let pick = null, crow = [];
  for (const cand of okj(c3('sale', 'GET', '/api/sales-queue', null, 's1')).rows.filter(r => r.state === 'waiting_pricing')) { const dd = okj(c3('ops', 'GET', '/api/desk?customer=' + cand.id)); const cr = dd.rows.filter(r => r.cust && r.cust.source === 'สัญญา' && r.v21.goals); if (cr.length >= 2) { pick = cand; crow = cr; break; } }
  okj(c3('ops', 'POST', '/api/save-price-sheet', { customer_id: pick.id, goal: 'target', rows: crow.map(r => ({ product_id: r.id, price: Math.max(r.cust.price, r.v21.guard || 0), goal: 'target', exception: '' })) }));
  okj(c3('ops', 'POST', '/api/handoff', { customer_id: pick.id }));
  /* เซลล์ตรวจก่อนส่ง: เห็นราคา/รอบก่อน/ธรรมชาติลูกค้า ไม่มีทุน */
  const rv = okj(c3('sale', 'GET', '/api/quote-review?customer=' + pick.id, null, 's1'));
  assert.equal(rv.rows.length, crow.length); assert.ok(rv.rows.every(r => 'flags' in r && 'risk' in r)); assert.ok(!/cost|margin|floor/.test(JSON.stringify(rv)));
  assert.equal(c3('sale', 'GET', '/api/quote-review?customer=' + pick.id, null, 's2').status, 403, 'เซลล์คนอื่นตรวจไม่ได้');
  /* ส่ง LINE = ลิงก์อย่างเดียว ไม่มีรายการราคาในข้อความ */
  okj(c3('sale', 'POST', '/api/customers/' + pick.id, { line_user_id: 'U-link' }, 's1'));
  okj(c3('sale', 'POST', '/api/line/send', { customer_id: pick.id, kind: 'quote' }, 's1'));
  const ob = okj(c3('ops', 'GET', '/api/outbox')).rows[0]; assert.ok(/\/q\//.test(ob.text), 'มีลิงก์'); assert.ok(!/฿\/กก\./.test(ob.text), 'ไม่มีราคารายบรรทัดในข้อความ');
  await st.ext.drainOutbox(() => Promise.resolve({ sent: true }));
  const token = ob.text.match(/\/q\/([A-Za-z0-9]+)/)[1];
  /* ลูกค้าเปิดลิงก์ → event quote-open · เห็นเฉพาะ customer-safe */
  const pq = st.publicQuote(token); assert.equal(pq.rows.length, crow.length); assert.ok(pq.version >= 1 && pq.summary && pq.validUntil); assert.ok(!/cost|margin|guard|floor/.test(JSON.stringify(pq)));
  assert.ok(okj(c3('ops', 'GET', '/api/events?customer=' + pick.id)).rows.some(e => e.action === 'quote-open' && e.kind === 'customer'));
  /* ลูกค้าขอต่อรอง 1 รายการในลิงก์ → คำขอวิ่งเข้า Pricing · Pricing อนุมัติ → ลิงก์แสดง "ราคาใหม่หลังต่อรอง" → ลูกค้ารับ */
  const r0 = pq.rows[0];
  okj(c3('anon', 'POST', '/api/public-quotes/' + token + '/respond', { product_id: r0.pid, kind: 'nego', want: r0.price - 3, reason: 'เจ้าอื่นถูกกว่า' }));
  assert.equal(st.publicQuote(token).rows[0].pending, true);
  const rq = okj(c3('ops', 'GET', '/api/price-requests')).rows.find(r => r.customer_id === pick.id && r.status === 'open'); assert.ok(rq && rq.round === 1);
  okj(c3('ops', 'POST', '/api/price-decide', { id: rq.id, approve: true, final_price: r0.price - 2, note: 'ok' }));
  const pq2 = st.publicQuote(token); assert.equal(pq2.rows[0].revised, true); assert.equal(pq2.rows[0].price, r0.price - 2);
  okj(c3('anon', 'POST', '/api/public-quotes/' + token + '/respond', { product_id: r0.pid, kind: 'accept' }));
  /* รับที่เหลือทั้งใบ → ตอบครบ → คิวเซลล์ = ตอบรับ รอปิดดีล (P1) */
  okj(c3('anon', 'POST', '/api/public-quotes/' + token + '/respond', { kind: 'accept', all: true }));
  const pq3 = st.publicQuote(token); assert.equal(pq3.summary.complete, true); assert.equal(pq3.summary.accepted, crow.length);
  const row = okj(c3('sale', 'GET', '/api/sales-queue', null, 's1')).rows.find(r => r.id === pick.id); assert.equal(row.state, 'accepted'); assert.equal(row.priority, 1);
  const ev = okj(c3('ops', 'GET', '/api/events?customer=' + pick.id)).rows.map(e => e.action);
  ['quote-sent', 'quote-open', 'negotiation-requested', 'quote-accepted'].forEach(a => assert.ok(ev.includes(a), 'timeline มี ' + a + ': ' + ev.join(',')));
  /* เซลล์ปิด Won ใส่ปริมาณ → ระบบสร้างคำขอเอกสารให้แอดมินเอง → ออก Quotation → Invoice (เข้า AR) */
  okj(c3('sale', 'POST', '/api/deal-close', { customer_id: pick.id, outcome: 'won', lines: crow.map(r => ({ pid: r.id, qty: 10 })) }, 's1'));
  let dq = okj(c3('ops', 'GET', '/api/doc-requests')); const dr = dq.rows.find(d => d.customer_id === pick.id); assert.ok(dr && dr.quotation.status === 'requested' && dr.lines.length === crow.length && dr.value > 0);
  assert.equal(okj(c3('sale', 'GET', '/api/doc-requests', null, 's2')).rows.length, 0, 'เซลล์อื่นไม่เห็นเอกสารของคนอื่น');
  assert.equal(c3('ops', 'POST', '/api/doc-requests/issue', { id: dr.id, kind: 'invoice', doc_no: 'INV-1' }).status, 400, 'ต้องออก Quotation ก่อน');
  okj(c3('ops', 'POST', '/api/doc-requests/issue', { id: dr.id, kind: 'quotation', doc_no: 'QT-2569-0001' }));
  okj(c3('ops', 'POST', '/api/doc-requests/issue', { id: dr.id, kind: 'invoice', doc_no: 'INV-2569-0001' }));
  dq = okj(c3('ops', 'GET', '/api/doc-requests')); assert.equal(dq.rows.find(d => d.id === dr.id).status, 'invoiced');
  assert.ok(okj(c3('ops', 'GET', '/api/invoices')).invoices.some(i => i.id === 'INV-2569-0001'), 'invoice เข้าระบบบัญชี');
  const closed = okj(c3('sale', 'GET', '/api/dashboard', null, 's1')).closed.find(r => r.id === pick.id); assert.equal(closed.outcome.docs.invoice, 'INV-2569-0001');
  assert.equal(c3('sale', 'POST', '/api/doc-requests/issue', { id: dr.id, kind: 'quotation', doc_no: 'x' }, 's1').status, 403, 'เซลล์ออกเอกสารเองไม่ได้');
});
