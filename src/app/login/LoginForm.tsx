'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="go" disabled={pending}>
      {pending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
    </button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="lgp">
      <input type="hidden" name="next" value={next ?? ''} />
      <label htmlFor="email">อีเมล</label>
      <input id="email" type="email" name="email" required autoComplete="email" placeholder="name@freshour.co.th" />
      <label htmlFor="password" style={{ marginTop: 13 }}>
        รหัสผ่าน
      </label>
      <input id="password" type="password" name="password" required autoComplete="current-password" placeholder="••••••••" />
      <SubmitButton />
      {state.error && <p className="msg bad">{state.error}</p>}
    </form>
  );
}
