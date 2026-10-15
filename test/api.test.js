/* ทดสอบ flow ครบวงผ่าน store โดยตรง (ไม่ต้องเปิดพอร์ต) + ทดสอบ server จริงเรื่อง cookie/หน้า/สิทธิ์
   node --test test/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const http = require('http');
const { createStore } = require('../src/store');

function loadDocs() {
  const dir = path.join(__dirname, '..', 'data', 'fixtures');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const docs = {};
  for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8'));
  return docs;
}
const docs = loadDocs();
const store = createStore(docs, {});
const call = (role, method, url, body) => store.handle({ role, method, url, body, origin: 'http://t' });
const okj = (r, msg) => { assert.equal(r.status, 200, (msg || '') + ' → ' + JSON.stringify(r.body).slice(0, 200)); return r.body; };

test('สิทธิ์: anon 401 · sale ไม่เห็นทุน · ops ไม่เห็นหน้าผู้บริหาร', () => {
  assert.equal(call('anon', 'GET', '/api/desk').status, 401);
  assert.equal(call('sale', 'GET', '/api/desk').status, 403);
  assert.equal(call('sale', 'GET', '/api/service-logs').status, 403);
  assert.equal(call('ops', 'GET', '/api/review').status, 403);
  const pl = okj(call('sale', 'GET', '/api/pricelist'));
  assert.equal(pl.seeCost, false); assert.equal(pl.rows[0].cost, undefined);
  const g = okj(call('sale', 'GET', '/api/guard'));
  assert.equal(g.forSale, true); assert.equal(g.lines, undefined);
  assert.equal(okj(call('ops', 'GET', '/api/pricelist')).rows[0].cost, 65);
  assert.equal(okj(call('boss', 'GET', '/api/me')).role, 'boss');
  assert.equal(call('anon', 'GET', '/api/me').body.role, null);
});

test('login: บทบาทที่รู้จักเท่านั้น · โหมดรหัสผ่าน', () => {
  assert.equal(call('anon', 'POST', '/api/login', { role: 'ops' }).session, 'ops');
  assert.equal(call('anon', 'POST', '/api/login', { role: 'hacker' }).status, 400);
  const s2 = createStore(loadDocs(), { pins: { ops: '1234' } });
  assert.equal(s2.handle({ role: 'anon', method: 'POST', url: '/api/login', body: { role: 'ops', pin: '0000' } }).status, 401);
  assert.equal(s2.handle({ role: 'anon', method: 'POST', url: '/api/login', body: { role: 'ops', pin: '1234' } }).session, 'ops');
  assert.equal(s2.handle({ role: 'anon', method: 'GET', url: '/api/me' }).body.needPin, true);
});

test('flow ครบวง: ราคากลาง → ใบรายเจ้า → ส่ง Sales → ลูกค้า → ต่อรอง → invoice → รับเงิน → ประกาศรอบ', () => {
  const CID = 'cd6f5';
  /* Step 1 ราคากลาง — ก่อนยืนยัน ใบรายเจ้ายังติด gate */
  let dk = okj(call('ops', 'GET', '/api/desk'));
  let c = dk.customers.find(x => x.id === CID);
  assert.equal(c.gateMissing, 78);
  const rows = dk.rows.filter(r => r.cost > 0 && r.v21 && r.v21.goals).map(r => ({ product_id: r.id, price: Math.max(r.w2, r.v21.guard || 0), goal: 'target', exception: '' }));
  const low = dk.rows.find(r => r.v21 && r.v21.guard > 0);
  const bad = call('ops', 'POST', '/api/save-price-sheet', { customer_id: null, goal: 'target', rows: [{ product_id: low.id, price: low.v21.guard - 5, goal: 'target', exception: '' }] });
  assert.equal(bad.status, 400); assert.ok(bad.body.problems.length, 'ต่ำกว่าขั้นต่ำโดยไม่มีเหตุผลต้องไม่ผ่าน');
  const s1 = okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: null, goal: 'target', rows }));
  assert.equal(s1.saved, rows.length);
  dk = okj(call('ops', 'GET', '/api/desk'));
  assert.equal(dk.centralCount.need, 0); assert.equal(dk.centralCount.approved, rows.length);
  c = dk.customers.find(x => x.id === CID); assert.equal(c.gateMissing, 0);

  /* Step 2 ใบรายเจ้า */
  let d2 = okj(call('ops', 'GET', '/api/desk?customer=' + CID));
  const crow = d2.rows.filter(r => r.cust && r.cust.source === 'สัญญา' && r.v21.goals);
  assert.ok(crow.every(r => r.v21.baseApproved === true), 'ฐานต้องยืนยันแล้ว');
  assert.equal(call('ops', 'POST', '/api/handoff', { customer_id: CID }).status, 400, 'ยังไม่บันทึกใบ ส่ง Sales ไม่ได้');
  const pay = crow.map(r => ({ product_id: r.id, price: Math.max(r.cust.price, r.v21.guard || 0), goal: 'target', exception: '' }));
  okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: CID, goal: 'target', rows: pay }));
  d2 = okj(call('ops', 'GET', '/api/desk?customer=' + CID));
  c = d2.customers.find(x => x.id === CID); assert.equal(c.priced, pay.length); assert.equal(c.work, 0);

  /* Step 3 ส่ง Sales */
  okj(call('ops', 'POST', '/api/handoff', { customer_id: CID, note: 'margin บาง' }));
  let sd = okj(call('sale', 'GET', '/api/sends'));
  let sc = sd.customers.find(x => x.id === CID); assert.ok(sc.handedAt); assert.equal(sc.offerLines, pay.length);
  let sh = okj(call('sale', 'GET', '/api/sheet?customer=' + CID));
  assert.equal(sh.offerTotal, pay.length); assert.ok(sh.handedAt);
  const q = okj(call('sale', 'GET', '/api/quote?customer=' + CID + '&tier=w2'));
  assert.ok(q.text.includes('SUKISHI')); assert.equal(q.count, pay.length);

  /* Step 4 เซลล์: ยืนยันราคา · ส่ง · ต่อรอง */
  const pid = sh.rows.find(r => r.inOffer).pid, offer = sh.rows.find(r => r.pid === pid).offer;
  assert.equal(call('sale', 'POST', '/api/quoted', { customer_id: CID, product_id: pid, price: offer - 10 }).status, 400, 'เซลล์แก้ราคาเองไม่ได้');
  okj(call('sale', 'POST', '/api/quoted', { customer_id: CID, product_id: pid, price: offer }));
  const link = okj(call('sale', 'POST', '/api/quote-links', { customer_id: CID }));
  assert.ok(/\/q\/[A-Za-z0-9]+$/.test(link.url));
  const pub = store.publicQuote(link.token);
  assert.equal(pub.customer, 'SUKISHI INTER'); assert.ok(!JSON.stringify(pub).includes('cost'), 'ลิงก์ลูกค้าห้ามมีทุน');
  okj(call('sale', 'POST', '/api/quote-sent', { customer_id: CID, channel: 'line-text', label: sh.label }));
  sd = okj(call('sale', 'GET', '/api/sends')); assert.equal(sd.sent, 1); assert.equal(sd.pending, sd.total - 1);
  const pid2 = sh.rows.filter(r => r.inOffer)[1].pid, offer2 = sh.rows.find(r => r.pid === pid2).offer;
  assert.equal(call('sale', 'POST', '/api/price-request', { customer_id: CID, product_id: pid2, want: offer2 + 5 }).status, 400, 'ขอราคาสูงกว่าที่เสนอไม่ใช่การต่อรอง');
  const rq = okj(call('sale', 'POST', '/api/price-request', { customer_id: CID, product_id: pid2, want: offer2 - 4, reason: 'เจ้าอื่นถูกกว่า' }));
  let pr = okj(call('ops', 'GET', '/api/price-requests'));
  assert.equal(pr.open, 1); const r0 = pr.rows.find(r => r.id === rq.id); assert.equal(r0.status, 'open'); assert.equal(r0.cust, 'SUKISHI INTER');

  /* Step 5 ops ตัดสิน — ต้องเห็นรุ่นล่าสุด */
  assert.equal(call('ops', 'POST', '/api/price-decide', { id: rq.id, approve: true, seen_rev: 99 }).status, 409);
  okj(call('ops', 'POST', '/api/price-decide', { id: rq.id, approve: true, seen_rev: r0.rev, final_price: offer2 - 2, note: 'ลดให้ 2' }));
  pr = okj(call('ops', 'GET', '/api/price-requests')); assert.equal(pr.open, 0);
  sh = okj(call('sale', 'GET', '/api/sheet?customer=' + CID));
  const row2 = sh.rows.find(r => r.pid === pid2); assert.equal(row2.offer, offer2 - 2); assert.equal(row2.request.status, 'ok');

  /* Step 6 ลูกค้าตอบ (ผ่านลิงก์ 1 รายการ + เซลล์บันทึกที่เหลือ) */
  okj(store.handle({ role: 'anon', method: 'POST', url: '/api/public-quotes/' + link.token + '/respond', body: { product_id: pid, kind: 'accept' } }));
  const acc = okj(call('sale', 'POST', '/api/quote-response', { customer_id: CID, kind: 'accept', all: true, label: sh.label }));
  assert.equal(acc.n, pay.length - 1);
  sh = okj(call('sale', 'GET', '/api/sheet?customer=' + CID));
  assert.equal(sh.deal.accepted, pay.length); assert.equal(sh.deal.ready, true);
  sc = okj(call('sale', 'GET', '/api/sends')).customers.find(x => x.id === CID); assert.equal(sc.accepted, pay.length);

  /* Step 7 invoice → ผู้บริหารเห็นยอดจริง → รับเงิน */
  const inv = okj(call('sale', 'POST', '/api/invoices', { customer_id: CID, invoice_no: 'IV-001', invoice_date: '2026-10-15', lines: [{ product_id: pid, qty_kg: 20 }, { product_id: pid2, qty_kg: 5 }] }));
  assert.equal(inv.total_kg, 25); assert.equal(inv.net_sales, 20 * offer + 5 * (offer2 - 2));
  assert.equal(call('sale', 'POST', '/api/invoices', { customer_id: CID, invoice_no: 'IV-001', invoice_date: '2026-10-15', lines: [{ product_id: pid, qty_kg: 1 }] }).status, 400, 'เลขซ้ำ');
  const act = okj(call('boss', 'GET', '/api/invoices')); assert.equal(act.ytd.invoices, 1); assert.equal(act.ytd.revenue, inv.net_sales);
  let ar = okj(call('boss', 'GET', '/api/ar')); assert.equal(ar.outstanding, inv.net_sales); assert.equal(ar.open.length, 1);
  okj(call('boss', 'POST', '/api/payments', { invoice_id: 'IV-001', amount: 1000, paid_on: '2026-10-15', ref: 'r1' }));
  okj(call('boss', 'POST', '/api/payments', { invoice_id: 'IV-001', amount: 1000, paid_on: '2026-10-15', ref: 'r1' }));   /* กดซ้ำ = รายการเดียว */
  ar = okj(call('boss', 'GET', '/api/ar')); assert.equal(ar.received, 1000); assert.equal(ar.outstanding, inv.net_sales - 1000);

  /* Step 8 ประกาศรอบใหม่ — ทุกเจ้ากลับเป็นยังไม่ส่ง */
  const dp = okj(call('boss', 'POST', '/api/dispatch', { label: 'ทดสอบ 1' }));
  assert.equal(dp.label, 'ทดสอบ 1');
  assert.equal(okj(call('ops', 'GET', '/api/history'))[0].label, 'ทดสอบ 1');
  sd = okj(call('sale', 'GET', '/api/sends')); assert.equal(sd.label, 'ทดสอบ 1'); assert.equal(sd.sent, 0);
  sh = okj(call('sale', 'GET', '/api/sheet?customer=' + CID)); assert.equal(sh.sent, false); assert.equal(sh.prevLabel, '26-2/09');
});

