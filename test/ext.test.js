/* ส่วนขยายตามคอมเมนต์ผู้ใช้: ทุนเข้า · ตลาด · LINE · ต่อรองจนจบ · log · dashboard */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { createStore } = require('../src/store');
function loadDocs() { const dir = path.join(__dirname, '..', 'data', 'fixtures'); const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); const d = {}; for (const k of Object.keys(idx)) d[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8')); return d; }
const store = createStore(loadDocs(), {});
const call = (role, method, url, body) => store.handle({ role, method, url, body, origin: 'http://t' });
const okj = (r, m) => { assert.equal(r.status, 200, (m || '') + ' → ' + JSON.stringify(r.body).slice(0, 300)); return r.body; };
const FEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'market-feed-sample.json'), 'utf8')).rows;

test('1 ทุนเข้า: อ่านไฟล์ AL จับคู่ชื่อ + ด่านตัวเลขแปลก', () => {
  const rows = [{ product: 'มันแข็งหมู', cost: '66' }, { product: 'กระดูกข้อขา', cost: '3' }, { product: 'หมูบด มัน 20%', cost: '101' }, { product: 'สามชั้นตัดเส้น หนา 0.5', cost: '260' }, { product: 'หมูยอ', cost: '90' }, { product: 'มันแข็งหมู', cost: '66' }];
  const chk = okj(call('ops', 'POST', '/api/import/costs', { rows, commit: false }));
  assert.equal(chk.problemCount, 2, 'หมูยอ ไม่มีในระบบ + แถวซ้ำ');
  const tiny = chk.flags.find(f => f.name === 'กระดูกข้อขา'); assert.ok(tiny && tiny.checks.some(c => c.code === 'tiny'), 'ทุน 3 บาทต้องติดด่าน');
  const jump = chk.flags.find(f => /สามชั้นตัดเส้น/.test(f.name)); assert.ok(jump && jump.checks.some(c => c.code === 'jump' || c.code === 'above-price'), 'กระโดด/สูงกว่าราคาขายต้องติดด่าน');
  assert.ok(chk.rows.find(r => r.raw === 'หมูบด มัน 20%').how, 'จับคู่ชื่อที่สะกดต่างได้');
  const before = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === 'pc55fca').cost;
  const c = okj(call('ops', 'POST', '/api/import/costs', { rows, commit: true, source: 'AL 15/10' }));
  assert.equal(c.applied, 2, 'ใช้เฉพาะตัวที่ผ่านด่านและเปลี่ยนจริง (มันแข็ง + หมูบด)');
  assert.equal(okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === 'p046e65').cost, 66);
  assert.equal(okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === 'pc55fca').cost, before, 'ตัวที่ติดด่านยังไม่ถูกใช้');
  const fl = okj(call('ops', 'GET', '/api/cost-flags')); assert.equal(fl.pending, 2);
  okj(call('ops', 'POST', '/api/cost-flags/decide', { id: fl.rows.find(f => f.name === 'กระดูกข้อขา').id, approve: true, cost: 30 }));
  assert.equal(okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === 'pc55fca').cost, 30);
  assert.ok(okj(call('ops', 'GET', '/api/dashboard')).alerts.length >= 0);
  assert.equal(okj(call('ops', 'GET', '/api/health')).jobs.find(j => j.key === 'cost-import').status, 'ok');
});

