/* ตั้งค่าการเชื่อมต่อที่ผู้ดูแลแก้จากหน้าเว็บได้ (LINE · feed ราคาตลาด) — เก็บใน <FH_VAR_DIR>/settings.json
   ลำดับความสำคัญ: ค่าที่ตั้งในหน้าเว็บ > env เดิม · ว่างทั้งคู่ = ยังไม่ต่อ
   ความลับ (token/secret) ไม่ส่งกลับไปหน้าเว็บ — ส่งแค่ว่า "ตั้งแล้ว" + 4 ตัวท้าย */
'use strict';
const fs = require('fs');
const path = require('path');

const KEYS = {
  line_token: { env: 'LINE_CHANNEL_TOKEN', secret: true },
  line_secret: { env: 'LINE_CHANNEL_SECRET', secret: true },
  line_admin: { env: 'LINE_ADMIN_USER_ID', secret: false },
  line_staff: { env: 'LINE_STAFF_USER_IDS', secret: false },
  market_feed_url: { env: 'MARKET_FEED_URL', secret: false }
};

function createSettings(varDir, env) {
  env = env || process.env;
  const file = varDir ? path.join(varDir, 'settings.json') : null;
  let saved = {};
  if (file && fs.existsSync(file)) { try { saved = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { saved = {}; } }

  function get(k) { return String(saved[k] != null && saved[k] !== '' ? saved[k] : (env[KEYS[k].env] || '')).trim(); }
  function from(k) { return saved[k] != null && saved[k] !== '' ? 'หน้าเว็บ' : env[KEYS[k].env] ? 'ตัวแปรระบบ' : ''; }
  function staff() { return get('line_staff').split(/[,\s]+/).map(x => x.trim()).filter(Boolean); }

  /* คืนรายการที่เปลี่ยน — ค่าว่าง "" = ล้างค่าที่ตั้งในหน้าเว็บ (กลับไปใช้ env ถ้ามี) · ไม่ส่งคีย์ = ไม่แตะ */
  function update(patch) {
    const changed = [];
    for (const k of Object.keys(KEYS)) {
      if (!(k in patch)) continue;
      let v = patch[k] == null ? '' : String(patch[k]).trim();
      if (k === 'market_feed_url' && v && !/^https:\/\/[^\s]+$/i.test(v)) throw new Error('ที่อยู่ feed ต้องขึ้นต้นด้วย https://');
      if (k === 'line_token' && v && (v.length < 40 || /\s/.test(v))) throw new Error('Channel access token ดูไม่ถูกต้อง (สั้นเกินไปหรือมีช่องว่าง) — คัดลอกจาก LINE Developers ทั้งก้อน');
      if (k === 'line_secret' && v && !/^[0-9a-f]{32}$/i.test(v)) throw new Error('Channel secret ต้องเป็นตัวอักษร/เลข 32 ตัว');
      if (k === 'line_admin' && v && !/^U[0-9a-f]{32}$/i.test(v)) throw new Error('LINE userId ต้องขึ้นต้นด้วย U ตามด้วย 32 ตัว');
      if (k === 'line_staff') { const l = v.split(/[,\s]+/).filter(Boolean); if (l.some(x => !/^U[0-9a-f]{32}$/i.test(x))) throw new Error('LINE userId ของทีมงานต้องขึ้นต้นด้วย U ตามด้วย 32 ตัว (คั่นด้วยจุลภาค)'); v = l.join(','); }
      if ((saved[k] || '') !== v) { saved[k] = v; changed.push(k); }
    }
    if (changed.length) {
      if (!file) throw new Error('ไม่มีโฟลเดอร์เก็บการตั้งค่า');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(saved, null, 1), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
    }
    return changed;
  }

  /* มุมมองสำหรับหน้าเว็บ — ไม่มีความลับ */
  function view() {
    const o = {};
    for (const k of Object.keys(KEYS)) {
      const v = get(k);
      o[k] = KEYS[k].secret ? { set: !!v, hint: v ? '…' + v.slice(-4) : '', from: from(k) } : { set: !!v, value: v, from: from(k) };
    }
    return o;
  }
  return { get, staff, update, view, from, KEYS };
}
module.exports = { createSettings };
