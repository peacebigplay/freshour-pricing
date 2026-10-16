#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   import-customer-prices — นำ "ใบราคาลูกค้า" (ราคาขายรายเจ้า รอบก่อน → รอบนี้) เข้าระบบ
   node tools/import-customer-prices.js <sheets.json> [--apply]
   · ไม่ใส่ --apply = ทดลองจับคู่ (dry run) พิมพ์ตารางว่าแต่ละบรรทัดจับกับ SKU ไหน มั่นใจแค่ไหน ยังไม่แตะข้อมูล
   · --apply = สร้างลูกค้าที่ยังไม่มี (มอบหมายเซลล์ที่ถือลูกค้าน้อยสุด) · บันทึกราคาสัญญาผ่าน /api/contract-price (ราคารอบนี้ + ราคารอบก่อน) · เขียน fixture กลับ
   รูปแบบไฟล์: { label, prevLabel, source, customers: [{ name, aliases[], lines: [{ name, spec?, unit?, prev, price, product? (ชื่อ SKU ใน master บังคับจับคู่), skip? }] }] }
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..'), FX = path.join(ROOT, 'data', 'fixtures');
const { createStore } = require(path.join(ROOT, 'src', 'store'));
const file = process.argv[2], APPLY = process.argv.includes('--apply');
if (!file) { console.error('ใช้: node tools/import-customer-prices.js <sheets.json> [--apply]'); process.exit(1); }
const IN = JSON.parse(fs.readFileSync(file, 'utf8'));
const idx = JSON.parse(fs.readFileSync(path.join(FX, 'index.json'), 'utf8'));
const docs = {}; for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(FX, idx[k]))).toString('utf8'));
const before = {}; for (const k of Object.keys(docs)) before[k] = JSON.stringify(docs[k]);
const st = createStore(docs, {}), S = docs.state, D = st.docs;
const call = (method, url, body) => st.handle({ role: 'ops', method, url, body, origin: 'http://import' });
const norm = s => String(s || '').toLowerCase().replace(/[ัิ-ฺ็-๎]/g, '').replace(/[()\[\]/.,*%+\-]/g, ' ').replace(/\s+/g, ' ').trim();
const KG = u => !u || /^(kg|กก\.?|กิโล)$/i.test(String(u).trim());

/* ── ลูกค้า: ชื่อตรง → alias → ชื่อซ้อนกัน ── */
function findCustomer(c) {
  const cands = S.customers, nm = norm(c.name), keys = [c.name].concat(c.aliases || []).map(norm).filter(Boolean);
  let hit = cands.find(x => norm(x.name) === nm); if (hit) return { c: hit, how: 'ตรง' };
  hit = cands.find(x => keys.some(k => k.length >= 4 && (norm(x.name) === k || norm(x.name).includes(k) || k.includes(norm(x.name)))));
  return hit ? { c: hit, how: 'alias' } : null;
}
function leastLoadedRep() { const n = {}; S.customers.forEach(x => { if (x.owner) n[x.owner] = (n[x.owner] || 0) + 1; }); return (S.sales_reps || []).slice().sort((a, b) => (n[a.id] || 0) - (n[b.id] || 0))[0]; }
/* ── สินค้า: บังคับด้วย product → ตัวจับคู่เดียวกับที่รับไฟล์ทุน (alias/ตรง/ล้างชื่อ/คล้าย) → ถ้าไม่มั่นใจ เสนอ 3 ตัวใกล้สุด ── */
function candidates(name) {
  const t = new Set(norm(name).split(' ').filter(w => w.length > 1));
  return D.pricelist.rows.map(r => { const u = new Set(norm(r.name).split(' ').filter(w => w.length > 1)); let hit = 0; t.forEach(w => { if (u.has(w) || [...u].some(x => x.includes(w) || w.includes(x))) hit++; }); return { r, s: t.size ? hit / Math.max(t.size, u.size) : 0 }; })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
}
/* สินค้าเฉพาะลูกค้า (สเปคที่ master ไม่มี): สร้าง SKU ใหม่จาก "สินค้าฐาน" เดียวกัน (ทุน/กลุ่มเดียวกัน) จะได้ไม่ทับบรรทัดอื่นที่ใช้ฐานเดียวกัน */
function ensureCreated(l) {
  const base = D.pricelist.rows.find(r => r.name === l.create.base); if (!base) return { p: null, how: 'ไม่พบสินค้าฐาน: ' + l.create.base, score: 0 };
  const ex = D.pricelist.rows.find(r => r.name === l.name.trim()); if (ex) return { p: ex, how: 'มีอยู่แล้ว', score: 1 };
  if (!APPLY) return { p: { id: 'new:' + l.name.trim(), name: l.name.trim() + '  ← ฐาน ' + base.name }, how: 'สร้างใหม่', score: 1 };
  const P = S.products.find(x => x.id === base.id);
  const r = call('POST', '/api/products', { name: l.name.trim(), grp: l.create.grp || base.grp, cost: base.cost, add_baht: P ? P.add_baht : 15, spec: (l.spec || '') + (l.spec ? ' · ' : '') + 'ฐาน: ' + base.name, cost_src: 'สินค้าฐาน ' + base.name });
  if (r.status !== 200) return { p: null, how: 'สร้างไม่ได้: ' + r.body.error, score: 0 };
  const np = D.pricelist.rows.find(x => x.name === l.name.trim()); return { p: np, how: 'สร้างใหม่', score: 1 };
}
function matchLine(l) {
  if (l.create) return ensureCreated(l);
  if (l.product) { const p = D.pricelist.rows.find(r => r.name === l.product); return p ? { p, how: 'กำหนดเอง', score: 1 } : { p: null, how: 'ไม่พบชื่อที่กำหนด: ' + l.product, score: 0 }; }
  const m = st.ext.matchProduct(l.name + (l.spec ? ' ' + l.spec : ''));
  if (m && m.score >= 0.8) return { p: m.p, how: m.how, score: m.score };
  const m2 = st.ext.matchProduct(l.name);
  if (m2 && m2.score >= 0.8) return { p: m2.p, how: m2.how, score: m2.score };
  return { p: null, how: m2 ? 'คล้าย ' + Math.round(m2.score * 100) + '% ' + m2.p.name : 'ไม่พบ', score: m2 ? m2.score : 0, cands: candidates(l.name) };
}

