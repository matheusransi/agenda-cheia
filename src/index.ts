// Ponto de entrada do Worker: API do portal, webhook do WhatsApp e ciclo agendado.
import { Hono, type Context } from 'hono';
import { checkPassword, clearSession, createSession, isLoggedIn } from './auth';
import {
  type Appointment, type Clinic, type ClinicRow, type Env, type Message, type WaitEntry,
  getAppointment, getClinic, listClinics, logEvent, publicClinic, toClinic,
} from './db';
import { cancelAppointment, createAppointment, handleInbound, isSimulated, runCycle } from './engine';
import { serviceAccount } from './google';
import { send, windowOpen } from './messaging';
import { normalizePhone, phoneKey } from './parse';
import { DEFAULT_SETTINGS, mergeSettings } from './settings';
import { HOUR, dayRange, localDateKey } from './time';
import { checkConnection, parseWebhook, verifySignature, verifyToken, whatsappToken } from './whatsapp';

type App = { Bindings: Env; Variables: { clinic: Clinic } };
const app = new Hono<App>();

const fail = (c: Context, status: 400 | 401 | 403 | 404 | 409 | 500, error: string) => c.json({ error }, status);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, 500);
});

// ---------- Login ----------

app.post('/api/login', async (c) => {
  if (!c.env.ADMIN_PASSWORD) return fail(c, 500, 'A senha do portal (ADMIN_PASSWORD) ainda não foi configurada.');
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  if (!(await checkPassword(c.env, password ?? ''))) {
    await new Promise((r) => setTimeout(r, 800));
    return fail(c, 401, 'Senha incorreta.');
  }
  c.header('set-cookie', await createSession(c.env));
  return c.json({ ok: true });
});

app.post('/api/logout', (c) => {
  c.header('set-cookie', clearSession());
  return c.json({ ok: true });
});

app.use('/api/*', async (c, next) => {
  if (!(await isLoggedIn(c.env, c.req.header('cookie') ?? null))) return fail(c, 401, 'Faça login para continuar.');
  // Pedidos que alteram dados precisam vir do próprio portal.
  if (c.req.method !== 'GET' && !c.req.header('content-type')?.includes('application/json')) return fail(c, 400, 'Pedido inválido.');
  await next();
});

app.get('/api/me', (c) => c.json({ ok: true }));

app.get('/api/status', (c) => {
  const sa = serviceAccount(c.env);
  return c.json({
    google: { configured: Boolean(sa), email: sa?.client_email ?? null },
    whatsapp: { env_token: Boolean(c.env.WHATSAPP_TOKEN), env_app_secret: Boolean(c.env.WHATSAPP_APP_SECRET), verify_token: verifyToken(c.env) },
    webhook_url: new URL('/webhook/whatsapp', c.req.url).toString(),
  });
});

// ---------- Clínicas ----------

app.get('/api/clinics', async (c) => c.json((await listClinics(c.env)).map(publicClinic)));

app.post('/api/clinics', async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = (body.name ?? '').trim();
  if (!name) return fail(c, 400, 'Informe o nome da clínica.');
  const row = await c.env.DB.prepare('INSERT INTO clinics (name, settings) VALUES (?, ?) RETURNING *')
    .bind(name, JSON.stringify(DEFAULT_SETTINGS)).first<ClinicRow>();
  return c.json(publicClinic(toClinic(row!)));
});

app.use('/api/clinics/:id/*', async (c, next) => {
  const clinic = await getClinic(c.env, Number(c.req.param('id')));
  if (!clinic) return fail(c, 404, 'Clínica não encontrada.');
  c.set('clinic', clinic);
  await next();
});
app.use('/api/clinics/:id', async (c, next) => {
  const clinic = await getClinic(c.env, Number(c.req.param('id')));
  if (!clinic) return fail(c, 404, 'Clínica não encontrada.');
  c.set('clinic', clinic);
  await next();
});

app.get('/api/clinics/:id', (c) => c.json(publicClinic(c.get('clinic'))));

