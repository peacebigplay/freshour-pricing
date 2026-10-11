'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { generateCustomerSheets, type ActionResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: ActionResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.ghostButton} disabled={pending}>
      {pending ? 'กำลังสร้าง...' : 'สร้าง/อัปเดตชีทราคาลูกค้า'}
    </button>
  );
}

export function GenerateSheetsButton({ pricingRoundId }: { pricingRoundId: string }) {
  const [state, formAction] = useFormState(generateCustomerSheets, initial);

  return (
    <form action={formAction} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input type="hidden" name="pricingRoundId" value={pricingRoundId} />
      <SubmitButton />
      {state.ok && (
        <span style={{ fontSize: 12, color: 'var(--success)' }}>
          ✓ สร้างชีทใหม่ {state.createdSheets} ใบ · บรรทัดใหม่ {state.createdLines} รายการ
        </span>
      )}
      {state.error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{state.error}</span>}
    </form>
  );
}
