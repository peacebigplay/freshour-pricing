'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { approveNegotiation, rejectNegotiation, type ActionResult } from './actions';
import { Card } from '@/components/ui/Card';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton({ label, variant }: { label: string; variant: 'primary' | 'ghost' }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={variant === 'primary' ? sharedStyles.primaryButton : sharedStyles.ghostButton} disabled={pending}>
      {pending ? '...' : label}
    </button>
  );
}

export function DecisionForm({ negotiationCaseId, defaultPrice }: { negotiationCaseId: string; defaultPrice: number }) {
  const [approveState, approveAction] = useFormState(approveNegotiation, initial);
  const [rejectState, rejectAction] = useFormState(rejectNegotiation, initial);
  const [price, setPrice] = useState(defaultPrice);

  return (
    <Card title="การตัดสินใจของ Pricing">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: 12.5 }}>ราคาสุดท้าย</label>
        <input
          type="number"
          value={price}
          min={0}
          onChange={(e) => setPrice(Number(e.target.value))}
          style={{ width: 100, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <form action={approveAction}>
          <input type="hidden" name="negotiationCaseId" value={negotiationCaseId} />
          <input type="hidden" name="finalPrice" value={price} />
          <SubmitButton label="อนุมัติ" variant="primary" />
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="negotiationCaseId" value={negotiationCaseId} />
          <input type="hidden" name="finalPrice" value={price} />
          <SubmitButton label="ปฏิเสธ" variant="ghost" />
        </form>
      </div>
      {(approveState.error || rejectState.error) && (
        <p style={{ color: 'var(--danger)', fontSize: 11, marginTop: 6 }}>{approveState.error || rejectState.error}</p>
      )}
    </Card>
  );
}