app.put('/api/clinics/:id', async (c) => {
  const clinic = c.get('clinic');
  const body = await c.req.json<Partial<Clinic> & { wa_token?: string; wa_app_secret?: string }>();
  const settings = mergeSettings(clinic.settings as unknown as Record<string, unknown>, body.settings ?? {});
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v.trim() : fallback);
  const name = str(body.name, clinic.name);
  if (!name) return fail(c, 400, 'O nome da clínica não pode ficar vazio.');
  // Token e chave secreta só mudam quando algo novo é digitado (o portal nunca recebe os valores salvos).
  const secret = (v: unknown, current: string) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, '') : current);
  await c.env.DB.prepare('UPDATE clinics SET name = ?, address = ?, calendar_id = ?, wa_phone_number_id = ?, wa_token = ?, wa_app_secret = ?, settings = ? WHERE id = ?')
    .bind(name, str(body.address, clinic.address), str(body.calendar_id, clinic.calendar_id),
      str(body.wa_phone_number_id, clinic.wa_phone_number_id).replace(/\D/g, ''), secret(body.wa_token, clinic.wa_token),
      secret(body.wa_app_secret, clinic.wa_app_secret), JSON.stringify(settings), clinic.id)
    .run();
  return c.json(publicClinic((await getClinic(c.env, clinic.id))!));
});

// ---------- Painel ----------

app.get('/api/clinics/:id/day', async (c) => {
  const clinic = c.get('clinic');
  const now = new Date();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('date') ?? '') ? c.req.query('date')! : localDateKey(new Date(now.getTime() + 24 * HOUR), clinic.timezone);
  const { start, end } = dayRange(date, clinic.timezone);
  const db = c.env.DB;
  const [appts, waitlist, events, attention] = await Promise.all([
    db.prepare('SELECT * FROM appointments WHERE clinic_id = ? AND starts_at >= ? AND starts_at < ? ORDER BY starts_at, id')
      .bind(clinic.id, start.toISOString(), end.toISOString()).all<Appointment>(),
    db.prepare("SELECT * FROM waitlist WHERE clinic_id = ? AND (status != 'encaixado' OR created_at > ?) ORDER BY status = 'encaixado', created_at, id")
      .bind(clinic.id, new Date(now.getTime() - 14 * 24 * HOUR).toISOString()).all<WaitEntry>(),
    db.prepare('SELECT * FROM events WHERE clinic_id = ? ORDER BY created_at DESC, id DESC LIMIT 40').bind(clinic.id).all(),
    db.prepare("SELECT * FROM appointments WHERE clinic_id = ? AND starts_at > ? AND starts_at < ? AND status IN ('ligar','remarcar','vago','sem_telefone') ORDER BY starts_at LIMIT 30")
      .bind(clinic.id, now.toISOString(), new Date(now.getTime() + 8 * 24 * HOUR).toISOString()).all<Appointment>(),
  ]);
  return c.json({
    date,
    today: localDateKey(now, clinic.timezone),
    simulated: isSimulated(c.env, clinic),
    appointments: appts.results,
    waitlist: waitlist.results,
    events: events.results,
    attention: attention.results,
  });
});

app.get('/api/clinics/:id/conversation', async (c) => {
  const clinic = c.get('clinic');
  const phone = c.req.query('phone') ?? '';
  if (!phone) return c.json({ messages: [] });
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM (SELECT * FROM messages WHERE clinic_id = ? AND phone_key = ? ORDER BY created_at DESC, id DESC LIMIT 60) ORDER BY created_at, id',
  ).bind(clinic.id, phoneKey(phone)).all<Message>();
  return c.json({ messages: results, window_open: await windowOpen(c.env, clinic, phone) });
});

app.post('/api/clinics/:id/simulate', async (c) => {
  const clinic = c.get('clinic');
  if (!isSimulated(c.env, clinic)) return fail(c, 409, 'O simulador só funciona no modo teste.');
  const body = await c.req.json<{ phone?: string; reply_id?: string; label?: string; text?: string }>();
  if (!body.phone || (!body.reply_id && !body.text?.trim())) return fail(c, 400, 'Informe a resposta do paciente.');
  await handleInbound(c.env, clinic, body.phone, { replyId: body.reply_id, text: body.text ?? body.label });
  return c.json({ ok: true });
});

app.post('/api/clinics/:id/send', async (c) => {
  const clinic = c.get('clinic');
  const body = await c.req.json<{ phone?: string; text?: string }>();
  const phone = normalizePhone(body.phone ?? '');
  const text = (body.text ?? '').trim();
  if (!phone || !text) return fail(c, 400, 'Informe o telefone e a mensagem.');
  if (!isSimulated(c.env, clinic) && !(await windowOpen(c.env, clinic, phone))) {
    return fail(c, 409, 'O WhatsApp só permite mensagem livre até 24h depois da última mensagem do paciente. Ligue para ele.');
  }
  const res = await send(c.env, clinic, phone, { kind: 'text', text });
  if (!res.ok) return fail(c, 500, res.error ?? 'Falha ao enviar.');
  return c.json({ ok: true });
});

