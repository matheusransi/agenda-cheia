// Envia mensagens (de verdade ou simuladas, no modo teste) e guarda tudo no histórico.
import { type Clinic, type Env, lastInboundAt } from './db';
import { phoneKey } from './parse';
import { HOUR } from './time';
import { type Outgoing, sendWhatsApp, whatsappToken } from './whatsapp';

export type SendContext = { appointmentId?: number | null; waitlistId?: number | null };

export function isSimulated(env: Env, clinic: Clinic): boolean {
  return clinic.settings.test_mode || !whatsappToken(env, clinic) || !clinic.wa_phone_number_id;
}

/** A Meta só permite mensagens livres (sem modelo aprovado) até 24h depois da última mensagem do paciente. */
export async function windowOpen(env: Env, clinic: Clinic, phone: string): Promise<boolean> {
  const last = await lastInboundAt(env, clinic.id, phone);
  return Boolean(last && Date.now() - last.getTime() < 23.5 * HOUR);
}

function bodyOf(msg: Outgoing): string {
  return msg.kind === 'template' ? msg.preview : msg.text;
}

/** Envia e registra. Nunca lança erro: falhas ficam gravadas na mensagem com status "erro". */
export async function send(env: Env, clinic: Clinic, phone: string, msg: Outgoing, ctx: SendContext = {}): Promise<{ ok: boolean; error?: string }> {
  const buttons = msg.kind === 'text' ? null : JSON.stringify(msg.buttons ?? []);
  let status = 'simulado';
  let waId: string | null = null;
  let error: string | null = null;

  if (!isSimulated(env, clinic)) {
    try {
      waId = await sendWhatsApp(whatsappToken(env, clinic), clinic.wa_phone_number_id, phone, msg);
      status = 'enviado';
    } catch (e) {
      status = 'erro';
      error = e instanceof Error ? e.message : String(e);
    }
  }

  await env.DB.prepare(
    `INSERT INTO messages (clinic_id, appointment_id, waitlist_id, phone, phone_key, direction, body, buttons, wa_id, status, error)
     VALUES (?, ?, ?, ?, ?, 'out', ?, ?, ?, ?, ?)`,
  ).bind(clinic.id, ctx.appointmentId ?? null, ctx.waitlistId ?? null, phone, phoneKey(phone), bodyOf(msg), buttons, waId, status, error).run();

  return error ? { ok: false, error } : { ok: true };
}

export async function recordInbound(env: Env, clinic: Clinic, phone: string, body: string, waId: string | null, ctx: SendContext = {}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO messages (clinic_id, appointment_id, waitlist_id, phone, phone_key, direction, body, wa_id, status)
     VALUES (?, ?, ?, ?, ?, 'in', ?, ?, 'recebido')`,
  ).bind(clinic.id, ctx.appointmentId ?? null, ctx.waitlistId ?? null, phone, phoneKey(phone), body, waId).run();
}
