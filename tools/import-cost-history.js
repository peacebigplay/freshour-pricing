#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   import-cost-history — นำ "ประวัติต้นทุน/ราคาขาย/ตลาดอ้างอิง ย้อนหลัง N รอบ" (ไฟล์ xlsx หรือ json) เข้าระบบ
   node tools/import-cost-history.js <file.xlsx|file.json> [--apply] [--source=mock|real] [--title="..."]
   · ไม่ใส่ --apply = ตรวจอย่างเดียว: จับคู่ทุกแถวกับ SKU (ลำดับในใบ AL = pdf_idx · แช่แข็ง = 901–903) · เทียบคอลัมน์ "ล่าสุด" กับตัวเลขที่ระบบถืออยู่ · รายงานที่ไม่ตรง
   · --apply = เขียน D.price_rounds (ประวัติรายรอบราย SKU) · D.cost_entries (บันทึกทุนย้อนหลัง ติดธง mock) · D.history (รอบราคา) แล้วเขียน fixture กลับ
   · ค่าเริ่มต้น source=mock — ไฟล์ชุดแรกเป็นข้อมูลจำลองสำหรับทดสอบ (Read Me ในไฟล์บอกเอง) ทุกหน้าจอจึงติดป้าย "ข้อมูลจำลอง" และไม่เอาไปคิดราคาแนะนำ/ตลาดแข่งขัน
   รูปแบบคอลัมน์ (แถวแรก = หัวตาราง): ลำดับ · ประเภท · รายการสินค้า · ต้นทุนรอบล่าสุด · ราคาขายปลีกล่าสุด · ราคาส่ง 2kg/5kg/10kg ล่าสุด · ต้นทุนก่อนหน้าในไฟล์ · แล้วต่อด้วยชุดละ 7 คอลัมน์ต่อรอบ:
   "รอบ -N วันที่" · ต้นทุน · ขายปลีก · ขายส่ง 2kg · ขายส่ง 5kg · ขายส่ง 10kg · ตลาดอ้างอิง
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..'), FX = path.join(ROOT, 'data', 'fixtures');
const { createStore } = require(path.join(ROOT, 'src', 'store'));
const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--')), APPLY = args.includes('--apply');
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const SOURCE = opt('source') || 'mock';
if (!file) { console.error('ใช้: node tools/import-cost-history.js <file.xlsx|file.json> [--apply] [--source=mock|real]'); process.exit(1); }

