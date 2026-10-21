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
const store = createStore(docs, { devOpen: true });   /* devOpen = โหมดเครื่องพัฒนา เลือกบทบาทได้ · ของจริง server ตรวจบัญชีก่อน */
const call = (role, method, url, body) => store.handle({ role, method, url, body, origin: 'http://t' });
const PID = name => (docs.pricelist.rows.find(r => r.name === name) || {}).id;   /* fixture ตามใบราคา AL — อ้างด้วยชื่อ ไม่ใช่ id */
const MAN = PID('มันแข็งหมู'), BONE = PID('กระดูกข้อขา');
const okj = (r, msg) => { assert.equal(r.status, 200, (msg || '') + ' → ' + JSON.stringify(r.body).slice(0, 200)); return r.body; };

test('สิทธิ์: anon 401 · sale ไม่เห็นทุน · ops ไม่เห็นหน้าผู้บริหาร', () => {
  assert.equal(call('anon', 'GET', '/api/desk').status, 401);
  assert.equal(call('sale', 'GET', '/api/desk').status, 403);
  assert.equal(call('sale', 'GET', '/api/service-logs').status, 403);
  assert.equal(call('ops', 'GET', '/api/review').status, 403);
  const pl = okj(call('sale', 'GET', '/api/pricelist'));
  assert.equal(pl.seeCost, false); assert.equal(pl.rows[0].cost, undefined); assert.ok(pl.rows[0].retail > 0 && pl.rows[0].s10 > 0, 'เซลล์เห็นราคาปลีก/ส่งทุกระดับ');
  const g = okj(call('sale', 'GET', '/api/guard'));
  assert.equal(g.forSale, true); assert.equal(g.lines, undefined);
  assert.equal(okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === MAN).cost, 65);
  assert.equal(okj(call('boss', 'GET', '/api/me')).role, 'boss');
  assert.equal(call('anon', 'GET', '/api/me').body.role, null);
});

test('login: บทบาทที่รู้จักเท่านั้น · โหมดรหัสผ่าน', () => {
  assert.equal(call('anon', 'POST', '/api/login', { role: 'ops' }).session, 'ops');
  assert.equal(call('anon', 'POST', '/api/login', { role: 'hacker' }).status, 400);
  const s2 = createStore(loadDocs(), {});   /* ไม่ใช่เครื่องพัฒนา: store ไม่ให้เลือกบทบาทเอง — ต้องผ่านบัญชีที่ server (src/auth.js) */
  assert.equal(s2.handle({ role: 'anon', method: 'POST', url: '/api/login', body: { role: 'ops' } }).status, 503);
  assert.equal(s2.handle({ role: 'anon', method: 'GET', url: '/api/me' }).body.needPin, true);
  assert.equal(s2.handle({ role: 'anon', method: 'GET', url: '/api/reps' }).status, 401, 'รายชื่อเซลล์ไม่เปิดให้คนนอก');
});

test('flow ครบวง: ราคากลาง → ใบรายเจ้า → ส่ง Sales → ลูกค้า → ต่อรอง → invoice → รับเงิน → ประกาศรอบ', () => {
  const CID = 'cd6f5';
  /* Step 1 ราคากลาง — ก่อนยืนยัน ใบรายเจ้ายังติด gate */
  let dk = okj(call('ops', 'GET', '/api/desk'));
  let c = dk.customers.find(x => x.id === CID);
  assert.ok(c.gateMissing > 0 && c.gateMissing === c.lines, 'ทุกบรรทัดสัญญายังรอราคากลาง');
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
  sh = okj(call('sale', 'GET', '/api/sheet?customer=' + CID)); assert.equal(sh.sent, false); assert.equal(sh.prevLabel, '01-07/10');
});