test('ทุน/ตลาด/เกณฑ์: แก้แล้วทุกหน้าเห็นตรงกัน', () => {
  const PID = 'p046e65';
  okj(call('ops', 'POST', '/api/costs', { items: [{ id: PID, cost: 70 }], source: 'ทดสอบ' }));
  const pl = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === PID);
  assert.equal(pl.cost, 70); assert.equal(pl.w2, 112, 'ตัวที่ตั้งด้วยสูตร ตามสูตร 70×1.6'); assert.equal(pl.costSrc, 'ทดสอบ');
  const bd = okj(call('ops', 'GET', '/api/board')).lines.find(l => l.id === PID); assert.equal(bd.cost, 70); assert.equal(bd.w2, 112);
  const dk = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === PID); assert.equal(dk.cost, 70); assert.equal(dk.v21.goals.target.price, Math.ceil(70 / 0.85));
  const pv = okj(call('ops', 'GET', '/api/product?id=' + PID)); assert.equal(pv.p.cost, 70); assert.ok(pv.hist.length >= 2);
  /* ตัวที่ไม่ได้ตั้งด้วยสูตร: ยืนราคา แต่ไม่ต่ำกว่าขั้นต่ำ */
  const man = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.cost > 0 && r.w2 !== Math.round(r.cost * 1.6));
  okj(call('ops', 'POST', '/api/costs', { items: [{ id: man.id, cost: man.cost + 1 }] }));
  const man2 = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === man.id); assert.ok(man2.w2 >= man.w2);
  const sh = okj(call('ops', 'POST', '/api/costs', { shift: 1 })); assert.ok(sh.shifted > 300); assert.equal(sh.nocost, 17);
  okj(call('ops', 'POST', '/api/products/' + PID, { vol_week: 2000 }));
  assert.equal(okj(call('ops', 'GET', '/api/board')).lines.find(l => l.id === PID).vol, 2000);
  const np = okj(call('ops', 'POST', '/api/products', { name: 'สินค้าทดสอบ', grp: 'อื่นๆ', cost: 100, add_baht: 20 }));
  const nr = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === np.id); assert.equal(nr.w2, 120);
  assert.ok(okj(call('ops', 'GET', '/api/desk?customer=cd6f5')).rows.find(r => r.id === np.id), 'สินค้าใหม่โผล่ในใบรายเจ้าด้วย');
  okj(call('ops', 'POST', '/api/competitor-prices', { items: [{ product_id: PID, competitor_id: 'a', price: 99 }] }));
  const m = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === PID).marks.find(x => x.id === 'a'); assert.equal(m.price, 99); assert.equal(m.state, 'fresh');
  assert.equal(okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === PID).v21.goals.competitive.disabled, undefined);
  assert.equal(call('ops', 'PUT', '/api/config', { floor_pct: 10 }).status, 400);
  okj(call('ops', 'PUT', '/api/config', { floor_pct: 13, haggle_baht: 3 }));
  assert.equal(okj(call('ops', 'GET', '/api/guard')).floorPct, 13); assert.equal(okj(call('ops', 'GET', '/api/pricelist')).haggle, 3);
  okj(call('ops', 'PUT', '/api/category-targets', { key: 'competitive', lo: 12, hi: 14, target: 14 }));
  assert.equal(okj(call('ops', 'GET', '/api/category-guard')).groups.find(g => g.key === 'competitive').effective, 14);
  assert.equal(okj(call('ops', 'GET', '/api/category-items?key=competitive')).items[0].catTarget, 14);
  const sk = okj(call('ops', 'POST', '/api/sku-category', { product_id: 'pc77af2', category_key: 'popular', target_pct: 22 })); assert.equal(sk.effective, 22);
  assert.ok(okj(call('ops', 'GET', '/api/category-items?key=popular')).items.find(i => i.id === 'pc77af2').moved);
  assert.ok(okj(call('ops', 'GET', '/api/data-audit')).master > 360);
});

