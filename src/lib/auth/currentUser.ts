import { cookies } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE_NAME, verifySessionToken } from './session';
import type { Role } from '@/lib/domain/rbac';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/**
 * Resolves the current authenticated user from the signed session cookie,
 * re-checking the server-side Session row so a revoked/expired session
 * (logout, admin deactivation) takes effect immediately even if the JWT
 * itself hasn't expired yet.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error('FORBIDDEN');
  return user;
}