test('ทุน/ตลาด/นโยบาย: แก้แล้วทุกหน้าเห็นตรงกัน · Target = ทุน ÷ (1 − Target%) ของกลุ่ม', () => {
  const PID0 = MAN;   /* มันแข็งหมู: ทุน 65 · ใบ AL 80 · กลุ่ม "มัน" policy ถอดจากใบ (target > min) */
  const pol = okj(call('ops', 'GET', '/api/policy')); const gm = pol.groups.find(g => g.grp === 'มัน'); assert.ok(gm.target > gm.min && gm.min >= 5, 'ทุกกลุ่มมี Target > Minimum');
  assert.ok(pol.groups.every(g => g.target > g.min)); assert.ok(pol.groups.length >= 15);
  const T0 = Math.ceil(65 / (1 - gm.target / 100)), W0 = Math.max(80, T0);
  const before = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === PID0);
  assert.deepEqual([before.retail, before.w2, before.s5, before.s10], [104, W0, W0 - 3, W0 - 4], 'ราคาเดิม ≥ Target → ยืนราคาใบ AL · ต่ำกว่า → ขยับขึ้น Target');
  const dk0 = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === PID0);
  assert.equal(dk0.v21.goals.target.price, T0); assert.equal(dk0.v21.goals.protect.price, Math.ceil(65 / (1 - gm.min / 100))); assert.equal(dk0.v21.guard, dk0.v21.goals.protect.price);
  assert.ok(dk0.v21.rec && dk0.v21.rec.why.length >= 4 && dk0.v21.rec.price === W0, 'ระบบอธิบายที่มาของราคาแนะนำได้');
  okj(call('ops', 'POST', '/api/costs', { items: [{ id: PID0, cost: 70 }], source: 'ทดสอบ' }));
  const pl = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === PID0);
  const T1 = Math.ceil(70 / (1 - gm.target / 100)), W1 = Math.max(80, T1);
  /* เทสต์ก่อนหน้าอนุมัติราคากลางไว้แล้ว (80) → ทุนเปลี่ยน: ราคาที่อนุมัติยังใช้อยู่ แต่สถานะต้องเป็น Pricing Review Required และระบบแนะนำใหม่ทันที */
  assert.equal(pl.cost, 70); assert.deepEqual([pl.retail, pl.w2, pl.s5, pl.s10], [112, W0, W0 - 3, W0 - 4], 'ราคาที่อนุมัติไม่เปลี่ยนเอง'); assert.equal(pl.costSrc, 'ทดสอบ'); assert.equal(pl.rec, W1, 'แนะนำใหม่ = Target ที่ทุนใหม่'); assert.equal(pl.centralState, 'margin_at_risk', 'ราคาที่อนุมัติ 80 ที่ทุน 70 = 12.5% ต่ำกว่า Minimum → Margin at Risk');
  const bd = okj(call('ops', 'GET', '/api/board')).lines.find(l => l.id === PID0); assert.equal(bd.cost, 70); assert.equal(bd.w2, W0);
  const dk = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === PID0); assert.equal(dk.cost, 70); assert.equal(dk.retail, 112); assert.equal(dk.v21.tiers.s10, W0 - 4); assert.equal(dk.v21.goals.target.price, T1); assert.equal(dk.v21.rec.price, W1); assert.equal(dk.v21.central.state, 'margin_at_risk');
  const pv = okj(call('ops', 'GET', '/api/product?id=' + PID0)); assert.equal(pv.p.cost, 70); assert.equal(pv.p.add, 15); assert.ok(pv.hist.length >= 1); assert.equal(pv.costMaster.current_cost, 70); assert.equal(pv.policy.target, gm.target);
  /* ตัวที่ใบตั้งปลีกเอง (override) คงค่า: กระดูกข้อขา ปลีก 24 · ส่ง 15 (ราคาเดิมสูงกว่า Target และไม่มีตลาดบอกว่าแพง → ยืนราคาเดิม) */
  const bone = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === BONE); assert.deepEqual([bone.retail, bone.w2], [24, 15]);
  const sh = okj(call('ops', 'POST', '/api/costs', { shift: 1 })); assert.ok(sh.shifted >= 195, 'AL 195 + SKU เฉพาะลูกค้า'); assert.equal(sh.nocost, 0);
  okj(call('ops', 'POST', '/api/products/' + PID0, { vol_week: 2000 }));
  assert.equal(okj(call('ops', 'GET', '/api/board')).lines.find(l => l.id === PID0).vol, 2000);
  const np = okj(call('ops', 'POST', '/api/products', { name: 'สินค้าทดสอบ', grp: 'อื่นๆ', cost: 100, add_baht: 20 }));
  const nr = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === np.id); assert.ok(nr.w2 >= 120); assert.equal(nr.retail, 160); assert.equal(nr.s10, nr.w2 - 4);
  assert.ok(okj(call('ops', 'GET', '/api/desk?customer=cd6f5')).rows.find(r => r.id === np.id), 'สินค้าใหม่โผล่ในใบรายเจ้าด้วย');
  /* ตลาด: ราคาปลีก (Makro หน้าร้าน) ไม่ใช้เทียบราคาส่ง · ราคาส่ง (Makro B2B) ใช้ → Competitive = ถูกสุด − 1 */
  okj(call('ops', 'POST', '/api/competitor-prices', { items: [{ product_id: PID0, competitor_id: 'a', price: 150 }] }));
  assert.equal(okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === PID0).v21.goals.competitive.disabled, true);
  okj(call('ops', 'POST', '/api/competitor-prices', { items: [{ product_id: PID0, competitor_id: 'c', price: 99 }] }));
  const m = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === PID0).marks.find(x => x.id === 'c'); assert.equal(m.price, 99); assert.equal(m.state, 'fresh');
  const gc = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === PID0).v21; assert.equal(gc.goals.competitive.price, 99, 'แข่งขันได้ = ราคาตลาดตรงๆ ไม่บวกไม่ลบ'); assert.equal(gc.market.freshness, 'fresh');
  assert.equal(call('ops', 'PUT', '/api/config', { floor_pct: 10 }).status, 400);
  okj(call('ops', 'PUT', '/api/config', { floor_pct: 13, haggle_baht: 3 }));
  assert.equal(okj(call('ops', 'GET', '/api/guard')).floorPct, 13); assert.equal(okj(call('ops', 'GET', '/api/pricelist')).haggle, 3);
  /* Policy Change: แก้ Target กลุ่ม "มัน" → ทุก SKU ในกลุ่ม mark Pricing Policy Changed + Target ใหม่ทันที · ไม่ต้องแก้ทีละตัว */
  assert.equal(call('ops', 'PUT', '/api/category-targets', { key: 'competitive', lo: 12, hi: 14, target: 14 }).status, 410, 'เป้าหมวดเดิมเลิกใช้ → /api/policy');
  const pu = okj(call('ops', 'POST', '/api/policy', { grp: 'มัน', target: gm.target + 2, min: gm.min, reason: 'ทดสอบนโยบาย' })); assert.equal(pu.changed, 7); assert.equal(pu.version, pol.version + 1);
  const dk2 = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === PID0); assert.equal(dk2.v21.goals.target.price, Math.ceil(71 / (1 - (gm.target + 2) / 100))); assert.ok(dk2.v21.policyChanged, 'SKU ในกลุ่มถูก mark Pricing Policy Changed');
  assert.equal(call('ops', 'POST', '/api/policy', { grp: 'มัน', target: 10, min: 12 }).status, 400, 'Target ต่ำกว่า Minimum ไม่ได้');
  assert.equal(okj(call('ops', 'GET', '/api/policy')).log[0].grp, 'มัน');
  assert.ok(okj(call('ops', 'GET', '/api/data-audit')).master >= 196, 'สินค้า = ใบราคา AL 192 + แช่แข็ง 3 + SKU เฉพาะลูกค้า + ที่เพิ่มในเทสต์ 1');
});

