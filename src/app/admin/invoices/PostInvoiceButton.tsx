'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { postInvoice, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.ghostButton} disabled={pending}>
      {pending ? '...' : 'Post'}
    </button>
  );
}

export function PostInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [state, formAction] = useFormState(postInvoice, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton />
      {state.error && <span style={{ color: 'var(--danger)', fontSize: 10.5 }}>{state.error}</span>}
    </form>
  );
}
