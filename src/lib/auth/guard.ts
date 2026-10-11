import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './currentUser';
import type { Role } from '@/lib/domain/rbac';

/**
 * For use in Server Component layouts. Redirects to /login (or the user's
 * own home if their role doesn't match) instead of throwing, since layouts
 * render before an error boundary would give a good UX for this case.
 */
export async function requireRoleOrRedirect(roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!roles.includes(user.role)) {
    const home: Record<Role, string> = {
      EXECUTIVE: '/exec',
      PRICING: '/pricing',
      SALES: '/sales',
      ADMIN: '/admin',
    };
    redirect(home[user.role]);
  }
  return user;
}