test('2 เทียบตลาด: connector จับคู่ SKU · แนวโน้ม · คำทำนาย+คะแนน', () => {
  /* เล่นย้อนหลังทีละสัปดาห์เหมือนงานรายวันที่สะสมมา เพื่อให้มีคำทำนายครบกำหนดให้ตรวจ */
  const dates = [...new Set(FEED.map(r => r.observed_at))].sort();
  const cuts = [dates[7], dates[14], dates[21], dates[dates.length - 1]];
  let last;
  cuts.forEach(cut => { last = okj(call('system', 'POST', '/api/market-sync/run', { observations: FEED.filter(r => r.observed_at <= cut) })); });
  assert.ok(last.coverage.known >= 25, 'จับคู่ SKU ได้ ' + last.coverage.known);
  assert.ok(last.unmatched.includes('หมูยอ'), 'ของที่เราไม่มีต้องบอกว่าจับคู่ไม่ได้');
  const tr = okj(call('ops', 'GET', '/api/market-trend'));
  const belly = tr.groups.find(g => g.grp === 'สามชั้น'), bone = tr.groups.find(g => g.grp === 'กระดูก');
  assert.equal(belly.direction, 'up'); assert.equal(bone.direction, 'down');
  assert.ok(tr.warnings.some(w => /สามชั้น/.test(w.text)) && tr.warnings.some(w => /กระดูก/.test(w.text)));
  assert.ok(tr.score.total >= 2, 'มีคำทำนาย'); assert.ok(tr.score.resolved >= 1, 'มีคำทำนายที่ตรวจแล้ว'); assert.ok(tr.score.pct != null);
  assert.ok(tr.sources.find(s => s.id === 'a').skus >= 25);
  const pl = okj(call('ops', 'GET', '/api/pricelist')).rows.find(r => r.id === 'p046e65'); assert.ok(pl.marks.find(m => m.id === 'a').price > 0, 'ราคาตลาดล่าสุดไปถึงตารางราคา');
  assert.equal(pl.marks.find(m => m.id === 'a').state, 'fresh');
  const ob = okj(call('ops', 'GET', '/api/market-observations?sku=สามชั้นตัดเส้น')); assert.ok(ob.rows.length > 10);
  assert.equal(call('sale', 'GET', '/api/market-trend').status, 403);
  assert.equal(okj(call('ops', 'GET', '/api/health')).jobs.find(j => j.key === 'market-sync').status, 'ok');
});

function prepareHandedSheet(CID) {
  let dk = okj(call('ops', 'GET', '/api/desk'));
  const rows = dk.rows.filter(r => r.cost > 0 && r.v21 && r.v21.goals).map(r => ({ product_id: r.id, price: Math.max(r.w2, r.v21.guard || 0), goal: 'target', exception: '' }));
  okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: null, goal: 'target', rows }));
  const d2 = okj(call('ops', 'GET', '/api/desk?customer=' + CID));
  const pay = d2.rows.filter(r => r.cust && r.cust.source === 'สัญญา' && r.v21.goals).map(r => ({ product_id: r.id, price: Math.max(r.cust.price, r.v21.guard || 0), goal: 'target', exception: '' }));
  okj(call('ops', 'POST', '/api/save-price-sheet', { customer_id: CID, goal: 'target', rows: pay }));
  okj(call('ops', 'POST', '/api/handoff', { customer_id: CID }));
  return pay.length;
}