test('ลูกค้า/สัญญา/ปรับทั้งใบ', () => {
  const nc = okj(call('ops', 'POST', '/api/customers', { name: 'ร้านทดสอบ', owner: 'เอ', type: 'contract', tier: 'w2' }));
  assert.equal(call('ops', 'POST', '/api/customers', { name: 'ร้านทดสอบ' }).status, 400);
  assert.equal(call('ops', 'POST', '/api/contract-price', { customer_id: nc.id, product_id: 'p046e65', price: 10 }).status, 400, 'ต่ำกว่าครึ่งทุน = พิมพ์ผิด');
  okj(call('ops', 'POST', '/api/contract-price', { customer_id: nc.id, product_id: 'p046e65', price: 100 }));
  const g = okj(call('ops', 'GET', '/api/guard'));
  const gc = g.customers.find(c => c.id === nc.id); assert.equal(gc.n, 1); assert.ok(['A', 'B', 'D'].includes(gc.grade));
  assert.ok(g.lines.find(l => l.cid === nc.id && l.locked === 100));
  const dk = okj(call('ops', 'GET', '/api/desk?customer=' + nc.id)); assert.equal(dk.customer.name, 'ร้านทดสอบ');
  assert.equal(dk.rows.find(r => r.id === 'p046e65').cust.source, 'สัญญา');
  assert.equal(okj(call('sale', 'GET', '/api/sheet?customer=' + nc.id)).total, 1);
  okj(call('ops', 'POST', '/api/customer-adjust', { customer_id: nc.id, adjust: -3 }));
  const d2 = okj(call('ops', 'GET', '/api/desk?customer=' + nc.id)); assert.equal(d2.customer.adjust, -3);
  const free = d2.rows.find(r => r.cust && r.cust.source !== 'สัญญา'); assert.equal(free.cust.price, free.w2 - 3);
  assert.equal(call('ops', 'POST', '/api/customer-adjust', { customer_id: nc.id, adjust: 40 }).status, 400);
});

