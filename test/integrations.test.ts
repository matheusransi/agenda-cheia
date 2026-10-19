import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/db';
import { listEvents } from '../src/google';
import { parseWebhook, verifySignature } from '../src/whatsapp';

async function fakeServiceAccount(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const b64 = Buffer.from(der).toString('base64').match(/.{1,64}/g)!.join('\n');
  return JSON.stringify({ client_email: 'agenda@teste.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` });
}

afterEach(() => vi.unstubAllGlobals());

describe('Google Agenda', () => {
  it('assina o JWT da conta de serviço e lista eventos', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      return new Response(JSON.stringify({ items: [{ id: 'e1', summary: 'Maria - Limpeza', start: { dateTime: '2026-10-20T11:00:00Z' } }] }));
    });
    const env = { GOOGLE_SERVICE_ACCOUNT: await fakeServiceAccount() } as Env;
    const events = await listEvents(env, 'clinica@group.calendar.google.com', new Date('2026-10-19T00:00:00Z'), new Date('2026-10-30T00:00:00Z'));
    expect(events.map((e) => e.id)).toEqual(['e1']);
    const assertion = new URLSearchParams(String(calls[0].init?.body)).get('assertion')!;
    const claims = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
    expect(claims.iss).toBe('agenda@teste.iam.gserviceaccount.com');
    expect(calls[1].url).toContain('/calendars/clinica%40group.calendar.google.com/events?');
    expect((calls[1].init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
});

describe('Webhook do WhatsApp', () => {
  it('confere a assinatura da Meta', async () => {
    const body = '{"a":1}';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('segredo'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).toString('hex');
    expect(await verifySignature('segredo', body, `sha256=${sig}`)).toBe(true);
    expect(await verifySignature('outro', body, `sha256=${sig}`)).toBe(false);
    expect(await verifySignature('segredo', body, null)).toBe(false);
  });

  it('lê botões, listas, textos e status', () => {
    const value = (v: object) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '999' }, ...v } }] }] });
    expect(parseWebhook(value({ messages: [{ from: '5511987650001', id: 'w1', type: 'button', button: { payload: 'c:1', text: 'Confirmar' } }] })).inbound[0])
      .toEqual({ phoneNumberId: '999', from: '5511987650001', waId: 'w1', replyId: 'c:1', text: 'Confirmar' });
    expect(parseWebhook(value({ messages: [{ from: '1', id: 'w2', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 's:3:100', title: 'Qua 21/10' } } }] })).inbound[0].replyId)
      .toBe('s:3:100');
    expect(parseWebhook(value({ messages: [{ from: '1', id: 'w3', type: 'text', text: { body: 'vou sim' } }] })).inbound[0].text).toBe('vou sim');
    expect(parseWebhook(value({ statuses: [{ id: 'w4', status: 'failed', errors: [{ title: 'Número inválido' }] }] })).statuses[0])
      .toEqual({ waId: 'w4', status: 'failed', error: 'Número inválido' });
  });
});