/* ── อ่าน xlsx โดยไม่พึ่งไลบรารี (zip → sharedStrings + sheet1) — พอสำหรับไฟล์ตารางธรรมดา ── */
function unzip(buf) {
  const out = {}; let p = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  while (p >= 0 && p < buf.length) {
    if (buf.readUInt32LE(p) !== 0x04034b50) break;
    const method = buf.readUInt16LE(p + 8), csz = buf.readUInt32LE(p + 18), nl = buf.readUInt16LE(p + 26), xl = buf.readUInt16LE(p + 28);
    const name = buf.slice(p + 30, p + 30 + nl).toString('utf8'); let start = p + 30 + nl + xl, data = buf.slice(start, start + csz);
    if (buf.readUInt16LE(p + 6) & 8) {   /* data descriptor: ขนาดอยู่หลังข้อมูล — หา signature ถัดไป */
      let q = buf.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]), start); if (q < 0) q = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), start); data = buf.slice(start, q); p = q + (buf.readUInt32LE(q) === 0x08074b50 ? 16 : 0);
    } else p = start + csz;
    out[name] = method === 8 ? zlib.inflateRawSync(data) : data;
  }
  return out;
}
const unesc = s => String(s).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function readXlsx(f) {
  const z = unzip(fs.readFileSync(f)), ss = [];
  const sst = z['xl/sharedStrings.xml']; if (sst) sst.toString('utf8').replace(/<si>([\s\S]*?)<\/si>/g, (m, inner) => { ss.push(unesc((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''))); return ''; });
  const sheet = (z['xl/worksheets/sheet1.xml'] || Object.keys(z).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort().map(k => z[k])[0]).toString('utf8');
  const rows = [];
  sheet.replace(/<row[^>]*>([\s\S]*?)<\/row>/g, (m, inner) => {
    const r = [];
    inner.replace(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (mm, col, attrs, body) => {
      let ci = 0; for (const ch of col) ci = ci * 26 + (ch.charCodeAt(0) - 64); ci--;
      const t = (attrs.match(/t="(\w+)"/) || [])[1], v = (body || '').match(/<v>([\s\S]*?)<\/v>/), is = (body || '').match(/<is>([\s\S]*?)<\/is>/);
      let val = null;
      if (t === 's' && v) val = ss[Number(v[1])]; else if (t === 'inlineStr' && is) val = unesc(is[1].replace(/<[^>]+>/g, '')); else if (v) val = t === 'str' ? unesc(v[1]) : Number(v[1]);
      r[ci] = val; return '';
    });
    rows.push(r); return '';
  });
  return rows;
}
function readInput(f) {
  if (/\.json$/i.test(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j.rows && j.header ? { header: j.header, rows: j.rows.map(r => j.header.map(h => r[h])) } : j; }
  const rows = readXlsx(f).filter(r => r.some(c => c != null && c !== '')); return { header: rows[0].map(h => String(h || '').trim()), rows: rows.slice(1) };
}

/* ── แปลงโครงสร้างคอลัมน์ ── */
const IN = readInput(file), H = IN.header;
const col = re => H.findIndex(h => re.test(h));
const C = { idx: col(/^ลำดับ/), type: col(/^ประเภท/), name: col(/^รายการ/), cost: col(/^ต้นทุนรอบล่าสุด/), retail: col(/^ราคาขายปลีกล่าสุด/), w2: col(/^ราคาส่ง 2 ?kg ล่าสุด/i), s5: col(/^ราคาส่ง 5 ?kg ล่าสุด/i), s10: col(/^ราคาส่ง 10 ?kg ล่าสุด/i), prev: col(/^ต้นทุนก่อนหน้า/) };
Object.keys(C).forEach(k => { if (C[k] < 0) throw new Error('ไม่พบคอลัมน์ ' + k + ' ในหัวตาราง: ' + H.join(' | ')); });
const ROUNDS = []; H.forEach((h, i) => { const m = h.match(/^รอบ\s*(-?\d+)\s*วันที่/); if (m) ROUNDS.push({ k: Number(m[1]), i0: i }); });
ROUNDS.sort((a, b) => a.k - b.k);
if (!ROUNDS.length) throw new Error('ไม่พบคอลัมน์ "รอบ -N วันที่"');
const rc = (r, i0) => ({ date: r[i0], cost: r[i0 + 1], retail: r[i0 + 2], w2: r[i0 + 3], s5: r[i0 + 4], s10: r[i0 + 5], market: r[i0 + 6] });
/* '20-26/08/2026' · '27/08-02/09/2026' → { label:'20-26/08', from:'2026-08-20', to:'2026-08-26' } */
function parseRange(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})(?:\/(\d{1,2}))?\s*[-–]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/); if (!m) return null;
  let y = Number(m[5] || new Date().getUTCFullYear()); if (y > 2400) y -= 543;
  const m2 = Number(m[4]), m1 = m[2] ? Number(m[2]) : m2, pad = n => String(n).padStart(2, '0');
  return { label: pad(m[1]) + (m[2] ? '/' + pad(m1) : '') + '-' + pad(m[3]) + '/' + pad(m2), from: y + '-' + pad(m1) + '-' + pad(m[1]), to: y + '-' + pad(m2) + '-' + pad(m[3]) };
}
const num = v => (v === '' || v == null ? null : Number(String(v).replace(/,/g, '')));
const cleanName = s => String(s || '').replace(/[​­]/g, '').replace(/\s+/g, '').replace(/[ัิ-ฺ็-๎]/g, '').toLowerCase();

