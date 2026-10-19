// Regras do negócio: quando enviar cada mensagem, o que fazer com cada resposta e como reaproveitar vagas.
import {
  type Appointment, type Clinic, type Env, type WaitEntry,
  getAppointment, getWait, insertAppointment, logEvent, nowIso, updateAppointment, updateWait,
} from './db';
import { createEvent, listEvents, moveEvent, serviceAccount } from './google';
import { isSimulated, recordInbound, send, windowOpen } from './messaging';
import { classifyText, fillTemplate, firstName, fmtPhone, normalizePhone, parseEvent, phoneKey } from './parse';
import { findFreeSlots, type Interval } from './slots';
import {
  HOUR, MINUTE, addDays, atLocalTime, fmtLongDate, fmtSlot, fmtTime, hhmmToMinutes, localDateKey, minutesOfDay,
} from './time';
import type { Button } from './whatsapp';

const ACTIVE_WAITING = ['aguardando', 'sem_resposta', 'ligar'];

// ---------- Textos ----------

function vars(clinic: Clinic, name: string, start: Date, procedure: string): Record<string, string> {
  const tz = clinic.timezone;
  return {
    nome: firstName(name),
    nome_completo: name,
    clinica: clinic.name,
    procedimento: procedure || 'atendimento',
    data: fmtLongDate(start, tz),
    hora: fmtTime(start, tz),
    endereco: clinic.address || 'consulte a clínica',
  };
}

function confirmButtons(id: number): Button[] {
  return [{ id: `c:${id}`, title: 'Confirmar' }, { id: `r:${id}`, title: 'Remarcar' }];
}

function offerButtons(waitId: number): Button[] {
  return [{ id: `a:${waitId}`, title: 'Quero este horário' }, { id: `d:${waitId}`, title: 'Não posso' }];
}

function inSendWindow(clinic: Clinic, now: Date): boolean {
  const m = minutesOfDay(now, clinic.timezone);
  return m >= hhmmToMinutes(clinic.settings.send_from) && m < hhmmToMinutes(clinic.settings.send_until);
}

async function logOnce(env: Env, clinic: Clinic, text: string, tone: '' | 'ok' | 'warn' | 'bad', hours: number): Promise<void> {
  const since = new Date(Date.now() - hours * HOUR).toISOString();
  const seen = await env.DB.prepare('SELECT 1 FROM events WHERE clinic_id = ? AND text = ? AND created_at > ? LIMIT 1')
    .bind(clinic.id, text, since).first();
  if (!seen) await logEvent(env, clinic.id, text, tone);
}

const slotLabel = (clinic: Clinic, iso: string | Date) => fmtSlot(new Date(iso), clinic.timezone);

// ---------- Envios ----------

async function sendConfirmation(env: Env, clinic: Clinic, a: Appointment, second: boolean, now: Date): Promise<boolean> {
  const start = new Date(a.starts_at);
  const v = vars(clinic, a.patient_name ?? '', start, a.procedure);
  const preview = fillTemplate(clinic.settings.templates.confirm.preview, v);
  const msg = (await windowOpen(env, clinic, a.phone!))
    ? { kind: 'buttons' as const, text: preview, buttons: confirmButtons(a.id) }
    : {
      kind: 'template' as const, name: clinic.settings.templates.confirm.name, preview, buttons: confirmButtons(a.id),
      params: [v.nome, v.clinica, v.procedimento, v.data, v.hora],
    };
  const res = await send(env, clinic, a.phone!, msg, { appointmentId: a.id });
  if (!res.ok) {
    await updateAppointment(env, a.id, { status: 'ligar', confirm_sent_at: a.confirm_sent_at ?? now.toISOString() });
    await logEvent(env, clinic.id, `Não consegui enviar para ${a.patient_name}: ${res.error}. Recepção: ligar.`, 'bad', a.id);
    return false;
  }
  await updateAppointment(env, a.id, second
    ? { status: 'sem_resposta', second_sent_at: now.toISOString() }
    : { status: 'aguardando', confirm_sent_at: now.toISOString() });
  return true;
}

