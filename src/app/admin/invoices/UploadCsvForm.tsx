'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { uploadInvoiceCsv, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending}>
      {pending ? 'กำลังนำเข้า...' : 'นำเข้า CSV'}
    </button>
  );
}

export function UploadCsvForm() {
  const [state, formAction] = useFormState(uploadInvoiceCsv, initial);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea
        name="csv"
        rows={6}
        placeholder="invoiceNumber,customerCode,productAlias,quantity,unit,netSales,recognizedCost,invoiceDate"
        style={{ fontFamily: 'monospace', fontSize: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}
      />
      <div>
        <SubmitButton />
      </div>
      {state.error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{state.error}</p>}
      {state.summary && <p style={{ color: 'var(--success)', fontSize: 12 }}>{state.summary}</p>}
    </form>
  );
}
