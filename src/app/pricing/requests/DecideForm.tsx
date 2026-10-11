'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { approvePriceRequest, rejectPriceRequest, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';
import styles from './requests.module.css';

const initial: ActionResult = { ok: false };

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending} style={{ padding: '5px 12px', fontSize: 12 }}>
      {pending ? '...' : '✓ อนุมัติ'}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.rejectBtn} disabled={pending}>
      {pending ? '...' : 'ปฏิเสธ'}
    </button>
  );
}

export function DecideForm({ requestId, suggestedPrice }: { requestId: string; suggestedPrice: number }) {
  const [approveState, approveAction] = useFormState(approvePriceRequest, initial);
  const [rejectState, rejectAction] = useFormState(rejectPriceRequest, initial);
  const [price, setPrice] = useState(suggestedPrice);

  return (
    <div className={styles.decideWrap}>
      <form action={approveAction} className={styles.approveRow}>
        <input type="hidden" name="requestId" value={requestId} />
        <input
          type="number"
          name="finalPrice"
          value={price}
          min={0}
          step="1"
          onChange={(e) => setPrice(Number(e.target.value))}
          className={styles.priceInput}
        />
        <ApproveButton />
      </form>
      <form action={rejectAction}>
        <input type="hidden" name="requestId" value={requestId} />
        <RejectButton />
      </form>
      {approveState.error && <span className={styles.errorText}>{approveState.error}</span>}
      {rejectState.error && <span className={styles.errorText}>{rejectState.error}</span>}
    </div>
  );
}
