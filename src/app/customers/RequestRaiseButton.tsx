'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { requestPriceChange, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';
import styles from './customers.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending} style={{ padding: '4px 10px', fontSize: 11.5 }}>
      {pending ? '...' : 'ส่งคำขอ'}
    </button>
  );
}

export function RequestRaiseButton({
  customerId,
  productId,
  productName,
  customerName,
  lockedPrice,
  currentCost,
  targetPct,
  suggestedPrice,
}: {
  customerId: string;
  productId: string;
  productName: string;
  customerName: string;
  lockedPrice: number;
  currentCost: number;
  targetPct: number;
  suggestedPrice: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(requestPriceChange, initial);

  if (state.ok) {
    return <span className={styles.sentTag}>✓ ส่งคำขอแล้ว</span>;
  }

  if (!open) {
    return (
      <button type="button" className={styles.askBtn} onClick={() => setOpen(true)}>
        ขอปรับราคา
      </button>
    );
  }

  return (
    <form action={formAction} className={styles.askForm}>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="originalPrice" value={lockedPrice} />
      <input type="hidden" name="currentCost" value={currentCost} />
      <input type="hidden" name="targetPct" value={targetPct} />
      <p className={styles.askTitle}>
        ขอปรับราคา {productName} · {customerName}
      </p>
      <p className={styles.askHint}>
        ล็อกอยู่ {lockedPrice.toLocaleString('th-TH')} ฿ · ทุนวันนี้ {currentCost.toLocaleString('th-TH')} ฿ · ราคาที่ถึง Target หมวด{' '}
        {targetPct.toFixed(1)}% = <b>{suggestedPrice.toLocaleString('th-TH')} ฿</b>
      </p>
      <div className={styles.askRow}>
        <input type="number" name="requestedPrice" defaultValue={suggestedPrice} min={0} step="1" className={styles.askInput} />
        <SubmitButton />
        <button type="button" className={styles.cancelBtn} onClick={() => setOpen(false)}>
          ยกเลิก
        </button>
      </div>
      <input type="text" name="reason" placeholder="เหตุผล (ไม่บังคับ)" className={styles.reasonInput} />
      {state.error && <span className={styles.errorText}>{state.error}</span>}
    </form>
  );
}
