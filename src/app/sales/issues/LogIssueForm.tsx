'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { logCustomerIssue, type ActionResult } from './actions';
import { CUSTOMER_ISSUE_TYPES } from '@/lib/queries/issues';
import sharedStyles from '@/components/ui/shared.module.css';
import styles from './issues.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending}>
      {pending ? 'กำลังบันทึก...' : 'บันทึกปัญหา'}
    </button>
  );
}

export function LogIssueForm({ customers }: { customers: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(logCustomerIssue, initial);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.formRow}>
        <select name="customerId" required defaultValue="" className={styles.select}>
          <option value="" disabled>
            เลือกลูกค้า
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select name="type" required defaultValue="" className={styles.select}>
          <option value="" disabled>
            ประเภทปัญหา
          </option>
          {CUSTOMER_ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select name="severity" required defaultValue="MID" className={styles.select}>
          <option value="LOW">ความรุนแรงต่ำ</option>
          <option value="MID">ความรุนแรงกลาง</option>
          <option value="HIGH">ความรุนแรงสูง</option>
        </select>
      </div>

      <textarea name="detail" required rows={3} placeholder="รายละเอียดปัญหา" className={styles.textarea} />

      <div className={styles.formFooter}>
        <SubmitButton />
        {state.error && <span className={styles.errorText}>{state.error}</span>}
      </div>
    </form>
  );
}
