/* ตรวจสอบย้อนกลับ: ตัวเลขที่หน้าตั้งราคาแสดง ต้องเท่ากับใบราคาขาย+ทุน AL 01-07/10/69 ของจริงทุกแถว
   (ทุนรอบก่อน · ทุน · ราคาส่ง 2kg รอบก่อน · ปลีก · 5kg · 10kg) และสูตรราคาต้องคิดจากตัวเลขเหล่านั้นตรงตาม V32
   ถ้าเทสต์นี้แดง = ข้อมูลที่โชว์ไม่ตรงไฟล์ ห้ามปล่อย */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createStore } = require('../src/store');
const AL = require('../public/alparse.js');

function loadDocs() {
  const dir = path.join(__dirname, '..', 'data', 'fixtures');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const docs = {};
  for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, idx[k]))).toString('utf8'));
  return docs;
}
const num = v => (v === '' || v == null ? null : Number(String(v).replace(/,/g, '')));

test('ข้อมูลบนหน้าตั้งราคา = ใบราคา AL ของจริง ทุกแถว (ทุนก่อน/ทุน/ส่ง 2kg/ปลีก/5kg/10kg) · สูตร Floor/Target/ปลีก ถูกทุกแถว', () => {
  const docs = loadDocs();
  const prods = {}; docs.state.products.forEach(p => { prods[p.id] = p; });
  const store = createStore(docs, {});
  const sheet = AL.parse(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'al-01-07-10-69-items.json'), 'utf8')));
  const al = {}; sheet.slice(1).forEach(r => { al[r[0]] = r; });
  const desk = store.handle({ role: 'ops', method: 'GET', url: '/api/desk', origin: 'http://t' }).body;
  assert.ok(desk.rows.length >= 195, 'AL 195 + SKU เฉพาะลูกค้า');
  const bad = [], math = [];
  desk.rows.forEach(r => {
    const p = prods[r.id];
    /* SKU เฉพาะลูกค้า (สร้างจากสินค้าฐานตอนนำเข้าใบราคาลูกค้า) ไม่อยู่ในใบ AL — ต้องบอกที่มาว่ามาจากสินค้าฐานตัวไหน */
    if (p.pdf_idx == null) { assert.ok(/สินค้าฐาน/.test(p.cost_src || ''), 'SKU นอกใบ AL ต้องระบุสินค้าฐาน: ' + r.name); return; }
    const a = al[p.pdf_idx];
    assert.ok(a, 'ทุกสินค้าต้องมีแถวในใบ AL: ' + r.name);
    const checks = [['ทุน', r.cost, num(a[6])], ['ทุนรอบก่อน', r.costPrev, num(a[5])], ['ส่ง 2kg รอบก่อน', r.prev, num(a[9])], ['ปลีก', r.retail, num(a[8])], ['5kg', num(a[9]) + (r.s5 - r.w2), num(a[10])], ['10kg', num(a[9]) + (r.s10 - r.w2), num(a[11])]];
    checks.forEach(([k, got, want]) => {
      if (want == null) return;   /* ส่วนแช่แข็ง (901–903) ใบไม่ระบุปลีก/5kg/10kg — ระบบคิดจากสูตรและบอกไว้ */
      if (Number(got) !== want) bad.push(p.pdf_idx + ' ' + r.name + ' · ' + k + ' ระบบ ' + got + ' ≠ ไฟล์ ' + want);
    });
    const v = r.v21 || {}, g = v.goals || {}, c = v.category;
    if (!c || !g.protect) return;
    const floor = Math.ceil(r.cost / (1 - c.floor / 100)), target = Math.max(Math.ceil(r.cost / (1 - c.target / 100)), floor);
    if (g.protect.price !== floor) math.push(p.pdf_idx + ' ป้องกันกำไร ' + g.protect.price + ' ≠ ' + floor);
    if (g.target.price !== target) math.push(p.pdf_idx + ' กำไรตามเป้า ' + g.target.price + ' ≠ ' + target);
    if (g.hold && Math.abs(g.hold.margin - Math.round((r.prev - r.cost) / r.prev * 1000) / 10) > 0.11) math.push(p.pdf_idx + ' margin ยืนราคาเดิม');
    if (!p.retail_override && r.retail !== Math.ceil(r.cost * 1.6 - 1e-9)) math.push(p.pdf_idx + ' ปลีก ≠ ⌈ทุน×1.6⌉');
  });
  assert.deepEqual(bad, [], 'ตัวเลขไม่ตรงไฟล์:\n' + bad.join('\n'));
  assert.deepEqual(math, [], 'สูตรผิด:\n' + math.join('\n'));
  /* ตัวอย่างที่ลูกค้าเช็ก: แถว 45 สันนอกหมูบด (1รอบ) = ทุนก่อน 124 · ทุน 120 · ส่ง 135 · ปลีก 192 · 132 · 131 */
  const r45 = desk.rows.find(r => prods[r.id].pdf_idx === 45);
  assert.deepEqual([r45.costPrev, r45.cost, r45.prev, r45.retail], [124, 120, 135, 192]);
  assert.equal(r45.v21.goals.hold.margin, 11.1); assert.equal(r45.v21.goals.protect.price, 137); assert.equal(r45.v21.goals.target.price, 142);
});
