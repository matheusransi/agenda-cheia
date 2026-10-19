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

/** Token usado pela clínica: o preenchido no portal ou, se vazio, o segredo WHATSAPP_TOKEN. */
export function whatsappToken(env: Env, clinic: { wa_token?: string }): string {
  return (clinic.wa_token || env.WHATSAPP_TOKEN || '').trim();
}

/** Palavra que a Meta usa para confirmar o webhook. */
export function verifyToken(env: Env): string {
  return env.WHATSAPP_VERIFY_TOKEN || 'agendacheia';
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
export async function sendWhatsApp(token: string, phoneNumberId: string, to: string, msg: Outgoing): Promise<string> {
  if (!token) throw new Error('Token do WhatsApp não configurado.');
  if (!phoneNumberId) throw new Error('A clínica não tem o ID do número do WhatsApp configurado.');
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payloadFor(to, msg)),
  });
  const data = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } };
  if (!res.ok || !data.messages?.length) {
    if (data.error?.code === 190) throw new Error('Token do WhatsApp vencido ou inválido. Gere um novo na Meta e cole em Configurações.');
    const hint = data.error?.code === 131030 ? ' Na Meta, adicione este número na lista "Para" do número de teste e confirme o código.' : '';
    throw new Error(`WhatsApp recusou (${data.error?.code ?? res.status}): ${data.error?.message ?? 'erro desconhecido'}.${hint}`);
  }
  return data.messages[0].id;
}

/**
 * Confere token e número na Meta e liga o app à conta do WhatsApp Business (subscribed_apps),
 * sem o que a Meta não repassa as mensagens recebidas ao webhook.
 */
export async function checkConnection(token: string, phoneNumberId: string, wabaId: string): Promise<Array<{ ok: boolean; text: string }>> {
  const out: Array<{ ok: boolean; text: string }> = [];
  const call = async (method: string, path: string) => {
    try {
      const res = await fetch(`${GRAPH}/${path}`, { method, headers: { authorization: `Bearer ${token}` } });
      const data = (await res.json().catch(() => ({}))) as Record<string, any>;
      return { ok: res.ok && !data.error, data };
    } catch (e) {
      return { ok: false, data: { error: { message: `sem conexão com a Meta (${e instanceof Error ? e.message : e})` } } as Record<string, any> };
    }
  };
  if (!token) return [{ ok: false, text: 'Falta o token de acesso.' }];
  if (!phoneNumberId) return [{ ok: false, text: 'Falta o ID do número.' }];

  const phone = await call('GET', `${phoneNumberId}?fields=display_phone_number,verified_name`);
  if (!phone.ok) {
    const code = phone.data.error?.code;
    out.push({ ok: false, text: code === 190 ? 'Token vencido ou inválido. Gere um novo na Meta e cole aqui.' : `A Meta recusou o ID do número: ${phone.data.error?.message ?? 'erro desconhecido'}` });
    return out;
  }
  out.push({ ok: true, text: `Token válido. Número ${phone.data.display_phone_number ?? ''} (${phone.data.verified_name ?? 'sem nome'}) encontrado.` });

  if (!wabaId) {
    out.push({ ok: false, text: 'Preencha o ID da conta do WhatsApp Business para ligar o recebimento de mensagens.' });
    return out;
  }
  const sub = await call('POST', `${wabaId}/subscribed_apps`);
  out.push(sub.ok
    ? { ok: true, text: 'App ligado à conta do WhatsApp: as mensagens dos pacientes passam a chegar no portal.' }
    : { ok: false, text: `Não consegui ligar o app à conta: ${sub.data.error?.message ?? 'erro desconhecido'}` });
  return out;
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
export type StatusUpdate = { waId: string; status: string; error?: string; recipient?: string; phoneNumberId?: string };

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
        const err = s.errors?.[0];
        const error = err ? [err.code ? `(${err.code})` : '', err.title ?? err.message, err.error_data?.details].filter(Boolean).join(' ') : undefined;
        statuses.push({ waId: String(s.id ?? ''), status: String(s.status ?? ''), error, recipient: s.recipient_id, phoneNumberId });
      }
    }
  }
  return { inbound, statuses };
}