async function sendFinalReminder(env: Env, clinic: Clinic, a: Appointment, now: Date): Promise<boolean> {
  const v = vars(clinic, a.patient_name ?? '', new Date(a.starts_at), a.procedure);
  const msg = (await windowOpen(env, clinic, a.phone!))
    ? { kind: 'text' as const, text: fillTemplate(clinic.settings.texts.reminder_text, v) }
    : {
      kind: 'template' as const, name: clinic.settings.templates.reminder.name,
      preview: fillTemplate(clinic.settings.templates.reminder.preview, v), params: [v.nome, v.clinica, v.hora, v.endereco],
    };
  const res = await send(env, clinic, a.phone!, msg, { appointmentId: a.id });
  await updateAppointment(env, a.id, { final_sent_at: now.toISOString() });
  if (!res.ok) await logEvent(env, clinic.id, `Lembrete final para ${a.patient_name} falhou: ${res.error}`, 'warn', a.id);
  return res.ok;
}

/** Oferece um horário vago ao próximo da lista de espera. Retorna true se alguém recebeu a oferta. */
async function offerVaga(env: Env, clinic: Clinic, vaga: Appointment, now: Date, announce: boolean): Promise<boolean> {
  const start = new Date(vaga.starts_at);
  if (start.getTime() - now.getTime() < 2 * HOUR) return false;
  if (!inSendWindow(clinic, now)) return false;

  const offered = vaga.offered_ids.split(',').filter(Boolean).map(Number);
  const { results } = await env.DB.prepare("SELECT * FROM waitlist WHERE clinic_id = ? AND status = 'espera' ORDER BY created_at, id")
    .bind(clinic.id).all<WaitEntry>();
  const w = results.find((x) => !offered.includes(x.id));
  if (!w) {
    await updateAppointment(env, vaga.id, { status: 'vago', offered_to: null });
    if (announce) await logEvent(env, clinic.id, `Ninguém disponível na lista de espera para ${slotLabel(clinic, start)}. Horário segue livre.`, 'bad', vaga.id);
    return false;
  }

  await updateWait(env, w.id, { status: 'oferta', offered_appointment_id: vaga.id, offered_at: now.toISOString() });
  await updateAppointment(env, vaga.id, { status: 'oferecido', offered_to: w.id, offered_ids: [...offered, w.id].join(',') });

  const v = vars(clinic, w.name, start, w.procedure);
  const preview = fillTemplate(clinic.settings.templates.offer.preview, v);
  const msg = (await windowOpen(env, clinic, w.phone))
    ? { kind: 'buttons' as const, text: preview, buttons: offerButtons(w.id) }
    : {
      kind: 'template' as const, name: clinic.settings.templates.offer.name, preview, buttons: offerButtons(w.id),
      params: [v.nome, v.clinica, v.data, v.hora],
    };
  const res = await send(env, clinic, w.phone, msg, { waitlistId: w.id, appointmentId: vaga.id });
  if (!res.ok) {
    await updateWait(env, w.id, { status: 'espera', offered_appointment_id: null, offered_at: null });
    await logEvent(env, clinic.id, `Oferta para ${w.name} falhou: ${res.error}`, 'bad', vaga.id);
    return offerVaga(env, clinic, { ...vaga, offered_ids: [...offered, w.id].join(',') }, now, announce);
  }
  await logEvent(env, clinic.id, `Vaga de ${slotLabel(clinic, start)} oferecida a ${w.name} (lista de espera).`, 'warn', vaga.id);
  return true;
}

/** Cria um horário vago no lugar de uma consulta que saiu e já tenta oferecê-lo. */
async function openVaga(env: Env, clinic: Clinic, a: Appointment, now: Date): Promise<void> {
  if (new Date(a.starts_at).getTime() - now.getTime() < 2 * HOUR) return;
  const id = await insertAppointment(env, {
    clinic_id: clinic.id, kind: 'vaga', source: 'manual', starts_at: a.starts_at, ends_at: a.ends_at,
    status: 'vago', procedure: a.procedure, value: a.value, replaced_name: a.patient_name,
  });
  const vaga = (await getAppointment(env, clinic.id, id))!;
  await offerVaga(env, clinic, vaga, now, true);
}

// ---------- Sincronização com o Google Agenda ----------

