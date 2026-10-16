/* ประวัติราคาย้อนหลัง 6 รอบ (ไฟล์ mock_cost_price_market_FULL_items_6_rounds.xlsx → tools/import-cost-history.js)
   · นำเข้าครบทุก SKU ในใบ AL · ตัวเลข "ล่าสุด" ในไฟล์ = ที่ระบบถือ · การอ้างอิง (ช่วงทุน/เฉลี่ย/แนวโน้ม/หลุดช่วง) คิดถูก
   · ชุดนี้เป็นข้อมูลจำลอง → ติดป้ายทุก payload · ไม่ปนเข้า automation metrics / ตลาดแข่งขัน · เซลล์มองไม่เห็น (มีทุน) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { createStore } = require('../src/store');
function loadDocs() { const dir = path.join(__dirname, '..', 'data', 'fixtures'); const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); const d = {}; for (const k of Object.keys(idx)) d[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8')); return d; }
const docs = loadDocs(), store = createStore(docs, {}), S = docs.state;
const call = (role, method, url, body) => store.handle({ role, method, url, body, origin: 'http://t' });
const okj = (r, m) => { assert.equal(r.status, 200, (m || '') + ' → ' + JSON.stringify(r.body).slice(0, 300)); return r.body; };
const byIdx = n => S.products.find(p => p.pdf_idx === n);

test('นำเข้าครบ: 195 SKU ใบ AL × 6 รอบ · ติดป้าย mock · รอบปัจจุบัน (01-07/10) ยังเป็นหัวตาราง', () => {
  const PR = docs.price_rounds; assert.ok(PR && PR.source === 'mock' && /จำลอง/.test(PR.title));
  assert.equal(PR.rounds.length, 6); assert.deepEqual(PR.rounds.map(r => r.label), ['20-26/08', '27/08-02/09', '03-09/09', '10-16/09', '17-23/09', '24-30/09']);
  const al = S.products.filter(p => p.pdf_idx != null); assert.equal(al.length, 195);
  al.forEach(p => assert.equal((PR.sku[p.id] || []).length, 6, 'ครบ 6 รอบ: ' + p.name));
  assert.equal(docs.history[0].label, '01-07/10', 'รอบจริงล่าสุดต้องไม่ถูกไฟล์ประวัติแทนที่');
  assert.equal(docs.history.filter(h => h.mock).length, 6); docs.history.filter(h => h.mock).forEach(h => assert.match(h.label, /\*$/, 'รอบจำลองมี * ในชื่อทุกกราฟ'));
  assert.ok(PR.replaced.some(h => h.label === '26-2/09'), 'รอบจริงที่ทับช่วงเดียวกันถูกเก็บไว้ใน replaced ให้ดูย้อนได้');
  assert.equal(docs.market_obs.length, 0, 'ตลาดอ้างอิง (mock) ห้ามเข้าตาราง market_obs ที่ใช้คิดราคาแข่งขัน');
});

test('อ้างอิงราย SKU: แถว 45 สันนอกหมูบด = ทุน 6 รอบ 119–121 เฉลี่ย 120.2 · ตอนนี้ 120 ทรงตัว · จุดสุดท้าย = ใบ AL จริง', () => {
  const p = byIdx(45), h = okj(call('ops', 'GET', '/api/sku-history?id=' + p.id));
  assert.equal(h.points.length, 7); const last = h.points[6];
  assert.ok(last.current && !last.mock && last.label === '01-07/10' && last.cost === 120 && last.w2 === 135, JSON.stringify(last));
  assert.ok(h.points.slice(0, 6).every(x => x.mock && x.market > 0));
  assert.deepEqual([h.stats.lo, h.stats.hi, h.stats.avg, h.stats.now, h.stats.dir, h.stats.outOfRange], [119, 121, 120.2, 120, 'flat', false]);
  assert.match(h.stats.text, /ทุน 6 รอบก่อน 119–121/);
  /* หน้าต่างสินค้า (PX.product) ใช้ชุดเดียวกัน + ป้ายที่มา */
  const pv = okj(call('ops', 'GET', '/api/product?id=' + p.id)); assert.equal(pv.histMock, true); assert.equal(pv.hist.length, 7); assert.equal(pv.hist[6].price, 135); assert.equal(pv.hist[0].market, 152.12);
});

test('สรุปทุก SKU: ครอบคลุม 195 · แช่แข็ง 901–903 ประวัติไม่ต่อเนื่อง → หลุดช่วง (ระบบจับได้) · เซลล์ 403', () => {
  const a = okj(call('ops', 'GET', '/api/sku-history'));
  assert.equal(a.source, 'mock'); assert.equal(a.coverage.withHistory, 195); assert.equal(a.coverage.missing.length, S.products.length - 195, 'SKU เฉพาะลูกค้า (นอกใบ AL) ไม่มีประวัติ');
  assert.equal(a.outOfRangeN, 3); assert.deepEqual(a.outOfRange.map(x => x.name).sort(), ['สันคอหมูแช่แข็ง', 'สันนอกหมูแช่แข็ง', 'สามชั้นแผ่นติดหนังแช่แข็ง'].sort());
  assert.equal(a.dirs.up + a.dirs.down + a.dirs.flat, 195);
  assert.equal(call('sale', 'GET', '/api/sku-history').status, 403, 'มีทุน → เซลล์ห้ามเห็น');
  assert.equal(call('anon', 'GET', '/api/sku-history').status, 401);
});

test('ไม่ปนกับของจริง: mock ไม่นับเป็นผลงานระบบรับทุน · แต่ใช้เป็นช่วงประวัติตอนตรวจทุนแปลก', () => {
  assert.equal(okj(call('ops', 'GET', '/api/ai-perf')).cost.entries30, 0, 'cost_entries ที่ติดธง mock ไม่นับใน 30 วัน');
  const p = byIdx(45);   /* 120 → 90: −25% / −30 ฿ ยังไม่ถึงเกณฑ์กระโดด (30% / 40 ฿) แต่ต่ำกว่าช่วงประวัติ (6 รอบ 119–121 + ทุนก่อน 124 + ทุนนี้ 120) ×0.8 → ต้องเตือน history */
  const chk = okj(call('ops', 'POST', '/api/import/costs', { rows: [{ product_id: p.id, cost: 90 }], commit: false }));
  const f = chk.flags.find(x => x.name === p.name); assert.ok(f && f.checks.some(c => c.code === 'history' && /นอกช่วงประวัติทุน 119–124 ฿ \(8 ครั้งล่าสุด\)/.test(c.text)), JSON.stringify(chk.flags));
  assert.ok(!f.checks.some(c => c.code === 'jump'), 'ไม่ใช่เกณฑ์กระโดด — ด่านนี้จับได้เพราะมีประวัติ');
});
