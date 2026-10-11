'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { respondToQuoteLine, type PublicActionResult } from './actions';
import styles from './quote.module.css';

const initial: PublicActionResult = { ok: false };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.acceptButton} disabled={pending}>
      {pending ? '...' : label}
    </button>
  );
}

export function ResponseForm({ token, quoteLineId }: { token: string; quoteLineId: string }) {
  const [negotiating, setNegotiating] = useState(false);
  const [state, formAction] = useFormState(respondToQuoteLine, initial);

  if (!negotiating) {
    return (
      <div className={styles.actions}>
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="quoteLineId" value={quoteLineId} />
          <input type="hidden" name="action" value="ACCEPT" />
          <SubmitButton label="ยอมรับ" />
        </form>
        <button type="button" className={styles.negotiateButton} onClick={() => setNegotiating(true)}>
          เจรจาราคา
        </button>
        {state.error && <p className={styles.error}>{state.error}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.negotiateForm}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="quoteLineId" value={quoteLineId} />
      <input type="hidden" name="action" value="NEGOTIATE" />
      <input type="number" name="requestedPrice" placeholder="ราคาที่ต้องการ" min={0} required />
      <input type="text" name="reason" placeholder="เหตุผล (ถ้ามี)" />
      <SubmitButton label="ส่งคำขอเจรจา" />
      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