/* ── โหลดระบบ ── */
const idx = JSON.parse(fs.readFileSync(path.join(FX, 'index.json'), 'utf8'));
const docs = {}; for (const k of Object.keys(idx)) docs[k] = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(FX, idx[k]))).toString('utf8'));
const before = {}; for (const k of Object.keys(docs)) before[k] = JSON.stringify(docs[k]);
const st = createStore(docs, {}), S = docs.state, D = st.docs;
const desk = st.handle({ role: 'ops', method: 'GET', url: '/api/desk', origin: 'http://import' }).body;
const byIdx = {}; S.products.forEach(p => { if (p.pdf_idx != null) byIdx[p.pdf_idx] = p; });
const deskRow = {}; desk.rows.forEach(r => { deskRow[r.id] = r; });

/* ── จับคู่ + ตรวจ ── */
const rounds = ROUNDS.map(r => { const d = parseRange(IN.rows.find(x => x[r.i0])[r.i0]); if (!d) throw new Error('อ่านช่วงวันที่ของรอบ ' + r.k + ' ไม่ออก: ' + IN.rows[0][r.i0]); return Object.assign({ k: r.k }, d); });
const sku = {}, report = { matched: 0, nameWarn: [], mismatch: [], unmatched: [], dup: [], badRound: [] };
const seen = {};
IN.rows.forEach((r, n) => {
  const ord = num(r[C.idx]); if (ord == null) return;
  const frozen = /แช่แข็ง/.test(String(r[C.type] || ''));
  const pdfIdx = frozen ? 900 + ord : ord, P = byIdx[pdfIdx], name = String(r[C.name] || '').trim();
  if (!P) { report.unmatched.push({ row: n + 2, idx: pdfIdx, name }); return; }
  if (seen[P.id]) { report.dup.push({ row: n + 2, idx: pdfIdx, name }); return; } seen[P.id] = 1;
  /* ชื่อในไฟล์ vs ชื่อในระบบ (ไฟล์มีช่องว่างแทรกจาก PDF) — เตือนถ้าไม่ซ้อนกันเลย */
  const a = cleanName(name).replace(/กก\.?ละ|ถาดละ|แพคละ|แพ็คละ/g, ''), b = cleanName(P.name);
  if (!(a.includes(b.slice(0, 6)) || b.includes(a.slice(0, 6)))) report.nameWarn.push({ idx: pdfIdx, file: name, system: P.name });
  /* คอลัมน์ "ล่าสุด" ต้องเท่ากับที่ระบบถือ (ทุน · ทุนก่อน · ส่ง 2kg ที่ประกาศ · ปลีก · 5kg · 10kg) — ถ้าไม่ตรง ไฟล์กับระบบอ้างคนละรอบ */
  const dr = deskRow[P.id] || {}, L = { cost: num(r[C.cost]), prev: num(r[C.prev]), w2: num(r[C.w2]), retail: num(r[C.retail]), s5: num(r[C.s5]), s10: num(r[C.s10]) };
  if (!frozen) {
    const want = { cost: dr.cost, prev: dr.costPrev, w2: dr.prev, retail: dr.retail, s5: dr.prev != null ? dr.prev + (dr.s5 - dr.w2) : null, s10: dr.prev != null ? dr.prev + (dr.s10 - dr.w2) : null };
    Object.keys(L).forEach(k => { if (L[k] != null && want[k] != null && L[k] !== want[k]) report.mismatch.push({ idx: pdfIdx, name: P.name, field: k, file: L[k], system: want[k] }); });
  }
  const list = [];
  ROUNDS.forEach(R => {
    const x = rc(r, R.i0), c = num(x.cost);
    if (!(c > 0)) { report.badRound.push({ idx: pdfIdx, round: R.k, why: 'ทุนว่าง' }); return; }
    list.push({ k: R.k, cost: c, retail: num(x.retail), w2: num(x.w2), s5: num(x.s5), s10: num(x.s10), market: x.market == null ? null : Math.round(Number(x.market) * 100) / 100 });
  });
  if (frozen && list.length && dr.cost > 0 && Math.abs(list[list.length - 1].cost - dr.cost) / dr.cost > 0.25) report.nameWarn.push({ idx: pdfIdx, file: name + ' (ทุนรอบ ' + list[list.length - 1].k + ' = ' + list[list.length - 1].cost + ')', system: P.name + ' (ทุนปัจจุบัน ' + dr.cost + ') — ประวัติไม่ต่อเนื่องกับปัจจุบัน' });
  sku[P.id] = list; report.matched++;
});

