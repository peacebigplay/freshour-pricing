'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { approveCentralPriceLine, type ApproveResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ApproveResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending} style={{ padding: '4px 10px', fontSize: 12 }}>
      {pending ? '...' : 'อนุมัติ'}
    </button>
  );
}

export function ApproveForm({
  lineId,
  version,
  defaultPrice,
}: {
  lineId: string;
  version: number;
  defaultPrice: number;
}) {
  const [state, formAction] = useFormState(approveCentralPriceLine, initial);
  const [price, setPrice] = useState(defaultPrice);

  return (
    <form action={formAction} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input
        type="number"
        name="approvedPrice"
        value={price}
        min={0}
        step="1"
        onChange={(e) => setPrice(Number(e.target.value))}
        style={{ width: 72, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
      />
      <SubmitButton />
      {state.error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{state.error}</span>}
    </form>
  );
}
