// Login do portal: uma senha (ADMIN_PASSWORD) e um cookie assinado válido por 7 dias.
// Visitantes do link /demo recebem outro cookie, que só dá acesso à clínica de demonstração deles.
import type { Env } from './db';

export const COOKIE = 'ac_session';
export const DEMO_COOKIE = 'ac_demo';
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

function readCookie(cookieHeader: string | null, name: string): string | null {
  const match = (cookieHeader ?? '').split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

/** Cookie da demonstração: "<id da clínica>.<expira>.<assinatura>". */
export async function createDemoSession(env: Env, clinicId: number, maxAge: number): Promise<string> {
  const payload = `${clinicId}.${Math.floor(Date.now() / 1000) + maxAge}`;
  const sig = await hmacHex(`demo:${env.ADMIN_PASSWORD}`, payload);
  return `${DEMO_COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearDemoSession(): string {
  return `${DEMO_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** ID da clínica de demonstração deste visitante, ou null. */
export async function demoClinicId(env: Env, cookieHeader: string | null): Promise<number | null> {
  const value = readCookie(cookieHeader, DEMO_COOKIE);
  if (!env.ADMIN_PASSWORD || !value) return null;
  const [id, exp, sig] = value.split('.');
  if (!id || !exp || !sig || Number(exp) < Date.now() / 1000) return null;
  return equal(sig, await hmacHex(`demo:${env.ADMIN_PASSWORD}`, `${id}.${exp}`)) ? Number(id) : null;
}

export async function isLoggedIn(env: Env, cookieHeader: string | null): Promise<boolean> {
  const value = readCookie(cookieHeader, COOKIE);
  if (!env.ADMIN_PASSWORD || !value) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return equal(sig, await hmacHex(`session:${env.ADMIN_PASSWORD}`, exp));
}
