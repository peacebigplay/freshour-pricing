'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { respondToQuoteLine, type PublicActionResult } from './actions';

const initial: PublicActionResult = { ok: false };

function SubmitButton({ label, accept }: { label: string; accept?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={accept ? 'accept' : undefined} disabled={pending}>
      {pending ? '...' : label}
    </button>
  );
}

export function ResponseForm({ token, quoteLineId }: { token: string; quoteLineId: string }) {
  const [negotiating, setNegotiating] = useState(false);
  const [state, formAction] = useFormState(respondToQuoteLine, initial);

  if (!negotiating) {
    return (
      <>
        <form action={formAction} style={{ display: 'inline' }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="quoteLineId" value={quoteLineId} />
          <input type="hidden" name="action" value="ACCEPT" />
          <SubmitButton label="ยอมรับ" accept />
        </form>
        <button type="button" onClick={() => setNegotiating(true)}>
          เจรจาราคา
        </button>
        {state.error && <p style={{ fontSize: 10.5, color: 'var(--red)', width: '100%' }}>{state.error}</p>}
      </>
    );
  }

  return (
    <form
      action={formAction}
      style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', width: '100%' }}
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="quoteLineId" value={quoteLineId} />
      <input type="hidden" name="action" value="NEGOTIATE" />
      <input
        type="number"
        name="requestedPrice"
        placeholder="ราคาที่ต้องการ"
        min={0}
        required
        style={{ fontFamily: 'var(--ff)', fontSize: 10.5, border: '1px solid var(--line)', borderRadius: 8, padding: '5px 8px', width: 110 }}
      />
      <input
        type="text"
        name="reason"
        placeholder="เหตุผล (ถ้ามี)"
        style={{ fontFamily: 'var(--ff)', fontSize: 10.5, border: '1px solid var(--line)', borderRadius: 8, padding: '5px 8px', width: 110 }}
      />
      <SubmitButton label="ส่งคำขอเจรจา" />
      {state.error && <p style={{ fontSize: 10.5, color: 'var(--red)' }}>{state.error}</p>}
    </form>
  );
}
