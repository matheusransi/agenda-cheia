// Envia mensagens (de verdade ou simuladas, no modo teste) e guarda tudo no histórico.
import { type Clinic, type Env, lastInboundAt } from './db';
import { alternatePhone, phoneKey } from './parse';
import { HOUR } from './time';
import { type Outgoing, sendWhatsApp, whatsappToken } from './whatsapp';

export type SendContext = { appointmentId?: number | null; waitlistId?: number | null };

export function isSimulated(env: Env, clinic: Clinic): boolean {
  return Boolean(clinic.demo) || clinic.settings.test_mode || !whatsappToken(env, clinic) || !clinic.wa_phone_number_id;
}

/** A Meta só permite mensagens livres (sem modelo aprovado) até 24h depois da última mensagem do paciente. */
export async function windowOpen(env: Env, clinic: Clinic, phone: string): Promise<boolean> {
  const last = await lastInboundAt(env, clinic.id, phone);
  return Boolean(last && Date.now() - last.getTime() < 23.5 * HOUR);
}

function bodyOf(msg: Outgoing): string {
  return msg.kind === 'template' ? msg.preview : msg.text;
}

/**
 * Número para onde enviar. Se o paciente já escreveu para a clínica, usa o número exatamente como o WhatsApp
 * o identificou (com ou sem o nono dígito), porque a Meta recusa o outro formato em alguns casos.
 */
async function recipientFor(env: Env, clinic: Clinic, phone: string): Promise<string> {
  // Primeiro, o formato que já funcionou num envio anterior; depois, o formato em que o paciente escreveu.
  const sent = await env.DB.prepare(
    "SELECT phone FROM messages WHERE clinic_id = ? AND phone_key = ? AND direction = 'out' AND status IN ('enviado','entregue','lido') ORDER BY created_at DESC, id DESC LIMIT 1",
  ).bind(clinic.id, phoneKey(phone)).first<{ phone: string }>();
  if (sent?.phone) return sent.phone;
  const row = await env.DB.prepare(
    "SELECT phone FROM messages WHERE clinic_id = ? AND phone_key = ? AND direction = 'in' ORDER BY created_at DESC, id DESC LIMIT 1",
  ).bind(clinic.id, phoneKey(phone)).first<{ phone: string }>();
  return row?.phone || phone;
}

/** Envia e registra. Nunca lança erro: falhas ficam gravadas na mensagem com status "erro". */
export async function send(env: Env, clinic: Clinic, phone: string, msg: Outgoing, ctx: SendContext = {}): Promise<{ ok: boolean; error?: string }> {
  const buttons = msg.kind === 'text' ? null : JSON.stringify(msg.buttons ?? []);
  let status = 'simulado';
  let waId: string | null = null;
  let error: string | null = null;
  let to = phone;

  if (!isSimulated(env, clinic)) {
    try {
      to = await recipientFor(env, clinic, phone);
      try {
        waId = await sendWhatsApp(whatsappToken(env, clinic), clinic.wa_phone_number_id, to, msg);
      } catch (e) {
        // Número "fora da lista permitida" pode ser só o nono dígito: tenta o outro formato uma vez.
        const alt = alternatePhone(to);
        if (!alt || !(e instanceof Error) || !e.message.includes('131030')) throw e;
        waId = await sendWhatsApp(whatsappToken(env, clinic), clinic.wa_phone_number_id, alt, msg);
        to = alt;
      }
      status = 'enviado';
    } catch (e) {
      status = 'erro';
      error = e instanceof Error ? e.message : String(e);
    }
  }

  await env.DB.prepare(
    `INSERT INTO messages (clinic_id, appointment_id, waitlist_id, phone, phone_key, direction, body, buttons, wa_id, status, error)
     VALUES (?, ?, ?, ?, ?, 'out', ?, ?, ?, ?, ?)`,
  ).bind(clinic.id, ctx.appointmentId ?? null, ctx.waitlistId ?? null, to, phoneKey(phone), bodyOf(msg), buttons, waId, status, error).run();

  return error ? { ok: false, error } : { ok: true };
}

export async function recordInbound(env: Env, clinic: Clinic, phone: string, body: string, waId: string | null, ctx: SendContext = {}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO messages (clinic_id, appointment_id, waitlist_id, phone, phone_key, direction, body, wa_id, status)
     VALUES (?, ?, ?, ?, ?, 'in', ?, ?, 'recebido')`,
  ).bind(clinic.id, ctx.appointmentId ?? null, ctx.waitlistId ?? null, phone, phoneKey(phone), body, waId).run();
}
