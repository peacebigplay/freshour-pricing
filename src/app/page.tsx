import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';

const ROLE_HOME: Record<string, string> = {
  EXECUTIVE: '/exec',
  PRICING: '/pricing',
  SALES: '/sales',
  ADMIN: '/admin',
};

export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? (ROLE_HOME[user.role] ?? '/login') : '/login');
}
