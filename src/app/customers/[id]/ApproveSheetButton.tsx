'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { approveCustomerPriceSheet, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending}>
      {pending ? 'กำลังอนุมัติ...' : 'อนุมัติทั้งชีท — ส่งให้ Sales ได้'}
    </button>
  );
}

export function ApproveSheetButton({ sheetId }: { sheetId: string }) {
  const [state, formAction] = useFormState(approveCustomerPriceSheet, initial);

  return (
    <form action={formAction} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input type="hidden" name="sheetId" value={sheetId} />
      <SubmitButton />
      {state.error && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{state.error}</span>}
    </form>
  );
}