test('ลูกค้า/สัญญา/ปรับทั้งใบ', () => {
  const nc = okj(call('ops', 'POST', '/api/customers', { name: 'ร้านทดสอบ', owner: 'เอ', type: 'contract', tier: 'w2' }));
  assert.equal(call('ops', 'POST', '/api/customers', { name: 'ร้านทดสอบ' }).status, 400);
  assert.equal(call('ops', 'POST', '/api/contract-price', { customer_id: nc.id, product_id: MAN, price: 10 }).status, 400, 'ต่ำกว่าครึ่งทุน = พิมพ์ผิด');
  okj(call('ops', 'POST', '/api/contract-price', { customer_id: nc.id, product_id: MAN, price: 100 }));
  const g = okj(call('ops', 'GET', '/api/guard'));
  const gc = g.customers.find(c => c.id === nc.id); assert.equal(gc.n, 1); assert.ok(['A', 'B', 'D'].includes(gc.grade));
  assert.ok(g.lines.find(l => l.cid === nc.id && l.locked === 100));
  const dk = okj(call('ops', 'GET', '/api/desk?customer=' + nc.id)); assert.equal(dk.customer.name, 'ร้านทดสอบ');
  assert.equal(dk.rows.find(r => r.id === MAN).cust.source, 'สัญญา');
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
  process.env.FH_JOURNAL = '0'; process.env.FH_PORT = '0'; process.env.FH_JOBS = '0'; process.env.FH_DEV_OPEN = '1';
  process.env.FH_VAR_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fh-var-'));
  const { server } = require('../server');
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = 'http://127.0.0.1:' + port;
  const req = (method, p, body, cookie) => new Promise((resolve, reject) => {
    const r = http.request(base + p, { method, headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}) }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: s })); });
    r.on('error', reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
  try {
    let r = await req('GET', '/'); assert.equal(r.status, 302); assert.equal(r.headers.location, '/login');
    r = await req('POST', '/api/login', { role: 'boss' }); const ck = r.headers['set-cookie'][0].split(';')[0]; assert.ok(ck.startsWith('fh_sid='));
    r = await req('GET', '/', null, ck); assert.equal(r.headers.location, '/exec');
    r = await req('GET', '/api/me', null, ck); assert.equal(JSON.parse(r.text).role, 'boss');
    r = await req('GET', '/api/me', null, 'fh_sid=forgedforgedforged'); assert.equal(JSON.parse(r.text).role, null, 'cookie ปลอมต้องไม่ผ่าน');
    r = await req('GET', '/healthz'); assert.equal(r.status, 200);
    r = await req('GET', '/price', null, ck); assert.equal(r.status, 200); assert.ok(r.text.includes('<title>'));
    r = await req('GET', '/exec.html', null, ck); assert.equal(r.status, 200);
    r = await req('GET', '/peach.js'); assert.ok(r.text.includes('window.__NAV'));
    r = await req('GET', '/q/nothing'); assert.equal(r.status, 200); assert.ok(r.text.includes('ใช้ไม่ได้แล้ว'));
    r = await req('GET', '/logout', null, ck); assert.equal(r.status, 302); assert.ok(r.headers['set-cookie'][0].includes('Max-Age=0'));
  } finally { server.close(); }
});

