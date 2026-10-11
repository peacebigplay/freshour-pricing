import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import type { Role } from '@/lib/domain/rbac';

const SESSION_COOKIE_NAME = 'freshour_session';

export interface SessionPayload {
  sub: string; // user id
  role: Role;
  sid: string; // session row id, lets us revoke server-side
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET must be set to a long random value.');
  }
  return new TextEncoder().encode(secret);
}

export function getSessionTtlSeconds(): number {
  const raw = process.env.SESSION_TTL_SECONDS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8 * 60 * 60;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const ttl = getSessionTtlSeconds();
  return new SignJWT({ role: payload.role, sid: payload.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || !payload.role || !payload.sid) return null;
    return { sub: payload.sub, role: payload.role as Role, sid: payload.sid as string };
  } catch {
    return null;
  }
}

/** Opaque random token given to the browser; only its hash is ever stored server-side. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export { SESSION_COOKIE_NAME };