export async function syncCalendar(env: Env, clinic: Clinic, now: Date): Promise<{ created: number; changed: number; removed: number }> {
  const to = new Date(now.getTime() + 15 * 24 * HOUR);
  const events = (await listEvents(env, clinic.calendar_id, now, to))
    .filter((e) => e.start?.dateTime && e.end?.dateTime && new Date(e.start.dateTime) >= now);

  const { results: existing } = await env.DB.prepare(
    "SELECT * FROM appointments WHERE clinic_id = ? AND source = 'google' AND starts_at >= ? AND starts_at < ?",
  ).bind(clinic.id, now.toISOString(), to.toISOString()).all<Appointment>();
  const byEvent = new Map(existing.map((a) => [a.calendar_event_id, a]));
  const seen = new Set<string>();
  let created = 0, changed = 0, removed = 0;

  for (const ev of events) {
    seen.add(ev.id);
    const p = parseEvent(ev.summary ?? '', ev.description ?? '');
    const start = new Date(ev.start!.dateTime!);
    const end = new Date(ev.end!.dateTime!);
    const row = byEvent.get(ev.id);
    if (!row) {
      try {
        await insertAppointment(env, {
          clinic_id: clinic.id, source: 'google', calendar_event_id: ev.id, patient_name: p.patient, phone: p.phone,
          procedure: p.procedure, value: p.value, starts_at: start.toISOString(), ends_at: end.toISOString(),
          status: p.phone ? 'agendado' : 'sem_telefone',
        });
        created++;
      } catch {
        // Outra execução inseriu o mesmo evento ao mesmo tempo.
      }
      continue;
    }
    if (row.status === 'cancelado') continue;
    const fields: Partial<Appointment> = {};
    if (new Date(row.starts_at).getTime() !== start.getTime()) {
      Object.assign(fields, {
        starts_at: start.toISOString(), ends_at: end.toISOString(), status: p.phone ? 'agendado' : 'sem_telefone',
        confirm_sent_at: null, second_sent_at: null, final_sent_at: null, offered_slots: null,
      });
      await logEvent(env, clinic.id, `Consulta de ${p.patient} mudou na agenda para ${slotLabel(clinic, start)}.`, '', row.id);
    } else if (new Date(row.ends_at).getTime() !== end.getTime()) {
      fields.ends_at = end.toISOString();
    }
    if (row.patient_name !== p.patient) fields.patient_name = p.patient;
    if (row.procedure !== p.procedure) fields.procedure = p.procedure;
    if (row.value !== p.value) fields.value = p.value;
    if (row.phone !== p.phone) {
      fields.phone = p.phone;
      if (!p.phone) fields.status = 'sem_telefone';
      else if (row.status === 'sem_telefone') fields.status = 'agendado';
    }
    if (Object.keys(fields).length) { await updateAppointment(env, row.id, fields); changed++; }
  }

  for (const row of existing) {
    if (!row.calendar_event_id || seen.has(row.calendar_event_id) || row.status === 'cancelado') continue;
    await updateAppointment(env, row.id, { status: 'cancelado' });
    await logEvent(env, clinic.id, `Consulta de ${row.patient_name} (${slotLabel(clinic, row.starts_at)}) foi removida da agenda.`, 'warn', row.id);
    removed++;
    if (clinic.settings.offer_on_cancel) await openVaga(env, clinic, row, now);
  }
  return { created, changed, removed };
}

// ---------- Ciclo automático (a cada 15 minutos) ----------

export type CycleResult = { sync?: { created: number; changed: number; removed: number }; syncError?: string; confirmations: number; seconds: number; escalated: number; finals: number };

