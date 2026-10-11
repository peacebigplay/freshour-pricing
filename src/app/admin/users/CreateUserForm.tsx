'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createUser, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending}>
      {pending ? 'กำลังสร้าง...' : 'สร้างผู้ใช้งาน'}
    </button>
  );
}

export function CreateUserForm() {
  const [state, formAction] = useFormState(createUser, initial);

  return (
    <form action={formAction} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div>
        <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>ชื่อ</label>
        <input name="name" required style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8 }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>อีเมล</label>
        <input name="email" type="email" required style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8 }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11.5, marginBottom: 4 }}>สิทธิ์</label>
        <select name="role" style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
          <option value="EXECUTIVE">EXECUTIVE</option>
          <option value="PRICING">PRICING</option>
          <option value="SALES">SALES</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>
      <SubmitButton />
      {state.error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{state.error}</p>}
      {state.temporaryPassword && (
        <p style={{ fontSize: 12, color: 'var(--success)' }}>
          สร้างสำเร็จ — รหัสผ่านชั่วคราว: <code>{state.temporaryPassword}</code>
        </p>
      )}
    </form>
  );
}
