'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { sendQuoteFromCustomerSheet, type SendQuoteResult } from './actions';
import sharedStyles from '@/components/ui/shared.module.css';

const initial: SendQuoteResult = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending}>
      {pending ? 'กำลังส่ง...' : 'ส่งราคาให้ลูกค้า'}
    </button>
  );
}

export function SendQuoteButton({ customerPriceSheetId }: { customerPriceSheetId: string }) {
  const [state, formAction] = useFormState(sendQuoteFromCustomerSheet, initial);

  if (state.ok && state.publicUrl) {
    return (
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontSize: 11, color: 'var(--success)', marginBottom: 4 }}>ส่งลิงก์ใบเสนอราคาแล้ว</p>
        <Link href={`/sales/quotes/${state.quoteId}`} className={sharedStyles.ghostButton}>
          ดูใบเสนอราคา
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="customerPriceSheetId" value={customerPriceSheetId} />
      <SubmitButton />
      {state.error && <p style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{state.error}</p>}
    </form>
  );
}