export async function runCycle(env: Env, clinic: Clinic, opts: { force?: boolean; now?: Date } = {}): Promise<CycleResult> {
  const now = opts.now ?? new Date();
  const tz = clinic.timezone;
  const s = clinic.settings;
  const result: CycleResult = { confirmations: 0, seconds: 0, escalated: 0, finals: 0 };

  if (clinic.calendar_id && serviceAccount(env)) {
    try {
      result.sync = await syncCalendar(env, clinic, now);
    } catch (e) {
      result.syncError = e instanceof Error ? e.message : String(e);
      await logOnce(env, clinic, `Não consegui ler o Google Agenda: ${result.syncError}`, 'bad', 6);
    }
  }

  const inWindow = inSendWindow(clinic, now);
  const today = localDateKey(now, tz);
  const { results: appts } = await env.DB.prepare(
    "SELECT * FROM appointments WHERE clinic_id = ? AND starts_at > ? AND starts_at < ? AND status != 'cancelado' ORDER BY starts_at",
  ).bind(clinic.id, now.toISOString(), new Date(now.getTime() + 16 * 24 * HOUR).toISOString()).all<Appointment>();

  for (const a of appts) {
    if (a.kind !== 'consulta' || !a.phone) continue;
    const start = new Date(a.starts_at);
    const untilStart = start.getTime() - now.getTime();
    const day = localDateKey(start, tz);
    const confirmDay = addDays(day, -s.confirm_days_before);

    if (a.status === 'agendado' && !a.confirm_sent_at) {
      const due = opts.force ? day <= addDays(today, s.confirm_days_before) : now >= atLocalTime(confirmDay, s.confirm_time, tz);
      if (due && untilStart > 2 * HOUR && (inWindow || opts.force)) {
        if (await sendConfirmation(env, clinic, a, false, now)) result.confirmations++;
      }
      continue;
    }

    if (a.status === 'aguardando' && s.second_reminder && !a.second_sent_at && a.confirm_sent_at) {
      const at = Math.max(atLocalTime(confirmDay, s.second_time, tz).getTime(), new Date(a.confirm_sent_at).getTime() + 3 * HOUR);
      if (now.getTime() >= at && untilStart > 2 * HOUR && inWindow) {
        if (await sendConfirmation(env, clinic, a, true, now)) result.seconds++;
        continue;
      }
    }

    if ((a.status === 'aguardando' || a.status === 'sem_resposta') && a.confirm_sent_at) {
      const lastSent = new Date(a.second_sent_at ?? a.confirm_sent_at).getTime();
      const at = Math.max(atLocalTime(confirmDay, s.escalate_time, tz).getTime(), lastSent + 2 * HOUR);
      if (now.getTime() >= at || untilStart <= 3 * HOUR) {
        await updateAppointment(env, a.id, { status: 'ligar' });
        await logEvent(env, clinic.id, `${a.patient_name} não respondeu. Recepção: ligar (consulta ${slotLabel(clinic, start)}).`, 'bad', a.id);
        result.escalated++;
      }
      continue;
    }

    if ((a.status === 'confirmado' || a.status === 'encaixe') && s.final_reminder && !a.final_sent_at
      && untilStart <= s.final_hours * HOUR && inWindow) {
      if (await sendFinalReminder(env, clinic, a, now)) result.finals++;
    }
  }

  // Ofertas da lista de espera sem resposta passam para o próximo.
  const expired = new Date(now.getTime() - s.offer_minutes * MINUTE).toISOString();
  const { results: stale } = await env.DB.prepare("SELECT * FROM waitlist WHERE clinic_id = ? AND status = 'oferta' AND offered_at < ?")
    .bind(clinic.id, expired).all<WaitEntry>();
  for (const w of stale) {
    await updateWait(env, w.id, { status: 'espera', offered_appointment_id: null, offered_at: null });
    await logEvent(env, clinic.id, `${w.name} não respondeu à oferta a tempo. Passando para o próximo da lista.`);
    const vaga = w.offered_appointment_id ? await getAppointment(env, clinic.id, w.offered_appointment_id) : null;
    if (vaga && vaga.status === 'oferecido' && vaga.offered_to === w.id) {
      await updateAppointment(env, vaga.id, { status: 'vago', offered_to: null });
      await offerVaga(env, clinic, { ...vaga, status: 'vago' }, now, true);
    }
  }

  // Horários vagos que ainda não foram oferecidos (ex.: alguém entrou na lista de espera depois).
  const { results: vagas } = await env.DB.prepare(
    "SELECT * FROM appointments WHERE clinic_id = ? AND status = 'vago' AND starts_at > ?",
  ).bind(clinic.id, new Date(now.getTime() + 2 * HOUR).toISOString()).all<Appointment>();
  for (const v of vagas) await offerVaga(env, clinic, v, now, false);

  if (result.confirmations) await logEvent(env, clinic.id, `Confirmações enviadas para ${result.confirmations} paciente(s).`);
  if (result.seconds) await logEvent(env, clinic.id, `2º lembrete enviado para ${result.seconds} paciente(s) que não responderam.`, 'warn');
  if (result.finals) await logEvent(env, clinic.id, `Lembrete de última hora enviado para ${result.finals} paciente(s).`);
  return result;
}

