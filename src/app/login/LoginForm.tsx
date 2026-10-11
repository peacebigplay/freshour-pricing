'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';
import styles from './login.module.css';
import sharedStyles from '@/components/ui/shared.module.css';

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={sharedStyles.primaryButton} disabled={pending} style={{ width: '100%' }}>
      {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
    </button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="next" value={next ?? ''} />
      <label className={styles.field}>
        <span>อีเมล</span>
        <input type="email" name="email" required autoComplete="email" placeholder="name@freshour.co.th" />
      </label>
      <label className={styles.field}>
        <span>รหัสผ่าน</span>
        <input type="password" name="password" required autoComplete="current-password" placeholder="••••••••" />
      </label>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
