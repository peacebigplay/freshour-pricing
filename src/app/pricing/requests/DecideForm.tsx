'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { approvePriceRequest, rejectPriceRequest, type ActionResult } from './actions';

const initial: ActionResult = { ok: false };

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn pri" disabled={pending}>
      {pending ? '...' : '✓ อนุมัติ'}
    </button>
  );
}

function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? '...' : 'ไม่รับราคา'}
    </button>
  );
}

export function DecideForm({ requestId, suggestedPrice }: { requestId: string; suggestedPrice: number }) {
  const [approveState, approveAction] = useFormState(approvePriceRequest, initial);
  const [rejectState, rejectAction] = useFormState(rejectPriceRequest, initial);
  const [price, setPrice] = useState(suggestedPrice);

  return (
    <>
      <form action={approveAction} style={{ display: 'flex', gap: 6 }}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="number" name="finalPrice" value={price} min={0} step="1" onChange={(e) => setPrice(Number(e.target.value))} className="qin" />
        <ApproveButton />
      </form>
      <form action={rejectAction}>
        <input type="hidden" name="requestId" value={requestId} />
        <RejectButton />
      </form>
      {approveState.error && <span style={{ color: 'var(--red)', fontSize: 11 }}>{approveState.error}</span>}
      {rejectState.error && <span style={{ color: 'var(--red)', fontSize: 11 }}>{rejectState.error}</span>}
    </>
  );
}