// ---------- Respostas dos pacientes ----------

type Action =
  | { type: 'confirm' | 'resched' | 'human'; appt: Appointment }
  | { type: 'pick'; appt: Appointment; at: number }
  | { type: 'accept' | 'decline'; wait: WaitEntry };

async function actionFromReplyId(env: Env, clinic: Clinic, replyId: string, key: string): Promise<Action | null> {
  const [code, rawId, rawAt] = replyId.split(':');
  const id = Number(rawId);
  if (!Number.isInteger(id)) return null;
  if (code === 'a' || code === 'd') {
    const wait = await getWait(env, clinic.id, id);
    if (!wait || phoneKey(wait.phone) !== key) return null;
    return { type: code === 'a' ? 'accept' : 'decline', wait };
  }
  const appt = await getAppointment(env, clinic.id, id);
  if (!appt || !appt.phone || phoneKey(appt.phone) !== key) return null;
  if (code === 'c') return { type: 'confirm', appt };
  if (code === 'r') return { type: 'resched', appt };
  if (code === 'h') return { type: 'human', appt };
  if (code === 's' && Number.isFinite(Number(rawAt))) return { type: 'pick', appt, at: Number(rawAt) * MINUTE };
  return null;
}

async function actionFromText(env: Env, clinic: Clinic, text: string, key: string, now: Date): Promise<Action | null> {
  const { results: waits } = await env.DB.prepare("SELECT * FROM waitlist WHERE clinic_id = ? AND status = 'oferta'")
    .bind(clinic.id).all<WaitEntry>();
  const wait = waits.find((w) => phoneKey(w.phone) === key);
  const { results: appts } = await env.DB.prepare(
    "SELECT * FROM appointments WHERE clinic_id = ? AND kind = 'consulta' AND starts_at > ? AND status IN ('aguardando','sem_resposta','ligar','remarcando') ORDER BY starts_at",
  ).bind(clinic.id, now.toISOString()).all<Appointment>();
  const appt = appts.find((a) => a.phone && phoneKey(a.phone) === key);

  const number = /^\s*(\d)\s*$/.exec(text);
  if (appt?.status === 'remarcando' && number) {
    const slots: string[] = JSON.parse(appt.offered_slots || '[]');
    const n = Number(number[1]);
    if (n >= 1 && n <= slots.length) return { type: 'pick', appt, at: new Date(slots[n - 1]).getTime() };
    if (n === slots.length + 1) return { type: 'human', appt };
  }
  const intent = classifyText(text);
  if (intent === 'unknown') return null;
  if (wait) return { type: intent === 'yes' ? 'accept' : 'decline', wait };
  if (appt && appt.status !== 'remarcando') return { type: intent === 'yes' ? 'confirm' : 'resched', appt };
  return null;
}

/** Processa uma mensagem recebida do paciente (pelo webhook ou pelo simulador do portal). */
export async function handleInbound(
  env: Env, clinic: Clinic, from: string, input: { replyId?: string; text?: string; waId?: string }, now = new Date(),
): Promise<void> {
  const phone = normalizePhone(from) ?? from.replace(/\D/g, '');
  const key = phoneKey(phone);
  const text = (input.text ?? '').trim();

  let action = input.replyId ? await actionFromReplyId(env, clinic, input.replyId, key) : null;
  if (!action && text) action = await actionFromText(env, clinic, text, key, now);

  const ctx = action
    ? ('appt' in action ? { appointmentId: action.appt.id } : { waitlistId: action.wait.id, appointmentId: action.wait.offered_appointment_id })
    : {};
  await recordInbound(env, clinic, phone, text || input.replyId || '', input.waId ?? null, ctx);

  if (!action) {
    await send(env, clinic, phone, { kind: 'text', text: clinic.settings.texts.fallback });
    await logEvent(env, clinic.id, `Mensagem de ${fmtPhone(phone)} precisa de resposta da recepção: "${text.slice(0, 80)}"`, 'warn');
    return;
  }

  switch (action.type) {
    case 'confirm': return confirm(env, clinic, action.appt, phone, now);
    case 'resched': return offerReschedule(env, clinic, action.appt, phone, now);
    case 'pick': return pickSlot(env, clinic, action.appt, action.at, phone, now);
    case 'human': return askHuman(env, clinic, action.appt, phone);
    case 'accept': return acceptOffer(env, clinic, action.wait, phone, now);
    case 'decline': return declineOffer(env, clinic, action.wait, phone, now);
  }
}