app.post('/api/clinics/:id/whatsapp-check', async (c) => {
  const clinic = c.get('clinic');
  const steps = await checkConnection(whatsappToken(c.env, clinic), clinic.wa_phone_number_id, clinic.settings.wa_business_account_id.replace(/\D/g, ''));
  const failed = steps.find((s) => !s.ok);
  await logEvent(c.env, clinic.id, failed ? `Verificação do WhatsApp: ${failed.text}` : 'Verificação do WhatsApp concluída: tudo certo.', failed ? 'bad' : 'ok');
  return c.json({ steps });
});

app.post('/api/clinics/:id/run', async (c) => {
  const clinic = c.get('clinic');
  const body = await c.req.json<{ force?: boolean; now?: string }>().catch(() => ({ force: false, now: undefined }));
  // `now` permite simular outro horário nos testes locais (só com ALLOW_TIME_TRAVEL=1 no .dev.vars).
  const now = c.env.ALLOW_TIME_TRAVEL === '1' && body.now ? new Date(body.now) : undefined;
  return c.json(await runCycle(c.env, clinic, { force: Boolean(body.force), now }));
});

// ---------- Consultas e lista de espera ----------

app.post('/api/clinics/:id/appointments', async (c) => {
  const clinic = c.get('clinic');
  const b = await c.req.json<{ patient?: string; phone?: string; procedure?: string; value?: number | string; date?: string; time?: string; duration?: number | string }>();
  if (!b.patient?.trim() || !b.date || !b.time) return fail(c, 400, 'Informe paciente, data e horário.');
  const value = b.value === '' || b.value == null ? null : Math.round(Number(b.value));
  const id = await createAppointment(c.env, clinic, {
    patient: b.patient.trim(), phone: (b.phone ?? '').trim(), procedure: (b.procedure ?? '').trim(),
    value: Number.isFinite(value) ? value : null, date: b.date, time: b.time, duration: Number(b.duration) || 60,
  });
  return c.json({ id });
});

app.post('/api/clinics/:id/appointments/:aid/cancel', async (c) => {
  const clinic = c.get('clinic');
  const appt = await getAppointment(c.env, clinic.id, Number(c.req.param('aid')));
  if (!appt) return fail(c, 404, 'Consulta não encontrada.');
  await cancelAppointment(c.env, clinic, appt);
  return c.json({ ok: true });
});

app.post('/api/clinics/:id/waitlist', async (c) => {
  const clinic = c.get('clinic');
  const b = await c.req.json<{ name?: string; phone?: string; procedure?: string; preference?: string; value?: number | string }>();
  const phone = normalizePhone(b.phone ?? '');
  if (!b.name?.trim()) return fail(c, 400, 'Informe o nome.');
  if (!phone) return fail(c, 400, 'Telefone inválido. Use DDD + número, ex.: (11) 98765-4321.');
  const value = b.value === '' || b.value == null ? null : Math.round(Number(b.value));
  await c.env.DB.prepare('INSERT INTO waitlist (clinic_id, name, phone, procedure, preference, value) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(clinic.id, b.name.trim(), phone, (b.procedure ?? '').trim(), (b.preference ?? '').trim(), Number.isFinite(value) ? value : null).run();
  await logEvent(c.env, clinic.id, `${b.name.trim()} entrou na lista de espera.`);
  return c.json({ ok: true });
});

app.delete('/api/clinics/:id/waitlist/:wid', async (c) => {
  const clinic = c.get('clinic');
  const wid = Number(c.req.param('wid'));
  const w = await c.env.DB.prepare('SELECT * FROM waitlist WHERE clinic_id = ? AND id = ?').bind(clinic.id, wid).first<WaitEntry>();
  if (!w) return fail(c, 404, 'Pessoa não encontrada na lista.');
  if (w.status === 'oferta' && w.offered_appointment_id) {
    await c.env.DB.prepare("UPDATE appointments SET status = 'vago', offered_to = NULL WHERE id = ? AND offered_to = ?")
      .bind(w.offered_appointment_id, w.id).run();
  }
  await c.env.DB.prepare('DELETE FROM waitlist WHERE id = ?').bind(wid).run();
  return c.json({ ok: true });
});

// ---------- Webhook do WhatsApp ----------

app.get('/webhook/whatsapp', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  if (mode === 'subscribe' && token === verifyToken(c.env)) {
    return c.text(c.req.query('hub.challenge') ?? '');
  }
  return c.text('Token de verificação inválido.', 403);
});

