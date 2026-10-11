'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { createCustomer, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';
import styles from './customers.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending} style={{ padding: '6px 14px', fontSize: 12.5 }}>
      {pending ? 'กำลังเพิ่ม...' : 'เพิ่มลูกค้า'}
    </button>
  );
}

export function NewCustomerForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createCustomer, initial);

  if (!open) {
    return (
      <button type="button" className={styles.askBtn} onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
        + ลูกค้าใหม่
      </button>
    );
  }

  if (state.ok) {
    return <p className={styles.sentTag} style={{ marginBottom: 16, display: 'block' }}>✓ เพิ่มลูกค้าแล้ว</p>;
  }

  return (
    <form action={formAction} className={styles.askForm} style={{ marginBottom: 20, maxWidth: 480 }}>
      <p className={styles.askTitle}>+ ลูกค้าใหม่</p>
      <div className={styles.askRow}>
        <input type="text" name="name" placeholder="ชื่อร้าน / บริษัท" required className={styles.reasonInput} style={{ flex: 1 }} />
      </div>
      <div className={styles.askRow}>
        <input type="text" name="code" placeholder="รหัสลูกค้า เช่น CUST-001" required className={styles.reasonInput} style={{ flex: 1 }} />
        <input type="text" name="channel" placeholder="ช่องทาง (ไม่บังคับ)" className={styles.reasonInput} style={{ flex: 1 }} />
      </div>
      <div className={styles.askRow}>
        <SubmitButton />
        <button type="button" className={styles.cancelBtn} onClick={() => setOpen(false)}>
          ยกเลิก
        </button>
      </div>
      {state.error && <span className={styles.errorText}>{state.error}</span>}
    </form>
  );
}
