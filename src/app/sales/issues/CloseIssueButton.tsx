'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { closeCustomerIssue, type ActionResult } from './actions';
import styles from './issues.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.closeBtn} disabled={pending}>
      {pending ? '...' : 'ปิดเคส'}
    </button>
  );
}

export function CloseIssueButton({ issueId }: { issueId: string }) {
  const [, formAction] = useFormState(closeCustomerIssue, initial);
  return (
    <form action={formAction}>
      <input type="hidden" name="issueId" value={issueId} />
      <SubmitButton />
    </form>
  );
}
