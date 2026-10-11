'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { resolveException, type ActionResult } from './actions';
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

export function ResolveExceptionButton({ exceptionId }: { exceptionId: string }) {
  const [, formAction] = useFormState(resolveException, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <SubmitButton />
    </form>
  );
}
