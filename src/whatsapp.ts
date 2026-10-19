// Comunicação com a API oficial do WhatsApp (WhatsApp Cloud API, da Meta).
import type { Env } from './db';

const GRAPH = 'https://graph.facebook.com/v24.0';

export type Button = { id: string; title: string };

/** Mensagem a enviar. `template` é obrigatório fora da janela de 24h; os outros tipos só valem dentro dela. */
export type Outgoing =
  | { kind: 'template'; name: string; params: string[]; buttons?: Button[]; preview: string }
  | { kind: 'buttons'; text: string; buttons: Button[] }
  | { kind: 'list'; text: string; buttonLabel: string; buttons: Button[] }
  | { kind: 'text'; text: string };

export function whatsappConfigured(env: Env): boolean {
  return Boolean(env.WHATSAPP_TOKEN);
}

function payloadFor(to: string, msg: Outgoing): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  switch (msg.kind) {
    case 'template': {
      const components: unknown[] = [];
      if (msg.params.length) components.push({ type: 'body', parameters: msg.params.map((text) => ({ type: 'text', text })) });
      (msg.buttons ?? []).forEach((b, index) => {
        components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload: b.id }] });
      });
      return { ...base, type: 'template', template: { name: msg.name, language: { code: 'pt_BR' }, components } };
    }
    case 'buttons':
      return {
        ...base, type: 'interactive',
        interactive: {
          type: 'button', body: { text: msg.text },
          action: { buttons: msg.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
        },
      };
    case 'list':
      return {
        ...base, type: 'interactive',
        interactive: {
          type: 'list', body: { text: msg.text },
          action: {
            button: msg.buttonLabel.slice(0, 20),
            sections: [{ title: 'Opções', rows: msg.buttons.slice(0, 10).map((b) => ({ id: b.id, title: b.title.slice(0, 24) })) }],
          },
        },
      };
    case 'text':
      return { ...base, type: 'text', text: { body: msg.text, preview_url: false } };
  }
}

/** Envia de verdade pela API. Retorna o id da mensagem na Meta. */
export async function sendWhatsApp(env: Env, phoneNumberId: string, to: string, msg: Outgoing): Promise<string> {
  if (!env.WHATSAPP_TOKEN) throw new Error('WHATSAPP_TOKEN não configurado.');
  if (!phoneNumberId) throw new Error('A clínica não tem o ID do número do WhatsApp configurado.');
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(payloadFor(to, msg)),
  });
  const data = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } };
  if (!res.ok || !data.messages?.length) {
    throw new Error(`WhatsApp recusou (${data.error?.code ?? res.status}): ${data.error?.message ?? 'erro desconhecido'}`);
  }
  return data.messages[0].id;
}

/** Confere a assinatura X-Hub-Signature-256 que a Meta envia em cada webhook. */
export async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type Inbound = { phoneNumberId: string; from: string; waId: string; replyId?: string; text?: string };
export type StatusUpdate = { waId: string; status: string; error?: string };

/** Extrai mensagens recebidas e atualizações de status do corpo do webhook. */
export function parseWebhook(body: unknown): { inbound: Inbound[]; statuses: StatusUpdate[] } {
  const inbound: Inbound[] = [];
  const statuses: StatusUpdate[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as Array<{ changes?: Array<{ value?: Record<string, any> }> }>) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneNumberId: string = value.metadata?.phone_number_id ?? '';
      for (const m of value.messages ?? []) {
        const item: Inbound = { phoneNumberId, from: String(m.from ?? ''), waId: String(m.id ?? '') };
        if (m.type === 'button') {
          item.replyId = m.button?.payload;
          item.text = m.button?.text;
        } else if (m.type === 'interactive') {
          const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
          item.replyId = r?.id;
          item.text = r?.title;
        } else if (m.type === 'text') {
          item.text = m.text?.body;
        } else {
          item.text = `[${m.type ?? 'mensagem'}]`;
        }
        inbound.push(item);
      }
      for (const s of value.statuses ?? []) {
        statuses.push({ waId: String(s.id ?? ''), status: String(s.status ?? ''), error: s.errors?.[0]?.title ?? s.errors?.[0]?.message });
      }
    }
  }
  return { inbound, statuses };
}