async function confirm(env: Env, clinic: Clinic, a: Appointment, phone: string, now: Date): Promise<void> {
  if (!['agendado', 'confirmado', 'encaixe', 'remarcando', 'remarcar', ...ACTIVE_WAITING].includes(a.status) || new Date(a.starts_at) < now) {
    await send(env, clinic, phone, { kind: 'text', text: clinic.settings.texts.fallback }, { appointmentId: a.id });
    return;
  }
  const v = vars(clinic, a.patient_name ?? '', new Date(a.starts_at), a.procedure);
  if (a.status !== 'confirmado' && a.status !== 'encaixe') {
    await updateAppointment(env, a.id, { status: 'confirmado', replied_at: now.toISOString(), offered_slots: null });
    await logEvent(env, clinic.id, `${a.patient_name} confirmou a consulta de ${slotLabel(clinic, a.starts_at)}.`, 'ok', a.id);
  }
  await send(env, clinic, phone, { kind: 'text', text: fillTemplate(clinic.settings.texts.confirmed, v) }, { appointmentId: a.id });
}

async function busyIntervals(env: Env, clinic: Clinic, now: Date, exceptId: number): Promise<Interval[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, starts_at, ends_at FROM appointments WHERE clinic_id = ? AND status != 'cancelado' AND ends_at > ? AND starts_at < ?",
  ).bind(clinic.id, now.toISOString(), new Date(now.getTime() + 16 * 24 * HOUR).toISOString()).all<Pick<Appointment, 'id' | 'starts_at' | 'ends_at'>>();
  return results.filter((r) => r.id !== exceptId).map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) }));
}

function durationOf(a: Appointment): number {
  return Math.max(15 * MINUTE, new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime());
}

async function offerReschedule(env: Env, clinic: Clinic, a: Appointment, phone: string, now: Date): Promise<void> {
  if (a.status === 'cancelado' || new Date(a.starts_at) < now) {
    await send(env, clinic, phone, { kind: 'text', text: clinic.settings.texts.fallback }, { appointmentId: a.id });
    return;
  }
  const busy = await busyIntervals(env, clinic, now, a.id);
  const slots = findFreeSlots(clinic.settings, clinic.timezone, busy, durationOf(a), now);
  if (!slots.length) {
    await updateAppointment(env, a.id, { status: 'remarcar', replied_at: now.toISOString() });
    await send(env, clinic, phone, { kind: 'text', text: clinic.settings.texts.reschedule_none }, { appointmentId: a.id });
    await logEvent(env, clinic.id, `${a.patient_name} quer remarcar, mas não há horários livres. Recepção: ligar.`, 'bad', a.id);
    return;
  }
  await updateAppointment(env, a.id, {
    status: 'remarcando', replied_at: now.toISOString(), offered_slots: JSON.stringify(slots.map((d) => d.toISOString())),
  });
  const buttons: Button[] = [
    ...slots.map((d) => ({ id: `s:${a.id}:${Math.round(d.getTime() / MINUTE)}`, title: fmtSlot(d, clinic.timezone) })),
    { id: `h:${a.id}`, title: 'Falar com a recepção' },
  ];
  await send(env, clinic, phone, { kind: 'list', text: clinic.settings.texts.reschedule, buttonLabel: 'Ver horários', buttons }, { appointmentId: a.id });
  await logEvent(env, clinic.id, `${a.patient_name} pediu para remarcar a consulta de ${slotLabel(clinic, a.starts_at)}.`, 'warn', a.id);
}

