// Login do portal: uma senha (ADMIN_PASSWORD) e um cookie assinado válido por 7 dias.
import type { Env } from './db';

export const COOKIE = 'ac_session';
const MAX_AGE = 7 * 24 * 3600;

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(env: Env, password: string): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  // Compara os HMACs para o tempo de resposta não revelar a senha.
  const [a, b] = await Promise.all([hmacHex('login', password), hmacHex('login', env.ADMIN_PASSWORD)]);
  return equal(a, b);
}

export async function createSession(env: Env): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const sig = await hmacHex(`session:${env.ADMIN_PASSWORD}`, String(exp));
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSession(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function isLoggedIn(env: Env, cookieHeader: string | null): Promise<boolean> {
  if (!env.ADMIN_PASSWORD || !cookieHeader) return false;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return false;
  const [exp, sig] = match.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return equal(sig, await hmacHex(`session:${env.ADMIN_PASSWORD}`, exp));
}
