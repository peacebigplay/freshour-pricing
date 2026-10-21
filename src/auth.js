/* ══════════════════════════════════════════════════════════════════
   Freshour · auth — บัญชีรายคน + session จริง (ไม่มี dependency)

   โหมด (ตัดสินตอนเปิด server):
     users  = มีบัญชีใน <VAR>/users.json หรือ FH_USERS_JSON → ต้องใส่ชื่อ+รหัส ทุกคน
     open   = ไม่มีบัญชี แต่ตั้ง FH_DEV_OPEN=1 → เลือกบทบาทแล้วเข้าได้เลย (เครื่องพัฒนาเท่านั้น)
     locked = ไม่มีบัญชีและไม่ได้ตั้ง FH_DEV_OPEN → ปิดประตู จนกว่าจะสร้างบัญชี (fail-closed)

   รหัสผ่าน: scrypt + salt สุ่มต่อคน · เทียบแบบ timing-safe
   session : id สุ่ม 32 ไบต์ เก็บฝั่ง server ใน <VAR>/sessions.json · หมดอายุ 30 วัน หรือไม่ใช้ 7 วัน · logout ลบทิ้งจริง
   ล็อก    : ชื่อเดียวกัน+IP เดียวกัน ใส่ผิด 5 ครั้ง → รอ 15 นาที
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROLES = { boss: 3, admin: 3, ops: 2, sale: 1 };
const ABS_MS = 30 * 864e5, IDLE_MS = 7 * 864e5;
const MAX_FAILS = 5, LOCK_MS = 15 * 60e3;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  return 'scrypt$' + salt + '$' + h;
}
function verifyPassword(pw, stored) {
  const p = String(stored || '').split('$'); if (p.length !== 3 || p[0] !== 'scrypt') return false;
  const h = crypto.scryptSync(String(pw), p[1], 32, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(p[2], 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}

function normUser(u) {
  const id = String(u.id || u.username || '').trim().toLowerCase();
  const role = String(u.role || '').trim();
  if (!id || !ROLES[role]) return null;
  return { id, name: String(u.name || id), role, rep: u.rep ? String(u.rep) : null, hash: u.hash || null, active: u.active !== false };
}

function createAuth(opts) {
  opts = opts || {};
  const VAR = opts.varDir;
  const USERS_FILE = VAR ? path.join(VAR, 'users.json') : null;
  const SESS_FILE = VAR ? path.join(VAR, 'sessions.json') : null;
  const log = opts.log || function () {};

  /* ── บัญชี ── */
  function readUsers() {
    let list = [];
    if (USERS_FILE && fs.existsSync(USERS_FILE)) { try { list = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { log('users.json อ่านไม่ได้: ' + e.message); } }
    if (!list.length && opts.usersJson) { try { list = JSON.parse(opts.usersJson); } catch (e) { log('FH_USERS_JSON อ่านไม่ได้: ' + e.message); } }
    if (!Array.isArray(list)) list = list.users || [];
    return list.map(normUser).filter(Boolean);
  }
  let USERS = readUsers();
  const mode = USERS.length ? 'users' : opts.devOpen ? 'open' : 'locked';
  function userById(id) { return USERS.filter(u => u.id === String(id || '').trim().toLowerCase())[0] || null; }
  function saveUsers() { if (!USERS_FILE) throw new Error('ไม่มีโฟลเดอร์เก็บบัญชี'); fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true }); fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 1)); }

  /* ── session ── */
  const SESS = new Map();
  if (SESS_FILE && fs.existsSync(SESS_FILE)) { try { JSON.parse(fs.readFileSync(SESS_FILE, 'utf8')).forEach(s => SESS.set(s.id, s)); } catch (e) { /* เริ่มใหม่ */ } }
  let saveT = null;
  function persist() {
    if (!SESS_FILE) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { fs.mkdirSync(path.dirname(SESS_FILE), { recursive: true }); fs.writeFileSync(SESS_FILE, JSON.stringify([...SESS.values()])); } catch (e) { log('เขียน sessions.json ไม่ได้: ' + e.message); } }, 200);
    if (saveT.unref) saveT.unref();
  }
  function alive(s, now) { return s && now - s.at < ABS_MS && now - s.last < IDLE_MS; }
  function create(user) {
    const id = crypto.randomBytes(32).toString('base64url'), now = Date.now();
    const s = { id, uid: user.id, name: user.name, role: user.role, rep: user.rep || null, at: now, last: now };
    SESS.set(id, s); persist(); return s;
  }
  function get(id) {
    if (!id) return null;
    const s = SESS.get(id), now = Date.now();
    if (!alive(s, now)) { if (s) { SESS.delete(id); persist(); } return null; }
    if (now - s.last > 60e3) { s.last = now; persist(); }
    if (mode === 'users') { const u = userById(s.uid); if (!u || !u.active || u.role !== s.role) { SESS.delete(id); persist(); return null; } s.rep = u.rep || null; s.name = u.name; }
    return s;
  }
  function drop(id) { if (SESS.delete(id)) persist(); }
  function dropUser(uid) { for (const [k, s] of SESS) if (s.uid === uid) SESS.delete(k); persist(); }
  setInterval(() => { const now = Date.now(); let n = 0; for (const [k, s] of SESS) if (!alive(s, now)) { SESS.delete(k); n++; } if (n) persist(); }, 3600e3).unref();

  /* ── กันเดารหัส ── */
  const FAILS = new Map();
  function lockKey(uid, ip) { return uid + '|' + (ip || ''); }
  function locked(uid, ip) { const f = FAILS.get(lockKey(uid, ip)); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60e3) : 0; }
  function fail(uid, ip) { const k = lockKey(uid, ip), f = FAILS.get(k) || { n: 0, until: 0 }; f.n++; if (f.n >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.n = 0; } FAILS.set(k, f); }
  function clearFails(uid, ip) { FAILS.delete(lockKey(uid, ip)); }

  /* ── login: คืน {status, body, session?} เหมือน handler ของ store ── */
  function login(body, ip) {
    body = body || {};
    if (mode === 'locked') return { status: 503, body: { error: 'ระบบยังไม่ได้ตั้งบัญชีผู้ใช้ — ให้ผู้ดูแลสร้างด้วย node tools/users.js add …' } };
    if (mode === 'open') {
      const role = String(body.role || ''); if (!ROLES[role]) return { status: 400, body: { error: 'ไม่รู้จักบทบาทนี้' } };
      const rep = role === 'sale' ? (body.rep ? String(body.rep) : null) : null;
      const s = create({ id: role + (rep ? ':' + rep : ''), name: role, role, rep });
      return { status: 200, body: { ok: true, role, rep: rep ? { id: rep } : undefined, mode }, session: s };
    }
    const uid = String(body.user || body.username || body.id || '').trim().toLowerCase(), pw = body.password == null ? String(body.pin || '') : String(body.password);
    if (!uid || !pw) return { status: 400, body: { error: 'ใส่ชื่อผู้ใช้และรหัสผ่าน' } };
    const wait = locked(uid, ip); if (wait) return { status: 429, body: { error: 'ใส่รหัสผิดหลายครั้ง — รออีก ' + wait + ' นาที' } };
    const u = userById(uid);
    if (!u || !u.active || !u.hash || !verifyPassword(pw, u.hash)) { fail(uid, ip); return { status: 401, body: { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' } }; }
    if (u.role === 'sale' && !u.rep) return { status: 403, body: { error: 'บัญชีเซลล์นี้ยังไม่ได้ผูกกับชื่อในทีมขาย — ให้ผู้ดูแลตั้ง rep ก่อน' } };
    clearFails(uid, ip);
    const s = create(u);
    return { status: 200, body: { ok: true, role: u.role, user: { id: u.id, name: u.name }, rep: u.rep ? { id: u.rep } : undefined, mode }, session: s };
  }

  /* ── จัดการบัญชี (ใช้จาก CLI/ผู้ดูแล) ── */
  function upsert(u, password) {
    const n = normUser(u); if (!n) throw new Error('ต้องมี id และ role ใน boss/admin/ops/sale');
    const cur = userById(n.id);
    if (password) n.hash = hashPassword(password); else if (cur) n.hash = cur.hash;
    if (!n.hash) throw new Error('ต้องตั้งรหัสผ่าน');
    if (cur) USERS[USERS.indexOf(cur)] = n; else USERS.push(n);
    saveUsers(); dropUser(n.id); return n;
  }
  function remove(id) { const cur = userById(id); if (!cur) return false; USERS = USERS.filter(u => u !== cur); saveUsers(); dropUser(cur.id); return true; }
  function list() { return USERS.map(u => ({ id: u.id, name: u.name, role: u.role, rep: u.rep, active: u.active })); }

  return { mode, login, get, drop, dropUser, upsert, remove, list, userById, hashPassword, verifyPassword, ROLES };
}

module.exports = { createAuth, hashPassword, verifyPassword, ROLES };