/* ── รายงาน ── */
console.log('ไฟล์: ' + path.basename(file) + ' · ' + IN.rows.length + ' แถว · ' + rounds.length + ' รอบ: ' + rounds.map(r => r.label).join(' → ') + ' · source=' + SOURCE);
console.log('จับคู่ SKU ได้ ' + report.matched + '/' + IN.rows.length + ' · ไม่พบ ' + report.unmatched.length + ' · ซ้ำ ' + report.dup.length + ' · ชื่อไม่คล้าย ' + report.nameWarn.length + ' · ตัวเลข "ล่าสุด" ไม่ตรงระบบ ' + report.mismatch.length + ' · รอบที่ทุนว่าง ' + report.badRound.length);
const missing = S.products.filter(p => p.pdf_idx != null && !sku[p.id]);
if (missing.length) console.log('SKU ในใบ AL ที่ไฟล์ไม่มี: ' + missing.map(p => p.pdf_idx + ' ' + p.name).join(' · '));
report.unmatched.forEach(u => console.log('  ✗ แถว ' + u.row + ' ลำดับ ' + u.idx + ' ' + u.name + ' — ไม่มี SKU ลำดับนี้ในระบบ'));
report.nameWarn.forEach(w => console.log('  ? ลำดับ ' + w.idx + ' ไฟล์ "' + w.file + '" ≠ ระบบ "' + w.system + '"'));
report.mismatch.forEach(m => console.log('  ≠ ลำดับ ' + m.idx + ' ' + m.name + ' · ' + m.field + ' ไฟล์ ' + m.file + ' ≠ ระบบ ' + m.system));
/* สถิติภาพรวมของชุดนี้ */
const all = Object.values(sku).flat(), rk = {}; all.forEach(x => { (rk[x.k] = rk[x.k] || []).push(x); });
const avg = a => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : null;
rounds.forEach(r => { const L = rk[r.k] || []; r.cost_avg = avg(L.map(x => x.cost)); r.margin_avg = avg(L.filter(x => x.w2 > 0).map(x => (x.w2 - x.cost) / x.w2 * 100)); r.market_avg = avg(L.filter(x => x.market > 0).map(x => x.market)); r.n = L.length; });
console.log('เฉลี่ยรายรอบ: ' + rounds.map(r => r.label + ' ทุน ' + r.cost_avg + ' / margin ' + r.margin_avg + '%').join(' · '));
const ok = !report.unmatched.length && !report.mismatch.length && !report.dup.length;
if (!ok) console.log('\n⚠ มีรายการไม่ตรง — ' + (APPLY ? 'ยังนำเข้าต่อ แต่ตรวจรายการด้านบนก่อนใช้ตัดสินใจ' : 'แก้ไฟล์/ตรวจระบบก่อน --apply'));
if (!APPLY) { console.log('\n(dry run — ใส่ --apply เพื่อบันทึก)'); process.exit(ok ? 0 : 2); }

/* ── เขียนเข้าระบบ ── */
const now = new Date().toISOString().slice(0, 19), title = opt('title') || (SOURCE === 'mock' ? 'ข้อมูลจำลอง ' + rounds.length + ' รอบ (ทดสอบ · ไม่ใช่ตัวเลขจริง)' : 'ประวัติ ' + rounds.length + ' รอบจากไฟล์');
D.price_rounds = { source: SOURCE, title, file: path.basename(file), imported_at: now, rounds: rounds.map(r => ({ k: r.k, label: r.label, from: r.from, to: r.to, cost_avg: r.cost_avg, margin_avg: r.margin_avg, market_avg: r.market_avg, n: r.n })),
  note: SOURCE === 'mock' ? 'ชุดนี้สร้างขึ้นเพื่อทดสอบการเก็บและเทียบข้อมูลย้อนหลัง · ราคาตลาดอ้างอิงในชุดคำนวณจากทุน ไม่ใช่ราคาตลาดจริง · ระบบใช้เป็น "อ้างอิง" (ช่วงทุน/แนวโน้ม) เท่านั้น ไม่เอาไปคิดราคาแนะนำ/Floor/ตลาดแข่งขัน' : 'ประวัติจากไฟล์ที่นำเข้า',
  sku, replaced: [] };