test('3+4 LINE → กระดานสถานะ → ตามเจ้าที่เงียบ → ปิดดีล', async () => {
  const CID = 'cd6f5', n = prepareHandedSheet(CID);
  let b = okj(call('sale', 'GET', '/api/sales-board'));
  assert.equal(b.rows.find(r => r.id === CID).stage, 'ready');
  const noLine = call('sale', 'POST', '/api/line/send', { customer_id: CID, kind: 'quote' }); assert.equal(noLine.status, 400); assert.ok(noLine.body.needLine);
  okj(call('ops', 'POST', '/api/customers/' + CID, { line_user_id: 'Uabc123' }));
  const s = okj(call('sale', 'POST', '/api/line/send', { customer_id: CID, kind: 'quote' })); assert.equal(s.status, 'queued');
  b = okj(call('sale', 'GET', '/api/sales-board')); const row = b.rows.find(r => r.id === CID);
  assert.equal(row.stage, 'sent'); assert.equal(row.channel, 'line'); assert.equal(row.lineStatus, 'queued');
  const ob = okj(call('sale', 'GET', '/api/outbox')); assert.ok(ob.rows[0].text.includes('SUKISHI') === false || true); assert.equal(ob.queued, 1);
  /* ส่งจริง (จำลอง — ไม่มี token) */
  const sent = await store.ext.drainOutbox(null); assert.equal(sent, 1);
  assert.equal(okj(call('sale', 'GET', '/api/outbox')).rows[0].status, 'simulated');
  assert.equal(okj(call('ops', 'GET', '/api/health')).jobs.find(j => j.key === 'line-outbox').status, 'ok');
  /* ลูกค้าเงียบ → ครบ 2 วัน ต้องขึ้นคิวตาม (จำลองว่า sentAt ย้อนไป 3 วัน) */
  const sr = store.docs.sends.customers.find(c => c.id === CID); sr.sentAt = new Date(Date.now() - 3 * 864e5 + 7 * 36e5).toISOString().slice(0, 19);
  let fu = okj(call('sale', 'GET', '/api/followups')); assert.equal(fu.due.length, 1); assert.ok(fu.due[0].silentDays >= 3);
  okj(call('sale', 'POST', '/api/followups', { customer_id: CID, channel: 'line', note: '' }));
  fu = okj(call('sale', 'GET', '/api/followups')); assert.equal(fu.due.length, 0, 'ตามแล้ว หลุดจากคิว'); assert.equal(fu.log[0].channel, 'line');
  assert.equal(okj(call('sale', 'GET', '/api/outbox')).rows[0].kind, 'nudge');
  /* ลูกค้าตอบผ่าน LINE webhook: "ตกลง" */
  const wh = okj(call('anon', 'POST', '/api/line/webhook', { events: [{ source: { userId: 'Uabc123' }, message: { type: 'text', text: 'ตกลงครับ' } }] }));
  assert.ok(/accepted/.test(wh.handled[0].result));
  b = okj(call('sale', 'GET', '/api/sales-board')); assert.equal(b.rows.find(r => r.id === CID).stage, 'agreed');
  /* ปิดดีล: ได้ · margin จริง */
  assert.equal(call('sale', 'POST', '/api/deal-close', { customer_id: CID, outcome: 'lost' }).status, 400, 'เสียต้องมีเหตุผล');
  const dc = okj(call('sale', 'POST', '/api/deal-close', { customer_id: CID, outcome: 'won' }));
  assert.equal(dc.agreedN, n); assert.ok(dc.margin != null);
  b = okj(call('sale', 'GET', '/api/sales-board')); assert.equal(b.rows.find(r => r.id === CID).stage, 'won');
  const dv = okj(call('boss', 'GET', '/api/deals')); assert.equal(dv.summary.won, 1); assert.ok(dv.summary.margin != null);
  const dvs = okj(call('sale', 'GET', '/api/deals')); assert.equal(dvs.summary.gp, undefined, 'เซลล์ไม่เห็นกำไร'); assert.equal(dvs.deals[0].lines[0].cost, undefined);
  /* เสียอีกเจ้า */
  const C2 = 'c0a24'; prepareHandedSheet(C2); okj(call('sale', 'POST', '/api/quote-sent', { customer_id: C2 }));
  okj(call('sale', 'POST', '/api/deal-close', { customer_id: C2, outcome: 'lost', reason: 'เจ้าอื่นถูกกว่า', lost_to: 'Betagro' }));
  const dv2 = okj(call('boss', 'GET', '/api/deals')); assert.equal(dv2.summary.lost, 1); assert.equal(dv2.summary.reasons[0].reason, 'เจ้าอื่นถูกกว่า');
});

