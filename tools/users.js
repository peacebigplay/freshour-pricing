#!/usr/bin/env node
/* จัดการบัญชีผู้ใช้ (เก็บใน <FH_VAR_DIR>/users.json · ค่าเริ่มต้น data/var/users.json)

   node tools/users.js add <id> --role boss|admin|ops|sale --name "ชื่อ" [--rep s1] [--password ...]
   node tools/users.js passwd <id> [--password ...]
   node tools/users.js disable <id> | enable <id> | remove <id>
   node tools/users.js list

   ไม่ใส่ --password = ระบบสุ่มให้แล้วพิมพ์ออกมาครั้งเดียว (เก็บเฉพาะ hash) · เปลี่ยนรหัส/ปิดบัญชี = session ของคนนั้นหลุดทันที */
'use strict';
const path = require('path');
const crypto = require('crypto');
const { createAuth } = require('../src/auth');

const args = process.argv.slice(2), cmd = args[0], id = args[1];
const opt = {}; for (let i = 2; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
const VAR = process.env.FH_VAR_DIR || path.join(__dirname, '..', 'data', 'var');
const auth = createAuth({ varDir: VAR });
const out = (m) => console.log(m);

function genPassword() { const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.randomBytes(12)).map(b => A[b % A.length]).join(''); }
function must(c, m) { if (!c) { console.error('ผิด: ' + m); process.exit(1); } }

switch (cmd) {
  case 'add': {
    must(id, 'ต้องมี id'); must(opt.role, 'ต้องมี --role boss|admin|ops|sale');
    const pw = typeof opt.password === 'string' ? opt.password : genPassword();
    must(pw.length >= 8, 'รหัสผ่านอย่างน้อย 8 ตัว');
    const u = auth.upsert({ id, role: opt.role, name: opt.name || id, rep: opt.rep || null }, pw);
    out(`สร้าง/แก้บัญชี ${u.id} (${u.role}${u.rep ? ' · เซลล์ ' + u.rep : ''}) แล้ว`);
    if (typeof opt.password !== 'string') out(`รหัสผ่านครั้งแรก: ${pw}   ← ส่งให้เจ้าตัวทางช่องทางส่วนตัว ระบบไม่เก็บไว้ให้ดูอีก`);
    break;
  }
  case 'passwd': {
    must(id && auth.userById(id), 'ไม่พบบัญชี ' + id);
    const pw = typeof opt.password === 'string' ? opt.password : genPassword(); must(pw.length >= 8, 'รหัสผ่านอย่างน้อย 8 ตัว');
    auth.upsert(auth.userById(id), pw); out(`ตั้งรหัสใหม่ให้ ${id} แล้ว${typeof opt.password !== 'string' ? ': ' + pw : ''}`); break;
  }
  case 'disable': case 'enable': {
    const u = auth.userById(id); must(u, 'ไม่พบบัญชี ' + id);
    auth.upsert(Object.assign({}, u, { active: cmd === 'enable' })); out(`${cmd === 'enable' ? 'เปิด' : 'ปิด'}บัญชี ${id} แล้ว`); break;
  }
  case 'remove': must(auth.remove(id), 'ไม่พบบัญชี ' + id); out(`ลบบัญชี ${id} แล้ว`); break;
  case 'list': {
    const L = auth.list(); if (!L.length) out('ยังไม่มีบัญชี — เพิ่มด้วย: node tools/users.js add <id> --role admin --name "ชื่อ"');
    L.forEach(u => out(`${u.active ? '●' : '○'} ${u.id.padEnd(14)} ${u.role.padEnd(6)} ${u.rep ? ('เซลล์ ' + u.rep).padEnd(10) : ''.padEnd(10)} ${u.name}`)); break;
  }
  default: out('ใช้: node tools/users.js add|passwd|disable|enable|remove|list …  (ดูหัวไฟล์)'); process.exit(cmd ? 1 : 0);
}
