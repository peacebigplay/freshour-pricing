'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { closeDealAndHandoff, type ActionResult } from '../../actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending}>
      {pending ? 'กำลังปิดดีล...' : 'Close Deal & Send Financial Handoff'}
    </button>
  );
}

export function CloseDealButton({ quoteId }: { quoteId: string }) {
  const [state, formAction] = useFormState(closeDealAndHandoff, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <SubmitButton />
      {state.error && <p style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{state.error}</p>}
      {state.ok && <p style={{ color: 'var(--success)', fontSize: 11, marginTop: 4 }}>ปิดดีลสำเร็จ</p>}
    </form>
  );
}
