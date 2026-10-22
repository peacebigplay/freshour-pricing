#!/usr/bin/env node
/* เตรียมข้อมูลตั้งต้นก่อน go-live — แก้ fixtures ใน data/fixtures (ทำครั้งเดียว · สำรองไว้ก่อนด้วย git)

   node tools/prep-prod.js --strip-mock            ลบประวัติทุน/ราคา 6 รอบจำลอง (price_rounds · cost_entries mock · history แถว *)
   node tools/prep-prod.js --dedupe-events         ไล่เลข id เหตุการณ์ที่ซ้ำกัน (บั๊กเก่า seq เริ่ม 0) ให้ไม่ซ้ำ
   node tools/prep-prod.js --owners owners.csv     แจกลูกค้าให้เซลล์จริงจากไฟล์ (คอลัมน์: customer,rep · customer = ชื่อร้านหรือ id · rep = s1/s2/…)
   node tools/prep-prod.js --clear-owners          ล้างการแจกอัตโนมัติ (round-robin) ทิ้ง — ลูกค้าที่ไม่มีเจ้าของจะไม่โผล่ในคิวเซลล์จนกว่าจะแจก
   node tools/prep-prod.js --report                ดูอย่างเดียว ไม่เขียน
   ใส่หลายตัวเลือกพร้อมกันได้ · เขียนทับ fixtures เฉพาะที่เปลี่ยน */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, '..', 'data', 'fixtures');
const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const report = has('--report') || args.length === 0;

const load = k => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, idx[k]))).toString('utf8'));
const changed = {};
const save = (k, v) => { changed[k] = v; };
const out = m => console.log(m);

/* ── 1 · ตัดข้อมูลจำลอง ── */
if (has('--strip-mock') || report) {
  const pr = idx.price_rounds ? load('price_rounds') : null;
  const ce = idx.cost_entries ? load('cost_entries') : [];
  const hist = load('history');
  const mockCe = ce.filter(x => x.mock), mockHist = hist.filter(h => h.mock || /\*$/.test(String(h.label || '')));
  out(`ข้อมูลจำลอง: price_rounds ${pr ? (pr.source === 'mock' ? 'ทั้งก้อน (mock)' : 'ไม่ใช่ mock') : 'ไม่มี'} · cost_entries mock ${mockCe.length}/${ce.length} · history แถวจำลอง ${mockHist.length}/${hist.length}`);
  if (has('--strip-mock')) {
    if (pr && pr.source === 'mock') save('price_rounds', null);
    if (mockCe.length) save('cost_entries', ce.filter(x => !x.mock));
    if (mockHist.length) save('history', hist.filter(h => !(h.mock || /\*$/.test(String(h.label || '')))));
  }
}

/* ── 2 · id เหตุการณ์ซ้ำ ── */
if (has('--dedupe-events') || report) {
  const ev = load('events');
  const seen = new Set(); let dup = 0;
  ev.forEach(e => { if (seen.has(e.id)) dup++; seen.add(e.id); });
  out(`เหตุการณ์: ${ev.length} รายการ · id ซ้ำ ${dup}`);
  if (has('--dedupe-events') && dup) {
    /* เรียงเก่า→ใหม่ แล้วไล่เลขใหม่ 1..n (ใบหน้าเรียงใหม่→เก่า จึงไล่จากท้าย) */
    let n = 0; for (let i = ev.length - 1; i >= 0; i--) ev[i].id = ++n;
    save('events', ev); out(`  → ไล่เลขใหม่ 1–${n}`);
  }
}

/* ── 3 · เจ้าของลูกค้า ── */
if (val('--owners') || has('--clear-owners') || report) {
  const st = load('state');
  const cs = st.customers || [], reps = st.sales_reps || [];
  const auto = cs.filter(c => c.owner).length;
  out(`ลูกค้า ${cs.length} ราย · มีเจ้าของ ${auto} · เซลล์ในระบบ ${reps.map(r => r.id + '=' + r.name).join(', ') || 'ยังไม่มี'}`);
  if (has('--clear-owners')) { cs.forEach(c => { delete c.owner; }); save('state', st); out('  → ล้างเจ้าของทั้งหมด'); }
  const f = val('--owners');
  if (f) {
    const rows = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(l => l.split(/[,\t]/).map(x => x.trim())).filter(r => r.length >= 2 && r[0] && !/^(customer|ลูกค้า)$/i.test(r[0]));
    let ok = 0, miss = [];
    rows.forEach(([cust, rep]) => {
      const c = cs.find(x => x.id === cust || x.name === cust || (x.name || '').toLowerCase() === cust.toLowerCase());
      if (!c) return miss.push(cust);
      if (!reps.find(r => r.id === rep)) reps.push({ id: rep, name: rep });
      c.owner = rep; ok++;
    });
    st.sales_reps = reps; save('state', st);
    out(`  → แจกแล้ว ${ok} ราย${miss.length ? ' · หาไม่เจอ: ' + miss.join(', ') : ''}`);
  }
}

/* ── เขียน ── */
const keys = Object.keys(changed);
if (!keys.length) { out(report ? '(ดูอย่างเดียว — ไม่เขียน)' : 'ไม่มีอะไรเปลี่ยน'); process.exit(0); }
keys.forEach(k => {
  if (changed[k] === null) { fs.rmSync(path.join(DIR, idx[k]), { force: true }); delete idx[k]; out(`ลบ ${k}`); return; }
  fs.writeFileSync(path.join(DIR, idx[k]), zlib.gzipSync(Buffer.from(JSON.stringify(changed[k]), 'utf8'))); out(`เขียน ${k}`);
});
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(idx, null, 1));
out('เสร็จ — รัน npm test แล้ว commit fixtures');