test('Pricing: Approved Central Price มี version · Cost Change Impact → Pricing Review Required / Margin at Risk · ต่ำกว่า Minimum = block', () => {
  const P = PID('สันคอหมู');
  const dk = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === P), v = JSON.parse(JSON.stringify(dk.v21)), M = v.goals.protect.price;   /* snapshot — store คืน object จริง เปลี่ยนตามเมื่อคิดใหม่ */
  assert.equal(call('ops', 'POST', '/api/save-price-sheet', { customer_id: null, rows: [{ product_id: P, price: M - 1 }] }).status, 400, 'ต่ำกว่า Minimum โดยไม่มีเหตุผล = block');
  okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: null, rows: [{ product_id: P, price: v.rec.price }] }));
  let c = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === P).v21.central; assert.equal(c.state, 'approved'); assert.equal(c.recommended, v.rec.price); assert.ok(c.version >= 1); assert.equal(c.target, v.policy.target);
  const v1 = c.version, vs = okj(call('ops', 'GET', '/api/price-versions?id=' + P)).rows; assert.ok(vs.length >= 1); assert.equal(vs[0].approved_price, v.rec.price); assert.equal(vs[0].approved_by, 'ops');
  const c0 = v.rec.cost || dk.cost, step1 = Math.round(c0 * 1.03);   /* +3% → Auto Pass */
  okj(call('ops', 'POST', '/api/costs', { items: [{ id: P, cost: step1 }], source: 'ทดสอบ' }));
  c = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === P).v21.central; assert.equal(c.state, 'review_required', 'ทุนเปลี่ยน → ไม่ปล่อยให้ Approved'); assert.ok(c.impact.margin_after < c.impact.margin_before);
  assert.equal(okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === P).w2, v.rec.price, 'ราคาที่อนุมัติยังใช้อยู่จนกว่าจะยืนยันใหม่');
  const step2 = Math.round(v.rec.price * (1 - v.policy.min / 100)) + 1;   /* ทำให้ margin ต่ำกว่า Minimum */
  okj(call('ops', 'POST', '/api/costs', { items: [{ id: P, cost: step2 }], source: 'ทดสอบ' }));
  c = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === P).v21.central;
  if (c.state !== 'margin_at_risk') { const f = okj(call('ops', 'GET', '/api/cost-flags')).rows.find(x => x.status === 'pending' && x.product_id === P); okj(call('ops', 'POST', '/api/cost-flags/decide', { id: f.id, action: 'confirm' })); c = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === P).v21.central; }
  assert.equal(c.state, 'margin_at_risk');
  const rec2 = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === P).v21.rec; assert.ok(rec2.price > v.rec.price, 'แนะนำใหม่ขยับขึ้นตามทุน');
  okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: null, rows: [{ product_id: P, price: rec2.price }] }));
  c = okj(call('ops', 'GET', '/api/desk')).rows.find(r => r.id === P).v21.central; assert.equal(c.state, 'approved'); assert.equal(c.version, v1 + 1, 'เก็บ version ไม่ทับของเดิม');
  assert.equal(okj(call('ops', 'GET', '/api/price-versions?id=' + P)).rows.length, vs.length + 1);
  const cc = okj(call('ops', 'GET', '/api/desk')).centralCount; ['review_required', 'margin_at_risk', 'policy_changed', 'waiting'].forEach(k => assert.ok(k in cc));
  /* ราคารายเจ้าเริ่มจากราคากลาง · ต่ำกว่าเป้าได้ (มีเหตุผล) · ต่ำกว่า Minimum ต้องมี exception */
  const CID = okj(call('ops', 'GET', '/api/customers')).customers.find(x => x.n > 0).id;
  const cd = okj(call('ops', 'GET', '/api/desk?customer=' + CID)).rows.find(r => r.id === P); assert.equal(cd.v21.base, rec2.price);
  const sv = okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: CID, rows: [{ product_id: P, price: rec2.price - 2 }] }));
  const saved = okj(call('ops', 'GET', '/api/desk?customer=' + CID)).rows.find(r => r.id === P).v21.saved; assert.equal(saved.delta, -2); assert.ok(saved.state && saved.margin != null);
  assert.ok(okj(call('ops', 'GET', '/api/price-versions?customer=' + CID)).rows.some(x => x.kind === 'customer' && x.product_id === P));
});

