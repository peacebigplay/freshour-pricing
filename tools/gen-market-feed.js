#!/usr/bin/env node
/* สร้าง data/market-feed-sample.json — "ผลที่ connector ตลาดควรส่งเข้ามา" ย้อนหลัง 1 ปี ใช้แทน feed จริงจนกว่าจะต่อ MARKET_FEED_URL
   1 แถว = 1 การเห็นราคา: {competitor, sku, price, unit, observed_at, source_url}
   · เลือก SKU จากใบราคา AL (ตัวขายเยอะ + กระจายทุกหมวด) ชื่อบางตัวตั้งใจสะกดต่าง เพื่อทดสอบตัวจับคู่
   · ราคา = ราคาตลาดใกล้เคียงของจริง × ฤดูกาล 12 เดือน (แพงช่วงปีใหม่/ตรุษจีน · ถูกกลางปี) + แนวโน้มรายหมวด + สัญญาณรบกวน
   ⚠ ตัวเลขเป็นตัวอย่างให้หน้าแนวโน้มมีอะไรให้ดู ไม่ใช่ราคาจริงของ Makro/Betagro */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fixtures/index.json'), 'utf8'));
const P = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data/fixtures', idx.pricelist))));
const B = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data/fixtures', idx.board))));
const vol = {}; B.lines.forEach(l => { vol[l.id] = l.vol || 0; });
/* เลือกต่อหมวด: สูงสุด 5 ตัวที่ขายเยอะ (ไม่เอาแพ็ค/แช่แข็ง — ตลาดค้าส่งไม่มีเทียบ) */
const byG = {}; P.rows.filter(r => r.cost > 0 && !/แพ็ค|แช่แข็ง|B2B/.test(r.grp)).forEach(r => { (byG[r.grp] = byG[r.grp] || []).push(r); });
const PICK = []; Object.keys(byG).forEach(g => { byG[g].sort((a, b) => (vol[b.id] || 0) - (vol[a.id] || 0)).slice(0, g === 'เครื่องใน' || g === 'ขา' ? 3 : 5).forEach(r => PICK.push(r)); });
/* แนวโน้มรายหมวดตลอดปี (% ต่อปี) + ฤดูกาล */
const TREND = { 'สามชั้น': 0.09, 'สันคอ': 0.05, 'คอหมูย่าง': 0.04, 'กระดูก': -0.08, 'หมูบด': -0.03, 'ซี่โครง': 0.02, 'เครื่องใน': -0.02, 'มัน': 0.0, 'ขา': 0.01 };
const season = (d) => { const m = d.getUTCMonth(); return 1 + 0.035 * Math.cos((m - 0.5) / 12 * 2 * Math.PI) + (m === 1 ? 0.02 : 0); };   /* สูงสุด ม.ค.–ก.พ. (ปีใหม่/ตรุษจีน) ต่ำสุด ก.ค.–ส.ค. */
const COMP = [{ id: 'a', label: 'Makro', tier: 'r', mult: 1.07, every: 7, url: 'https://www.makro.pro/th/c/meat/pork' }, { id: 'c', label: 'Makro B2B', tier: 'w', mult: 1.0, every: 30, url: '' }, { id: 'b', label: 'Betagro', tier: 'w', mult: 0.98, every: 14, url: 'https://www.betagro-food.com/product/pork-meat' }];
/* ชื่อที่ตลาดใช้ (ต่างจากเรา) */
const ALIAS = { 'มันแข็งหมู': 'มันแข็ง (แพ็ค)', 'สันคอหมู': 'สันคอหมู ก้อน', 'สามชั้นแผ่น': 'หมูสามชั้นแผ่น', 'สันนอกหมู': 'สันนอกหมู ก้อน', 'สะโพกหมู': 'สะโพกหมู ก้อน', 'กระดูกซุป': 'กระดูกซุปหมู', 'หมูบด มัน 20%': 'หมูบด 20%' };
let seed = 11; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const rows = [], END = new Date('2026-10-15T00:00:00Z'), DAYS = 365;
PICK.forEach((p, i) => {
  const t = TREND[p.grp] || 0, base0 = p.w2 * (1 + (i % 5 - 2) * 0.012);
  COMP.forEach(c => {
    if (c.id === 'c' && i % 2) return; if (c.id === 'b' && i % 3 === 2) return;
    for (let d = DAYS; d >= 0; d -= c.every) {
      if (rnd() < 0.1) continue;
      const day = new Date(END); day.setUTCDate(day.getUTCDate() - d);
      const prog = (DAYS - d) / DAYS, drift = 1 + t * prog - t * 0.5;   /* ปีที่แล้วต่ำกว่า/สูงกว่าปัจจุบันตามแนวโน้ม */
      const price = Math.round(base0 * c.mult * drift * season(day) * (1 + (rnd() - 0.5) * 0.025));
      rows.push({ competitor: c.id, sku: (ALIAS[p.name] || p.name) + (c.id === 'a' ? ' (แพ็ค)' : ''), price, unit: 'บาท/กก.', observed_at: day.toISOString().slice(0, 10), source_url: c.url });
    }
  });
});
['เบคอนรมควัน แพ็ค 1 กก.', 'หมูยอ', 'แฮมหมู สไลด์'].forEach((sku, i) => rows.push({ competitor: 'a', sku, price: 180 + i * 20, unit: 'บาท/กก.', observed_at: '2026-10-15', source_url: COMP[0].url }));
rows.sort((a, b) => a.observed_at < b.observed_at ? -1 : 1);
fs.writeFileSync(path.join(ROOT, 'data/market-feed-sample.json'), JSON.stringify({ note: 'ตัวอย่างผลจาก connector ตลาด ย้อนหลัง 1 ปี (ไม่ใช่ราคาจริง) — ต่อ feed จริงผ่าน MARKET_FEED_URL', generated: new Date().toISOString(), skus: PICK.length, rows }, null, 0));
console.log('skus', PICK.length, 'rows', rows.length, 'groups', Object.keys(byG).join(' · '));
