'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className="out"
      style={{ border: 0, width: '100%', background: 'none', cursor: 'pointer', font: 'inherit' }}
      disabled={pending}
      onClick={() => {
        start(async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          router.push('/login');
          router.refresh();
        });
      }}
    >
      ออกจากระบบ
    </button>
  );
}