const report = { customers: [], applied: 0, skipped: [], unmatched: [] };
for (const c of IN.customers) {
  let found = findCustomer(c), cid = found ? found.c.id : null, created = false;
  if (!found && APPLY) { const rep = leastLoadedRep(); const r = call('POST', '/api/customers', { name: c.name, type: 'contract', owner: rep ? rep.id : '', note: 'นำเข้าจาก ' + (IN.source || file) }); if (r.status !== 200) throw new Error(r.body.error); cid = r.body.id || (S.customers.find(x => x.name === c.name) || {}).id; created = true; }
  const rows = [], seenP = {};
  for (const l of c.lines || []) {
    if (l.skip) { report.skipped.push([c.name, l.name, 'skip']); continue; }
    if (!(l.price > 0)) { report.skipped.push([c.name, l.name, 'ไม่มีราคารอบนี้']); continue; }
    if (!KG(l.unit)) { report.skipped.push([c.name, l.name, 'หน่วย ' + l.unit + ' (ระบบคิดราคาต่อ กก.)']); continue; }
    const m = matchLine(l); rows.push({ line: l, m });
    if (!m.p) { report.unmatched.push({ customer: c.name, name: l.name, how: m.how, cands: (m.cands || []).map(x => x.r.name) }); continue; }
    if (seenP[m.p.id]) { m.how += ' · ซ้ำกับ "' + seenP[m.p.id] + '" ข้าม'; report.skipped.push([c.name, l.name, 'ชี้ SKU เดียวกับ ' + seenP[m.p.id]]); continue; } seenP[m.p.id] = l.name;
    if (APPLY && cid) { const r = call('POST', '/api/contract-price', { customer_id: cid, product_id: m.p.id, price: l.price, prev: l.prev || null, prevLabel: IN.prevLabel || null }); if (r.status !== 200) report.skipped.push([c.name, l.name, r.body.error]); else report.applied++; }
  }
  report.customers.push({ name: c.name, found: found ? found.c.name + ' (' + found.how + ')' : (created ? 'สร้างใหม่' : 'ยังไม่มี — จะสร้างใหม่ตอน --apply'), rows });
}
/* ── พิมพ์ผล ── */
for (const c of report.customers) {
  console.log('\n■ ' + c.name + '  →  ' + c.found);
  for (const { line, m } of c.rows) console.log('   ' + (m.p ? '✓' : '✗') + ' ' + line.name.padEnd(44).slice(0, 44) + ' ' + String(line.prev || '—').padStart(4) + '→' + String(line.price).padEnd(4) + '  ' + (m.p ? m.p.name + '  [' + m.how + ' ' + Math.round(m.score * 100) + '%]' : m.how + (m.cands && m.cands.length ? '  ใกล้สุด: ' + m.cands.map(x => x.r.name).join(' | ') : '')));
}
console.log('\nสรุป: ลูกค้า ' + report.customers.length + ' · จับคู่ได้ ' + report.customers.reduce((a, c) => a + c.rows.filter(x => x.m.p).length, 0) + ' · ไม่มั่นใจ ' + report.unmatched.length + ' · ข้าม ' + report.skipped.length + (APPLY ? ' · บันทึกแล้ว ' + report.applied : ' · (dry run — ใส่ --apply เพื่อบันทึก)'));
if (report.skipped.length) console.log('ข้าม: ' + report.skipped.map(s => s[1] + ' (' + s[2] + ')').join(' · '));
if (!APPLY) process.exit(0);

/* ── เขียน fixture กลับเฉพาะก้อนที่เปลี่ยน (ก้อนใหม่ เช่น desk:/sheet: ของลูกค้าใหม่ → ไฟล์ใหม่ + index) ── */
let changed = 0;
for (const k of Object.keys(D)) {
  if (typeof D[k] !== 'object' || D[k] === null) continue;
  /* ก้อน desk: เก็บเฉพาะข้อมูลดิบ — v21 (goals/rec/why) เครื่องคิดราคาคำนวณใหม่ทุกครั้งที่เปิดอยู่แล้ว ไม่ต้องฝังลง fixture */
  const slim = k.startsWith('desk') ? JSON.parse(JSON.stringify(D[k], function (kk, v) { return kk === 'v21' && v && typeof v === 'object' ? Object.assign({}, v, { goals: undefined, rec: undefined, market: undefined }) : v; })) : D[k];   /* เก็บสถานะใน v21 (central/baseApproved) ไว้ ตัดเฉพาะ goals/rec/market ที่คำนวณใหม่ทุกครั้ง */
  const now = JSON.stringify(slim); if (before[k] === now) continue;
  if (!idx[k]) idx[k] = k.replace(/[^A-Za-z0-9_.-]/g, '_') + '.json.gz';
  fs.writeFileSync(path.join(FX, idx[k]), zlib.gzipSync(Buffer.from(now, 'utf8'))); changed++;
}
fs.writeFileSync(path.join(FX, 'index.json'), JSON.stringify(idx));
console.log('เขียน fixture ' + changed + ' ก้อน');
