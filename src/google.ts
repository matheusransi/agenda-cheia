// Acesso ao Google Agenda com uma conta de serviço. A clínica compartilha a agenda com o e-mail dessa conta.
import type { Env } from './db';

type ServiceAccount = { client_email: string; private_key: string };

export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const API = 'https://www.googleapis.com/calendar/v3';
let cachedToken: { token: string; expires: number } | null = null;

export function serviceAccount(env: Env): ServiceAccount | null {
  if (!env.GOOGLE_SERVICE_ACCOUNT) return null;
  try {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as ServiceAccount;
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function accessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const sa = serviceAccount(env);
  if (!sa) throw new Error('Conta de serviço do Google não configurada.');

  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google recusou o acesso: ${data.error_description || res.status}`);
  cachedToken = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function call<T>(env: Env, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${await accessToken(env)}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404) throw new Error('Agenda não encontrada. Confira o ID e se ela foi compartilhada com a conta de serviço.');
    if (res.status === 403) throw new Error('Sem permissão na agenda. Compartilhe com a opção "Fazer alterações nos eventos".');
    throw new Error(`Erro do Google Agenda (${res.status}): ${text.slice(0, 200)}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export async function listEvents(env: Env, calendarId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({
      timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const data = await call<{ items?: CalendarEvent[]; nextPageToken?: string }>(env, 'GET', `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return events.filter((e) => e.status !== 'cancelled');
}

export async function moveEvent(env: Env, calendarId: string, eventId: string, start: Date, end: Date): Promise<void> {
  await call(env, 'PATCH', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  });
}

export async function createEvent(env: Env, calendarId: string, summary: string, description: string, start: Date, end: Date): Promise<string> {
  const ev = await call<CalendarEvent>(env, 'POST', `/calendars/${encodeURIComponent(calendarId)}/events`, {
    summary, description, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() },
  });
  return ev.id;
}
