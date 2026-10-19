// Tipos das tabelas e consultas mais usadas no banco D1.
import { phoneKey } from './parse';
import { loadSettings, type Settings } from './settings';

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  GOOGLE_SERVICE_ACCOUNT?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  ALLOW_TIME_TRAVEL?: string;
};

export type ClinicRow = {
  id: number;
  name: string;
  address: string;
  timezone: string;
  calendar_id: string;
  wa_phone_number_id: string;
  wa_token: string;
  wa_app_secret: string;
  settings: string;
  created_at: string;
};

export type Clinic = Omit<ClinicRow, 'settings'> & { settings: Settings };

/** Versão da clínica enviada ao portal: nunca devolve o token nem a chave secreta, só se estão preenchidos. */
export function publicClinic(c: Clinic) {
  const { wa_token, wa_app_secret, ...rest } = c;
  return { ...rest, has_wa_token: Boolean(wa_token), has_wa_app_secret: Boolean(wa_app_secret) };
}

export type ApptStatus =
  | 'agendado' | 'aguardando' | 'sem_resposta' | 'ligar' | 'confirmado' | 'remarcando' | 'remarcar'
  | 'cancelado' | 'sem_telefone' | 'encaixe' | 'vago' | 'oferecido';

export type Appointment = {
  id: number;
  clinic_id: number;
  kind: 'consulta' | 'vaga';
  source: 'manual' | 'google';
  calendar_event_id: string | null;
  patient_name: string | null;
  phone: string | null;
  procedure: string;
  value: number | null;
  starts_at: string;
  ends_at: string;
  status: ApptStatus;
  confirm_sent_at: string | null;
  second_sent_at: string | null;
  final_sent_at: string | null;
  replied_at: string | null;
  offered_slots: string | null;
  moved_from: string | null;
  replaced_name: string | null;
  offered_to: number | null;
  offered_ids: string;
  created_at: string;
  updated_at: string;
};

export type WaitEntry = {
  id: number;
  clinic_id: number;
  name: string;
  phone: string;
  procedure: string;
  value: number | null;
  preference: string;
  status: 'espera' | 'oferta' | 'encaixado';
  offered_appointment_id: number | null;
  offered_at: string | null;
  created_at: string;
};

export type Message = {
  id: number;
  clinic_id: number;
  appointment_id: number | null;
  waitlist_id: number | null;
  phone: string;
  phone_key: string;
  direction: 'in' | 'out';
  body: string;
  buttons: string | null;
  wa_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function toClinic(row: ClinicRow): Clinic {
  return { ...row, settings: loadSettings(row.settings) };
}

export async function getClinic(env: Env, id: number): Promise<Clinic | null> {
  const row = await env.DB.prepare('SELECT * FROM clinics WHERE id = ?').bind(id).first<ClinicRow>();
  return row ? toClinic(row) : null;
}

export async function listClinics(env: Env): Promise<Clinic[]> {
  const { results } = await env.DB.prepare('SELECT * FROM clinics ORDER BY name').all<ClinicRow>();
  return results.map(toClinic);
}

export async function getAppointment(env: Env, clinicId: number, id: number): Promise<Appointment | null> {
  return env.DB.prepare('SELECT * FROM appointments WHERE clinic_id = ? AND id = ?').bind(clinicId, id).first<Appointment>();
}

export async function getWait(env: Env, clinicId: number, id: number): Promise<WaitEntry | null> {
  return env.DB.prepare('SELECT * FROM waitlist WHERE clinic_id = ? AND id = ?').bind(clinicId, id).first<WaitEntry>();
}

/** Atualiza campos de uma consulta. */
export async function updateAppointment(env: Env, id: number, fields: Partial<Appointment>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => (fields as Record<string, unknown>)[k] ?? null);
  await env.DB.prepare(`UPDATE appointments SET ${sets}, updated_at = ? WHERE id = ?`).bind(...values, nowIso(), id).run();
}

export async function updateWait(env: Env, id: number, fields: Partial<WaitEntry>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => (fields as Record<string, unknown>)[k] ?? null);
  await env.DB.prepare(`UPDATE waitlist SET ${sets} WHERE id = ?`).bind(...values, id).run();
}

export async function insertAppointment(env: Env, a: Partial<Appointment> & { clinic_id: number; starts_at: string; ends_at: string; status: ApptStatus }): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO appointments (clinic_id, kind, source, calendar_event_id, patient_name, phone, procedure, value, starts_at, ends_at, status, moved_from, replaced_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(
    a.clinic_id, a.kind ?? 'consulta', a.source ?? 'manual', a.calendar_event_id ?? null, a.patient_name ?? null, a.phone ?? null,
    a.procedure ?? '', a.value ?? null, a.starts_at, a.ends_at, a.status, a.moved_from ?? null, a.replaced_name ?? null,
  ).first<{ id: number }>();
  return row!.id;
}

export async function logEvent(env: Env, clinicId: number, text: string, tone: '' | 'ok' | 'warn' | 'bad' = '', appointmentId: number | null = null): Promise<void> {
  await env.DB.prepare('INSERT INTO events (clinic_id, appointment_id, text, tone) VALUES (?, ?, ?, ?)')
    .bind(clinicId, appointmentId, text, tone).run();
}

/** Última mensagem recebida desse telefone (para saber se a janela de 24h do WhatsApp está aberta). */
export async function lastInboundAt(env: Env, clinicId: number, phone: string): Promise<Date | null> {
  const row = await env.DB.prepare(
    "SELECT created_at FROM messages WHERE clinic_id = ? AND phone_key = ? AND direction = 'in' ORDER BY created_at DESC LIMIT 1",
  ).bind(clinicId, phoneKey(phone)).first<{ created_at: string }>();
  return row ? new Date(row.created_at) : null;
}