test('บริการ/ขนส่ง/prospect/baseline/สมอง', () => {
  assert.equal(call('sale', 'POST', '/api/service-logs', { customer: 'ไม่มีชื่อนี้', type: 'อื่นๆ', detail: 'xxx' }).status, 400);
  assert.equal(call('sale', 'POST', '/api/service-logs', { customer: 'Bornga', type: 'ส่งช้า / ระยะเวลาส่ง', detail: 'สาย 40 นาที' }).status, 400, 'เรื่องขนส่งต้องบอกผู้ขนส่ง');
  const l = okj(call('sale', 'POST', '/api/service-logs', { customer: 'Bornga', type: 'ส่งช้า / ระยะเวลาส่ง', detail: 'สาย 40 นาที', carrier: 'รถบริษัท' }));
  assert.equal(okj(call('sale', 'GET', '/api/service-logs?customer=Bornga')).logs.length, 1);
  assert.equal(okj(call('boss', 'GET', '/api/service-logs')).open, 1);
  assert.equal(call('boss', 'POST', '/api/service-logs/update', { id: l.id, status: 'ปิดแล้ว' }).status, 400, 'ปิดต้องมีสาเหตุ+วิธีแก้');
  okj(call('boss', 'POST', '/api/service-logs/update', { id: l.id, status: 'ปิดแล้ว', root_cause: 'รถติด', action: 'ออกเร็วขึ้น' }));
  assert.equal(okj(call('boss', 'GET', '/api/service-logs')).open, 0);
  okj(call('sale', 'POST', '/api/deliveries', { delivered_on: '2026-10-15', round: 'เช้า', carrier: 'รถบริษัท', customer: 'Bornga', promised: '07:00', actual: '07:40', in_full: true }));
  const pend = okj(call('sale', 'POST', '/api/deliveries', { delivered_on: '2026-10-15', carrier: 'Lalamove', promised: '08:00' }));
  let dl = okj(call('boss', 'GET', '/api/deliveries'));
  assert.equal(dl.overall.total, 2); assert.equal(dl.pending.length, 1); assert.equal(dl.carriers.find(c => c.name === 'รถบริษัท').rounds[0].state, 'warn');
  okj(call('sale', 'POST', '/api/deliveries/update', { id: pend.id, actual: '08:05', in_full: false }));
  dl = okj(call('boss', 'GET', '/api/deliveries')); assert.equal(dl.pending.length, 0); assert.equal(dl.overall.inFull, 50);
  const imp = okj(call('boss', 'POST', '/api/deliveries', { commit: false, rows: [{ delivered_on: '14/10/2569', carrier: 'รถบริษัท', promised: '07:00', actual: '07:05', in_full: 'ครบ' }, { delivered_on: 'x', carrier: 'y', promised: '1' }] }));
  assert.equal(imp.ok, 1); assert.equal(imp.problemCount, 1);
  const p = okj(call('sale', 'POST', '/api/prospects', { name: 'ร้านใหม่', value_month: 50000, stage: 'new', last_contact: '2026-09-01' }));
  let pr = okj(call('boss', 'GET', '/api/prospects')); assert.equal(pr.summary.active, 1); assert.equal(pr.summary.idle, 1); assert.equal(pr.summary.pipeline, 50000);
  okj(call('sale', 'POST', '/api/prospects', { id: p.id, name: 'ร้านใหม่', value_month: 50000, stage: 'won', last_contact: '2026-10-15' }));
  pr = okj(call('boss', 'GET', '/api/prospects')); assert.equal(pr.summary.won, 1); assert.equal(pr.summary.active, 0);
  assert.equal(call('ops', 'POST', '/api/perf-baseline', { cost: 1 }).status, 403);
  okj(call('boss', 'POST', '/api/perf-baseline', { cost: 120, central: 180, guard: 60, sales: 240, loops: 5 }));
  okj(call('ops', 'POST', '/api/activity', { page: '/pricing', ms: 120000 }));
  const op = okj(call('boss', 'GET', '/api/ops-perf')); assert.equal(op.summary.totalBefore, 600); assert.ok(op.summary.steps.find(s => s.key === 'central').now >= 2);
  const say = okj(call('ops', 'POST', '/api/brain/say', { text: 'ติดอะไรอยู่' })); assert.ok(say.text.length > 10); assert.equal(okj(call('ops', 'GET', '/api/brain')).talk[0].said, 'ติดอะไรอยู่');
  const imp2 = okj(call('boss', 'POST', '/api/import/invoices', { commit: true, rows: [{ invoice_no: 'IV-IMP', date: '14/10/2569', customer: 'Bornga', product: 'มันแข็งหมู', kg: '10', price: '104', paid_amount: '500' }, { invoice_no: 'IV-X', date: '14/10/2569', customer: 'ใครไม่รู้', product: 'มันแข็งหมู', kg: '1' }] }));
  assert.equal(imp2.fresh, 1); assert.equal(imp2.problemCount, 1); assert.equal(imp2.net, 1040);
  assert.ok(okj(call('boss', 'GET', '/api/invoices')).invoices.find(i => i.id === 'IV-IMP'));
});