async function pickSlot(env: Env, clinic: Clinic, a: Appointment, at: number, phone: string, now: Date): Promise<void> {
  if (a.status !== 'remarcando') {
    // Botão antigo tocado de novo: só lembra o horário atual.
    return confirm(env, clinic, a, phone, now);
  }
  const offered: string[] = JSON.parse(a.offered_slots || '[]');
  const valid = offered.some((iso) => new Date(iso).getTime() === at);
  const duration = durationOf(a);
  const busy = await busyIntervals(env, clinic, now, a.id);
  const free = !busy.some((b) => at < b.end.getTime() && at + duration > b.start.getTime());
  if (!valid || !free || at < now.getTime()) {
    return offerReschedule(env, clinic, a, phone, now);
  }

  const newStart = new Date(at);
  const newEnd = new Date(at + duration);
  if (a.source === 'google' && a.calendar_event_id) {
    try {
      await moveEvent(env, clinic.calendar_id, a.calendar_event_id, newStart, newEnd);
    } catch (e) {
      await updateAppointment(env, a.id, { status: 'remarcar' });
      await send(env, clinic, phone, { kind: 'text', text: clinic.settings.texts.reschedule_none }, { appointmentId: a.id });
      await logEvent(env, clinic.id, `Não consegui mover ${a.patient_name} no Google Agenda (${e instanceof Error ? e.message : e}). Recepção: remarcar manualmente.`, 'bad', a.id);
      return;
    }
  }

  const old = { ...a };
  await updateAppointment(env, a.id, {
    starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(), status: 'confirmado', moved_from: a.starts_at,
    offered_slots: null, confirm_sent_at: a.confirm_sent_at ?? now.toISOString(), second_sent_at: null, final_sent_at: null,
  });
  const v = vars(clinic, a.patient_name ?? '', newStart, a.procedure);
  const novo = `${v.data} às ${v.hora}`;
  await send(env, clinic, phone, { kind: 'text', text: fillTemplate(clinic.settings.texts.rescheduled, { ...v, novo_horario: novo }) }, { appointmentId: a.id });
  await logEvent(env, clinic.id, `${a.patient_name} remarcou para ${slotLabel(clinic, newStart)}. Horário de ${slotLabel(clinic, old.starts_at)} liberado.`, '', a.id);
  await openVaga(env, clinic, old, now);
}

async function askHuman(env: Env, clinic: Clinic, a: Appointment, phone: string): Promise<void> {
  await updateAppointment(env, a.id, { status: 'remarcar', offered_slots: null, replied_at: nowIso() });
  await send(env, clinic, phone, { kind: 'text', text: clinic.settings.texts.human }, { appointmentId: a.id });
  await logEvent(env, clinic.id, `${a.patient_name} quer falar com a recepção para remarcar (${slotLabel(clinic, a.starts_at)}).`, 'bad', a.id);
}

async function acceptOffer(env: Env, clinic: Clinic, w: WaitEntry, phone: string, now: Date): Promise<void> {
  const vaga = w.offered_appointment_id ? await getAppointment(env, clinic.id, w.offered_appointment_id) : null;
  const ok = w.status === 'oferta' && vaga && vaga.status === 'oferecido' && vaga.offered_to === w.id && new Date(vaga.starts_at) > now;
  if (!ok || !vaga) {
    if (w.status === 'oferta') await updateWait(env, w.id, { status: 'espera', offered_appointment_id: null, offered_at: null });
    if (w.status !== 'encaixado') await send(env, clinic, phone, { kind: 'text', text: clinic.settings.texts.offer_taken }, { waitlistId: w.id });
    return;
  }

  const start = new Date(vaga.starts_at);
  let eventId: string | null = null;
  if (clinic.calendar_id && serviceAccount(env)) {
    try {
      eventId = await createEvent(
        env, clinic.calendar_id, `${w.name}${w.procedure ? ' - ' + w.procedure : ''}`,
        `Tel: ${fmtPhone(w.phone)}\nEncaixe automático pela lista de espera (Agenda Cheia).`, start, new Date(vaga.ends_at),
      );
    } catch (e) {
      await logEvent(env, clinic.id, `Encaixe de ${w.name} feito, mas não consegui criar o evento no Google Agenda: adicione manualmente.`, 'bad', vaga.id);
    }
  }

  await updateAppointment(env, vaga.id, {
    kind: 'consulta', status: 'encaixe', patient_name: w.name, phone: w.phone, procedure: w.procedure || vaga.procedure,
    value: w.value ?? vaga.value, offered_to: null, calendar_event_id: eventId, source: eventId ? 'google' : 'manual',
    confirm_sent_at: now.toISOString(), replied_at: now.toISOString(),
  });
  await updateWait(env, w.id, { status: 'encaixado' });
  const v = vars(clinic, w.name, start, w.procedure);
  await send(env, clinic, phone, { kind: 'text', text: fillTemplate(clinic.settings.texts.offer_accepted, v) }, { waitlistId: w.id, appointmentId: vaga.id });
  await logEvent(env, clinic.id, `Encaixe: ${w.name} ficou com o horário de ${slotLabel(clinic, start)}. Horário reaproveitado.`, 'ok', vaga.id);
}