/* cost_entries: บันทึกทุนย้อนหลัง (ใหม่สุดก่อน) ติดธง mock เพื่อไม่ให้นับเป็นผลงาน automation */
const srcTxt = SOURCE === 'mock' ? 'ประวัติจำลอง ' + rounds.length + ' รอบ (mock)' : 'ประวัติจากไฟล์ ' + path.basename(file);
D.cost_entries = (D.cost_entries || []).filter(e => !e.mock && e.batch_id !== 'HIST-' + SOURCE.toUpperCase());
const ent = [];
Object.keys(sku).forEach(pid => { const L = sku[pid].slice().sort((a, b) => a.k - b.k); L.forEach((x, i) => { const r = rounds.find(q => q.k === x.k); ent.push({ at: r.to + 'T12:00:00', pid, cost: x.cost, prev: i ? L[i - 1].cost : null, src: srcTxt, by: 'import', batch_id: 'HIST-' + SOURCE.toUpperCase(), mock: SOURCE === 'mock' }); }); });
ent.sort((a, b) => (a.at < b.at ? 1 : -1));
D.cost_entries = D.cost_entries.concat(ent);
/* history (รอบราคา): ถอดรอบที่เคยนำเข้าจากไฟล์ประวัติ · ถอดรอบจริงที่ทับช่วงเดียวกัน (เก็บไว้ใน replaced ให้ดูย้อนได้) · แทรกรอบจากไฟล์ตามวันที่ */
const lo = rounds[0].from, hi = rounds[rounds.length - 1].to;
D.history = (D.history || []).filter(h => !(h.src === 'price_rounds'));
const head = D.history[0];   /* รอบปัจจุบัน (ใบ AL ล่าสุด) ห้ามถูกแทนที่ — ไฟล์ประวัติคือ "ก่อนหน้า" รอบนี้ */
const overlap = h => h !== head && h.dispatched_at >= lo && h.dispatched_at < hi;
D.history.filter(overlap).forEach(h => D.price_rounds.replaced.push(h));
D.history = D.history.filter(h => !overlap(h));
const maxId = D.history.reduce((m, h) => Math.max(m, h.id || 0), 0);
rounds.forEach((r, i) => D.history.push({ id: maxId + 1 + i, label: r.label + (SOURCE === 'mock' ? '*' : ''), dispatched_at: r.from, by_role: SOURCE === 'mock' ? 'ข้อมูลจำลอง (ทดสอบ)' : 'ไฟล์ประวัติ', cost_avg: r.cost_avg, margin_avg: r.margin_avg, profit_week: 0, risk_count: 0, src: 'price_rounds', mock: SOURCE === 'mock' }));
D.history.sort((a, b) => (a.dispatched_at < b.dispatched_at ? 1 : a.dispatched_at > b.dispatched_at ? -1 : (b.id || 0) - (a.id || 0)));
console.log('\nบันทึก: price_rounds ' + Object.keys(sku).length + ' SKU × ' + rounds.length + ' รอบ · cost_entries +' + ent.length + ' · history แทรก ' + rounds.length + ' รอบ' + (D.price_rounds.replaced.length ? ' (แทนที่รอบเดิมที่ทับช่วง: ' + D.price_rounds.replaced.map(h => h.label).join(', ') + ')' : ''));

let changed = 0;
for (const k of ['price_rounds', 'cost_entries', 'history']) {
  const nowJ = JSON.stringify(D[k]); if (before[k] === nowJ) continue;
  if (!idx[k]) idx[k] = k.replace(/[^A-Za-z0-9_.-]/g, '_') + '.json.gz';
  fs.writeFileSync(path.join(FX, idx[k]), zlib.gzipSync(Buffer.from(nowJ, 'utf8'))); changed++;
}
fs.writeFileSync(path.join(FX, 'index.json'), JSON.stringify(idx));
console.log('เขียน fixture ' + changed + ' ก้อน');
