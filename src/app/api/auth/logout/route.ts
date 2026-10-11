import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
      await prisma.session.update({
        where: { id: payload.sid },
        data: { revokedAt: new Date() },
      }).catch(() => undefined);
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
