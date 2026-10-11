'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { resolveDecision, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.ghostButton} disabled={pending}>
      {pending ? '...' : 'Resolve'}
    </button>
  );
}

export function ResolveButton({ decisionId }: { decisionId: string }) {
  const [, formAction] = useFormState(resolveDecision, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="decisionId" value={decisionId} />
      <SubmitButton />
    </form>
  );
}
