/**
 * operator-auth.ts
 * Server-side only. JWT + bcrypt helpers for Contact Operator authentication.
 * Completely independent of Supabase Auth / admin session.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import type { OperatorSession } from './types';

const JWT_SECRET = process.env.OPERATOR_JWT_SECRET || 'rathayatra-operator-secret-2026';
const COOKIE_NAME = 'operator-session';
const TOKEN_EXPIRY = '12h';

// ─── Password Hashing ───────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── JWT Token ───────────────────────────────────────────────────────────────

export function createOperatorToken(payload: Omit<OperatorSession, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyOperatorToken(token: string): OperatorSession | null {
  try {
    return jwt.verify(token, JWT_SECRET) as OperatorSession;
  } catch {
    return null;
  }
}

// ─── Cookie Session ──────────────────────────────────────────────────────────

/**
 * Set operator session cookie (call from API route response).
 * Returns the Set-Cookie header value.
 */
export function buildSessionCookieHeader(token: string): string {
  const maxAge = 60 * 60 * 12; // 12 hours in seconds
  const isProduction = process.env.NODE_ENV === 'production';
  return [
    `${COOKIE_NAME}=${token}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    isProduction ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function buildClearCookieHeader(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`;
}

/**
 * Read and verify operator session from the request cookies.
 * Returns the decoded session, or null if missing/invalid/expired.
 */
export async function getOperatorSessionFromCookies(): Promise<OperatorSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyOperatorToken(token);
  } catch {
    return null;
  }
}

/**
 * Extract operator session from an Authorization header OR cookie string.
 * Used in API routes that receive the raw Request object.
 */
export function getOperatorSessionFromRequest(req: Request): OperatorSession | null {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifyOperatorToken(decodeURIComponent(match[1]));
}
