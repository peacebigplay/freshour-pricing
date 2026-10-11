'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { resolveMapping, type ResolveResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ResolveResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.ghostButton} disabled={pending}>
      {pending ? '...' : 'ยืนยัน'}
    </button>
  );
}

export function ResolveMappingForm({
  queueId,
  candidates,
}: {
  queueId: string;
  candidates: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(resolveMapping, initial);

  return (
    <form action={formAction} style={{ display: 'flex', gap: 6 }}>
      <input type="hidden" name="queueId" value={queueId} />
      <select name="productId" style={{ padding: '4px 6px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}>
        <option value="">— เลือกสินค้า —</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <SubmitButton />
      {state.error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{state.error}</span>}
    </form>
  );
}