test('server จริง: cookie · redirect ตามบทบาท · หน้า · ลิงก์ลูกค้า', async () => {
  process.env.FH_JOURNAL = '0'; process.env.FH_PORT = '0';
  const { server } = require('../server');
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = 'http://127.0.0.1:' + port;
  const req = (method, p, body, cookie) => new Promise((resolve, reject) => {
    const r = http.request(base + p, { method, headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}) }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: s })); });
    r.on('error', reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
  try {
    let r = await req('GET', '/'); assert.equal(r.status, 302); assert.equal(r.headers.location, '/login');
    r = await req('POST', '/api/login', { role: 'boss' }); const ck = r.headers['set-cookie'][0].split(';')[0]; assert.ok(ck.startsWith('fh_role='));
    r = await req('GET', '/', null, ck); assert.equal(r.headers.location, '/exec');
    r = await req('GET', '/api/me', null, ck); assert.equal(JSON.parse(r.text).role, 'boss');
    r = await req('GET', '/api/me', null, 'fh_role=boss.forged'); assert.equal(JSON.parse(r.text).role, null, 'cookie ปลอมต้องไม่ผ่าน');
    r = await req('GET', '/price', null, ck); assert.equal(r.status, 200); assert.ok(r.text.includes('<title>'));
    r = await req('GET', '/exec.html', null, ck); assert.equal(r.status, 200);
    r = await req('GET', '/peach.js'); assert.ok(r.text.includes('window.__NAV'));
    r = await req('GET', '/q/nothing'); assert.equal(r.status, 200); assert.ok(r.text.includes('ใช้ไม่ได้แล้ว'));
    r = await req('GET', '/logout', null, ck); assert.equal(r.status, 302); assert.ok(r.headers['set-cookie'][0].includes('Max-Age=0'));
  } finally { server.close(); }
});
