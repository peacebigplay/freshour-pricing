#!/usr/bin/env node
/* สร้าง data/market-feed-sample.json — "ผลที่ connector ตลาดควรส่งเข้ามา" ใช้แทน feed จริงจนกว่าจะต่อ MARKET_FEED_URL
   รูปแบบ 1 แถว = 1 การเห็นราคา: {competitor, sku, price, unit, observed_at, source_url}
   ชื่อ sku ตั้งใจสะกดไม่เหมือนของเราบางตัว เพื่อทดสอบตัวจับคู่ · ราคา = ราคาตลาดใกล้เคียงของจริง + แนวโน้ม 28 วัน (สามชั้นขึ้น · กระดูกลง · อื่นทรงตัว)
   ⚠ ตัวเลขเป็นตัวอย่างเพื่อให้หน้าแนวโน้มมีอะไรให้ดู ไม่ใช่ราคาจริงของ Makro/Betagro */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const P = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data/fixtures/pricelist.json.gz'))));
const PICK = [
  ['p046e65', 'มันแข็งหมู'], ['pf1dbe4', 'หมูบด มัน 20%'], ['p42f0eb', 'สามชั้นตัดเส้น'], ['p4f0acc', 'คอหมูย่าง'], ['p21f85f', 'กระดูกอ่อนใบพาย'],
  ['pa7269e', 'มันแข็งหั่นเต๋า'], ['p747529', 'สะโพกหมูหั่นชิ้น'], ['p4ed65d', 'สามชั้นแผ่น'], ['p414d6a', 'คอหมูย่าง สันคอ'], ['p95dc55', 'ขาหลังเผาตัดคากิ'],
  ['p1f119b', 'สันคอหมู ก้อน'], ['p61a61a', 'หมูแดดเดียว'], ['p03f998', 'หมูสไลด์'], ['p5bb4e5', 'หมูบด มัน 30%'], ['p3067c3', 'สามชั้นลอกหนัง แผ่น'],
  ['p501cf3', 'Pork Chop Steak'], ['p538c3e', 'กระดูกซุปพิเศษ'], ['p3c47ff', 'หมูบด มัน 10%'], ['p9a0b7c', 'ไตหมู'], ['p35bd44', 'ตับหมูสไลด์'],
  ['p0a078a', 'สันนอกหั่นแกง'], ['p16bb93', 'สันนอกหมู'], ['pd91722', 'กระดูกซุป'], ['p90f6d4', 'ไส้ตัน'], ['p9be740', 'ตับหมู'],
  ['p733797', 'กระดูกอ่อนใบพาย'], ['p4a69d6', 'สามชั้นลอกหนัง สไลด์'], ['p690bec', 'สามชั้นหั่นเต๋า'], ['p2b1f9b', 'สันคอหมู แช่แข็ง'], ['p9c22b7', 'สันคอพันกลม']];
const TREND = { 'สามชั้น': 0.07, 'กระดูก': -0.06, 'สันคอ': 0.03, 'หมูบด': -0.02 };
const COMP = [{ id: 'a', label: 'Makro', tier: 'r', mult: 1.06, url: 'https://www.makro.pro/th/c/meat/pork' }, { id: 'b', label: 'Betagro', tier: 'w', mult: 0.98, url: 'https://www.betagro-food.com/product/pork-meat' }];
let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const rows = [], end = new Date('2026-10-15T00:00:00Z');
PICK.forEach(([pid, sku], i) => {
  const p = P.rows.find(r => r.id === pid); if (!p) return;
  const t = TREND[p.grp] || 0;
  COMP.forEach(c => {
    if (c.id === 'b' && i % 3 === 2) return;                                   /* Betagro ไม่มีทุกตัว */
    for (let d = 28; d >= 0; d -= (c.id === 'a' ? 1 : 2)) {
      if (rnd() < 0.12) continue;                                              /* บางวันดึงไม่ได้ */
      const day = new Date(end); day.setUTCDate(day.getUTCDate() - d);
      const prog = (28 - d) / 28, base = p.w2 * c.mult * (1 + (i % 5 - 2) * 0.015);
      const price = Math.round(base * (1 + t * prog) * (1 + (rnd() - 0.5) * 0.02));
      rows.push({ competitor: c.id, sku: sku + (c.id === 'a' ? ' (แพ็ค)' : ''), price, unit: 'บาท/กก.', observed_at: day.toISOString().slice(0, 10), source_url: c.url });
    }
  });
});
/* ของที่ตลาดมีแต่เรายังไม่มีในระบบ — ตัวจับคู่ต้องบอกว่า "จับไม่ได้" ไม่ใช่เดามั่ว */
['เบคอนรมควัน แพ็ค 1 กก.', 'หมูยอ', 'แฮมหมู สไลด์'].forEach((sku, i) => rows.push({ competitor: 'a', sku, price: 180 + i * 20, unit: 'บาท/กก.', observed_at: '2026-10-15', source_url: COMP[0].url }));
fs.writeFileSync(path.join(ROOT, 'data/market-feed-sample.json'), JSON.stringify({ note: 'ตัวอย่างผลจาก connector ตลาด (ไม่ใช่ราคาจริง) — ต่อ feed จริงผ่าน MARKET_FEED_URL', generated: new Date().toISOString(), rows }, null, 0));
console.log('rows', rows.length);