async function declineOffer(env: Env, clinic: Clinic, w: WaitEntry, phone: string, now: Date): Promise<void> {
  const vaga = w.offered_appointment_id ? await getAppointment(env, clinic.id, w.offered_appointment_id) : null;
  if (w.status === 'oferta') await updateWait(env, w.id, { status: 'espera', offered_appointment_id: null, offered_at: null });
  await send(env, clinic, phone, { kind: 'text', text: clinic.settings.texts.offer_declined }, { waitlistId: w.id });
  if (vaga && vaga.status === 'oferecido' && vaga.offered_to === w.id) {
    await logEvent(env, clinic.id, `${w.name} recusou a vaga de ${slotLabel(clinic, vaga.starts_at)}.`, '', vaga.id);
    await updateAppointment(env, vaga.id, { status: 'vago', offered_to: null });
    await offerVaga(env, clinic, { ...vaga, status: 'vago' }, now, true);
  }
}

// ---------- Ações do portal ----------

export async function createAppointment(
  env: Env, clinic: Clinic, input: { patient: string; phone: string; procedure: string; value: number | null; date: string; time: string; duration: number },
): Promise<number> {
  const start = atLocalTime(input.date, input.time, clinic.timezone);
  if (Number.isNaN(start.getTime())) throw new Error('Data ou horário inválido.');
  const end = new Date(start.getTime() + Math.max(15, input.duration || 60) * MINUTE);
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw new Error('Telefone inválido. Use DDD + número, ex.: (11) 98765-4321.');

  let eventId: string | null = null;
  if (clinic.calendar_id && serviceAccount(env)) {
    const desc = [phone ? `Tel: ${fmtPhone(phone)}` : '', input.value ? `Valor: ${input.value}` : ''].filter(Boolean).join('\n');
    eventId = await createEvent(env, clinic.calendar_id, `${input.patient}${input.procedure ? ' - ' + input.procedure : ''}`, desc, start, end);
  }
  const id = await insertAppointment(env, {
    clinic_id: clinic.id, source: eventId ? 'google' : 'manual', calendar_event_id: eventId, patient_name: input.patient, phone,
    procedure: input.procedure, value: input.value, starts_at: start.toISOString(), ends_at: end.toISOString(),
    status: phone ? 'agendado' : 'sem_telefone',
  });
  await logEvent(env, clinic.id, `Consulta de ${input.patient} adicionada para ${slotLabel(clinic, start)}.`, '', id);
  return id;
}

export async function cancelAppointment(env: Env, clinic: Clinic, a: Appointment): Promise<void> {
  if (a.source === 'google') throw new Error('Esta consulta vem do Google Agenda. Remova por lá; o sistema percebe sozinho.');
  await updateAppointment(env, a.id, { status: 'cancelado' });
  await logEvent(env, clinic.id, `Consulta de ${a.patient_name ?? 'horário livre'} (${slotLabel(clinic, a.starts_at)}) cancelada no portal.`, 'warn', a.id);
  if (a.kind === 'consulta' && clinic.settings.offer_on_cancel) await openVaga(env, clinic, a, new Date());
}

export { isSimulated };