test('V32 สูตร 4 Goal (ฟังก์ชันเดียวใน backend) — ตัวอย่าง A/B จากสเปกต้องตรงเป๊ะ · ไม่มี Goal ไหนตกไปใช้ค่าอื่นเงียบๆ', () => {
  const g = store.goalsFor;
  /* A: ขาหมูเยอรมัน ทุน 92 ราคาเดิม 108 Floor 15 Target 20 ไม่มีตลาด */
  const A = g({ cost: 92, prev: 108, floor: 15, target: 20, market: [] });
  assert.equal(A.hold.price, 108); assert.equal(A.hold.margin, 14.8); assert.equal(A.hold.flag, 'below_floor', 'ยืนราคาเดิมแค่ติดธง ไม่ปรับเอง');
  assert.equal(A.protect.price, 109); assert.equal(A.protect.margin, 15.6);
  assert.equal(A.target.price, 115); assert.equal(A.target.margin, 20);
  assert.equal(A.competitive.disabled, true); assert.equal(A.competitive.reason, 'ไม่มีข้อมูลตลาด');
  /* B: ทุน 117 ราคาเดิม 121 Floor 12 Target 15 */
  const B = g({ cost: 117, prev: 121, floor: 12, target: 15, market: [] });
  assert.deepEqual([B.hold.price, B.hold.margin, B.hold.flag], [121, 3.3, 'below_floor'], 'ห้ามปรับ 121 เป็น 133 เอง');
  assert.deepEqual([B.protect.price, B.protect.margin], [133, 12]); assert.deepEqual([B.target.price, B.target.margin], [138, 15.2]);
  /* แข่งขันได้ = ราคาตลาดตรงๆ · ต่ำกว่า Floor = ธงแดง ไม่ใช้ Floor แทน · เก่าเกิน 7 วัน = ปิดปุ่มบอกเหตุผล */
  const C = g({ cost: 150, prev: 178, floor: 12, target: 15, market: [{ label: 'Betagro', price: 165, age: 2 }, { label: 'B2B', price: 182, age: 20 }] });
  assert.equal(C.competitive.price, 165); assert.equal(C.competitive.flag, 'below_floor'); assert.equal(C.protect.price, 171);
  const D = g({ cost: 150, prev: 0, floor: 12, target: 15, market: [{ label: 'B2B', price: 182, age: 20 }] });
  assert.equal(D.competitive.disabled, true); assert.match(D.competitive.reason, /เก่า 20 วัน/); assert.equal(D.hold.disabled, true);
  /* Target = Floor → กำไรตามเป้า = ป้องกันกำไร (sameAs) · ทุกค่าเท่ากัน → หน้าเว็บโชว์ปุ่มเดียว */
  const E = g({ cost: 150, prev: 171, floor: 12, target: 12, market: [{ label: 'B2B', price: 171, age: 1 }] });
  assert.deepEqual(E.same[171].sort(), ['competitive', 'hold', 'protect', 'target']); assert.ok(E.target.equalProtect);
  /* ราคาปลีก Makro (tier r) ไม่ใช้เทียบราคาส่ง */
  const F = g({ cost: 150, prev: 0, floor: 12, target: 15, market: [{ label: 'Makro', price: 250, age: 1, tier: 'r' }] });
  assert.equal(F.competitive.disabled, true);
});