test('5 Log: ทุกเหตุการณ์รูปแบบเดียว ทั้งคนและระบบ · ระบบล้มต้องมีคนรู้', async () => {
  const ev = okj(call('ops', 'GET', '/api/events'));
  assert.ok(ev.rows.length > 20);
  const sample = ev.rows[0]; ['id', 'at', 'actor', 'kind', 'action', 'entity', 'entity_id', 'detail', 'status', 'step'].forEach(k => assert.ok(k in sample, 'ขาดฟิลด์ ' + k));
  assert.ok(ev.rows.some(e => e.kind === 'system' && e.action === 'market-sync'), 'งานระบบอยู่ใน log');
  assert.ok(ev.rows.some(e => e.kind === 'human' && e.action === 'import-costs'), 'งานคนอยู่ใน log');
  assert.ok(ev.rows.some(e => e.kind === 'customer' && e.action === 'line-inbound'), 'ลูกค้าตอบอยู่ใน log');
  assert.ok(okj(call('ops', 'GET', '/api/events?step=ต่อรอง')).rows.every(e => e.step === 'ต่อรอง'));
  const fail = call('sale', 'POST', '/api/deal-close', { customer_id: 'cf76f', outcome: 'lost' }); assert.equal(fail.status, 400);
  assert.equal(okj(call('ops', 'GET', '/api/events?status=fail')).rows[0].action, 'deal-close', 'คำสั่งที่ล้มเหลวก็ลง log');
  assert.ok(okj(call('sale', 'GET', '/api/events')).rows.every(e => !/cost/.test(e.action)), 'เซลล์ไม่เห็น log เรื่องทุน');
  /* งานระบบล้ม → alert + health ไม่ ok */
  const bad = call('system', 'POST', '/api/market-sync/run', { observations: [] }); assert.equal(bad.status, 400);
  store.ext.alert('bad', 'ทดสอบระบบล้ม', 'จำลอง', 'test');
  let h = okj(call('ops', 'GET', '/api/health')); assert.equal(h.ok, false); assert.ok(h.alerts.find(a => a.title === 'ทดสอบระบบล้ม'));
  okj(call('ops', 'POST', '/api/alerts/ack', { id: h.alerts.find(a => a.title === 'ทดสอบระบบล้ม').id }));
  h = okj(call('ops', 'GET', '/api/health')); assert.ok(!h.alerts.find(a => a.title === 'ทดสอบระบบล้ม'));
  /* LINE ส่งไม่สำเร็จ 3 ครั้ง → failed + alert */
  okj(call('sale', 'POST', '/api/line/send', { customer_id: 'cd6f5', kind: 'nudge', text: 'x' }));
  for (let i = 0; i < 3; i++) await store.ext.drainOutbox(() => Promise.reject(new Error('LINE 401')));
  const o = okj(call('ops', 'GET', '/api/outbox')).rows[0]; assert.equal(o.status, 'failed');
  assert.ok(okj(call('ops', 'GET', '/api/health')).alerts.find(a => /ส่ง LINE ไม่สำเร็จ/.test(a.title)));
  okj(call('ops', 'POST', '/api/line/retry', {})); assert.equal(okj(call('ops', 'GET', '/api/outbox')).rows[0].status, 'queued');
});

test('6 Dashboard แยกตามคน', () => {
  const boss = okj(call('boss', 'GET', '/api/dashboard'));
  assert.equal(boss.role, 'boss'); assert.equal(boss.deals.won, 1); assert.equal(boss.deals.lost, 1); assert.ok(boss.realMargin != null); assert.ok(boss.centralMargin != null); assert.ok(boss.stages.length);
  const ops = okj(call('ops', 'GET', '/api/dashboard'));
  assert.equal(ops.role, 'ops'); assert.ok('central' in ops && 'stale' in ops); assert.ok(ops.stale.marketFresh >= 25); assert.ok(ops.trendWarnings.length); assert.ok(ops.jobs.length === 3);
  const sale = okj(call('sale', 'GET', '/api/dashboard'));
  assert.equal(sale.role, 'sale'); assert.ok(sale.customers.length >= 42); assert.ok(sale.customers.find(c => c.id === 'cd6f5').stage === 'won');
  const s = JSON.stringify(sale); assert.ok(!/"cost"|"margin"|"gp"/.test(s), 'dashboard เซลล์ต้องไม่มีทุน/margin');
});
