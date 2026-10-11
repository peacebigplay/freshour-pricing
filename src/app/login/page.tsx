import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { LoginForm } from './LoginForm';
import styles from './login.module.css';

const ROLE_HOME: Record<string, string> = {
  EXECUTIVE: '/exec',
  PRICING: '/pricing',
  SALES: '/sales',
  ADMIN: '/admin',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role] ?? '/');

  const { next } = await searchParams;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>F</span>
          <div>
            <b>Freshour</b>
            <span>ระบบตั้งราคาและออกราคา</span>
          </div>
        </div>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
