'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './shared.module.css';

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className={styles.ghostButton}
      disabled={pending}
      onClick={() => {
        start(async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          router.push('/login');
          router.refresh();
        });
      }}
    >
      ออก
    </button>
  );
}