test('V32 แจ้งเตือนต่อรอง: trigger ลูกค้าต่อรอง → แบนเนอร์ทั้งเซลและตั้งราคา → ตัดสิน → ส่งใบแก้ไข = ปิดเรื่อง · ค้าง 7 วันเตือนซ้ำ', () => {
  const before = okj(call('sale', 'GET', '/api/negotiations'));
  assert.ok(before.items.every(i => !('cost' in i)), 'เซลล์ไม่เห็นทุน');
  /* เลือกเจ้าที่มีบรรทัดสัญญาซึ่งราคาเหนือทุนพอให้ต่อรองได้ (ลูกค้าที่นำเข้าใหม่บางเจ้าราคาชิดทุน) */
  let CID = null, dkc = null;
  for (const cc of okj(call('ops', 'GET', '/api/customers')).customers.filter(c => c.n > 0)) { const r0 = okj(call('ops', 'GET', '/api/desk?customer=' + cc.id)).rows.find(r => r.cust && r.cust.source === 'สัญญา' && r.cust.price > r.cost + 20); if (r0) { CID = cc.id; dkc = r0; break; } }
  assert.ok(dkc, 'มีลูกค้าที่ต่อรองได้');
  const sh = okj(call('sale', 'GET', '/api/sheet?customer=' + CID)); const row = sh.rows.find(r => r.pid === dkc.id);
  const rq = okj(call('sale', 'POST', '/api/price-request', { customer_id: CID, product_id: row.pid, want: row.board - 5, reason: 'เจ้าอื่นถูกกว่า' }));
  let n = okj(call('ops', 'GET', '/api/negotiations')); const it = n.items.find(i => i.id === rq.id);
  assert.equal(it.stage, 'new'); assert.equal(it.offered, row.board); assert.equal(it.want, row.board - 5);
  assert.ok(okj(call('ops', 'GET', '/api/health')).alerts.some(a => /ลูกค้าต่อรองกลับ/.test(a.title)), 'คนตั้งราคาได้ alert');
  okj(call('ops', 'POST', '/api/price-requests/status', { id: rq.id, status: 'supplier' }));
  assert.equal(okj(call('ops', 'GET', '/api/negotiations')).items.find(i => i.id === rq.id).stage, 'supplier');
  okj(call('ops', 'POST', '/api/price-decide', { id: rq.id, approve: true, final_price: row.board - 3, seen_rev: 1 }));
  n = okj(call('sale', 'GET', '/api/negotiations')); assert.equal(n.items.find(i => i.id === rq.id).stage, 'decided', 'ตัดสินแล้วแต่ยังไม่ส่งใบ = ยังค้าง');
  okj(call('sale', 'POST', '/api/quote-sent', { customer_id: CID }));
  n = okj(call('sale', 'GET', '/api/negotiations')); assert.ok(!n.items.find(i => i.id === rq.id), 'ส่งใบราคาแก้ไขแล้ว → เรื่องปิด แบนเนอร์หาย');
  assert.equal(before.staleDays, 7); assert.ok(okj(call('ops', 'GET', '/api/negotiations')).items.every(i => i.stale === (i.age >= 7)), 'ค้างเกิน 7 วันไม่มีความเคลื่อนไหว → ติดธงเตือนซ้ำ');
  const rq2 = okj(call('sale', 'POST', '/api/price-request', { customer_id: CID, product_id: row.pid, want: row.board - 6, reason: 'ขออีก' }));
  okj(call('ops', 'POST', '/api/price-requests/status', { id: rq2.id, status: 'cancelled', note: 'ลูกค้ายกเลิก' }));
  assert.ok(!okj(call('ops', 'GET', '/api/negotiations')).items.find(i => i.id === rq2.id), 'ลูกค้ายกเลิก = ปิดเรื่องด้วยเหตุผล');
});
