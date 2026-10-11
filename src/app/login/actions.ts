'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME, getSessionTtlSeconds, signSessionToken } from '@/lib/auth/session';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

const ROLE_HOME: Record<string, string> = {
  EXECUTIVE: '/exec',
  PRICING: '/pricing',
  SALES: '/sales',
  ADMIN: '/admin',
};

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  });

  if (!parsed.success) {
    return { error: 'กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง' };
  }

  const { email, password, next } = parsed.data;

  // Generic error message on every failure path — never reveal whether the
  // email exists, to avoid account enumeration.
  const genericError = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active) {
    return { error: genericError };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    return { error: genericError };
  }

  const ttl = getSessionTtlSeconds();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: '', // replaced immediately below once we know the session id
      expiresAt: new Date(Date.now() + ttl * 1000),
    },
  });

  const token = await signSessionToken({ sub: user.id, role: user.role, sid: session.id });

  // We store a hash of the JWT itself so a stolen DB row alone can't forge a
  // cookie, and so we can look sessions up by id for the revocation check.
  const { hashToken } = await import('@/lib/auth/session');
  await prisma.session.update({ where: { id: session.id }, data: { tokenHash: hashToken(token) } });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await prisma.auditEvent.create({
    data: {
      actorUserId: user.id,
      entityType: 'Session',
      entityId: session.id,
      action: 'login',
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ttl,
  });

  redirect(next && next.startsWith('/') ? next : (ROLE_HOME[user.role] ?? '/login'));
}