app.post('/webhook/whatsapp', async (c) => {
  const raw = await c.req.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return c.text('Corpo inválido.', 400); }
  // A chave secreta pode estar no segredo do Cloudflare ou na clínica (portal). Só processa se a assinatura bater.
  const ids = [...new Set(parseWebhook(body).inbound.map((m) => m.phoneNumberId).concat(phoneIdsFromStatuses(body)))];
  const secrets = new Set<string>(c.env.WHATSAPP_APP_SECRET ? [c.env.WHATSAPP_APP_SECRET] : []);
  for (const id of ids) {
    const row = await c.env.DB.prepare("SELECT wa_app_secret FROM clinics WHERE wa_phone_number_id = ? AND wa_app_secret != ''").bind(id).first<{ wa_app_secret: string }>();
    if (row) secrets.add(row.wa_app_secret);
  }
  const signature = c.req.header('x-hub-signature-256') ?? null;
  let valid = false;
  for (const s of secrets) if (await verifySignature(s, raw, signature)) { valid = true; break; }
  if (!valid) {
    // O botão "Teste" da Meta usa um número fictício: confere com a chave de cada clínica e avisa no portal.
    const { results } = await c.env.DB.prepare("SELECT id, wa_app_secret FROM clinics WHERE wa_app_secret != ''").all<{ id: number; wa_app_secret: string }>();
    for (const r of results) {
      if (await verifySignature(r.wa_app_secret, raw, signature)) {
        const isMetaTest = ids.every((id) => id === '123456123');
        await logEvent(c.env, r.id, isMetaTest
          ? 'Teste de webhook da Meta recebido: a ligação com o WhatsApp está funcionando.'
          : `Chegou mensagem para o número de ID ${ids.join(', ')}, mas nenhuma clínica usa esse ID. Confira o “ID do número” em Configurações.`, isMetaTest ? 'ok' : 'bad');
        return c.text('ok');
      }
    }
    console.warn('Webhook com assinatura inválida');
    return c.text('Assinatura inválida.', 403);
  }
  c.executionCtx.waitUntil(processWebhook(c.env, body));
  return c.text('ok');
});

function phoneIdsFromStatuses(body: unknown): string[] {
  const entries = (body as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }> })?.entry ?? [];
  return entries.flatMap((e) => (e.changes ?? []).map((ch) => ch.value?.metadata?.phone_number_id ?? '')).filter(Boolean);
}

const STATUS_PT: Record<string, string> = { sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'erro' };

async function processWebhook(env: Env, body: unknown): Promise<void> {
  const { inbound, statuses } = parseWebhook(body);
  for (const m of inbound) {
    const row = await env.DB.prepare('SELECT * FROM clinics WHERE wa_phone_number_id = ?').bind(m.phoneNumberId).first<ClinicRow>();
    if (!row) { console.warn('Mensagem para número sem clínica', m.phoneNumberId); continue; }
    try {
      await handleInbound(env, toClinic(row), m.from, { replyId: m.replyId, text: m.text, waId: m.waId });
    } catch (e) {
      console.error('Falha ao processar mensagem', e);
      await logEvent(env, row.id, `Erro ao processar mensagem recebida: ${e instanceof Error ? e.message : e}`, 'bad');
    }
  }
  for (const s of statuses) {
    const status = STATUS_PT[s.status];
    if (!status) continue;
    await env.DB.prepare("UPDATE messages SET status = ?, error = COALESCE(?, error) WHERE wa_id = ? AND direction = 'out'")
      .bind(status, s.error ?? null, s.waId).run();
    if (status === 'erro') {
      const msg = await env.DB.prepare('SELECT clinic_id, phone FROM messages WHERE wa_id = ?').bind(s.waId).first<{ clinic_id: number; phone: string }>();
      // Mensagens enviadas pelo painel da Meta não estão no histórico: acha a clínica pelo número.
      const clinicId = msg?.clinic_id
        ?? (await env.DB.prepare('SELECT id FROM clinics WHERE wa_phone_number_id = ?').bind(s.phoneNumberId ?? '').first<{ id: number }>())?.id;
      if (clinicId) await logEvent(env, clinicId, `WhatsApp não entregou mensagem para ${msg?.phone ?? s.recipient ?? '?'}: ${s.error ?? 'erro'}`, 'bad');
    }
  }
}

// ---------- Exportação ----------

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      for (const clinic of await listClinics(env)) {
        try {
          await runCycle(env, clinic);
        } catch (e) {
          console.error(`Ciclo falhou para clínica ${clinic.id}`, e);
        }
      }
    })());
  },
} satisfies ExportedHandler<Env>;
