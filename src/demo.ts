// Demonstração: cada visitante do link /demo ganha uma clínica própria com dados fictícios, em modo teste.
// Nada sai pelo WhatsApp (ver isSimulated) e as clínicas de demonstração são apagadas depois de 1 dia.
import type { Env } from './db';
import { fillTemplate, firstName, phoneKey } from './parse';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { HOUR, MINUTE, addDays, atLocalTime, fmtLongDate, fmtSlot, fmtTime, localDateKey } from './time';

export const DEMO_TTL_HOURS = 24;
const MAX_NEW_PER_10_MIN = 40;

const TZ = 'America/Sao_Paulo';
const NAME = 'Clínica Sorriso';
const ADDRESS = 'Rua das Acácias, 120, sala 4 - Centro';

/** Apaga as clínicas de demonstração mais antigas que `DEMO_TTL_HOURS` e tudo o que pertence a elas. */
export async function cleanupDemos(env: Env, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - DEMO_TTL_HOURS * HOUR).toISOString();
  const old = 'SELECT id FROM clinics WHERE demo = 1 AND created_at < ?';
  await env.DB.batch([
    ...['messages', 'events', 'waitlist', 'appointments', 'patient_notes', 'budgets', 'finance', 'patients'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE clinic_id IN (${old})`).bind(cutoff)),
    env.DB.prepare('DELETE FROM clinics WHERE demo = 1 AND created_at < ?').bind(cutoff),
  ]);
}

type Seed = {
  key: string; day: number; time: string; name: string; phone: string | null; procedure: string; value: number | null;
  status: string; kind?: 'consulta' | 'vaga'; replaced?: string; movedFrom?: { day: number; time: string };
};

/** Cria uma clínica de demonstração com agenda, lista de espera, conversas e atividade. Retorna o ID. */
export async function createDemoClinic(env: Env, now = new Date()): Promise<number> {
  await cleanupDemos(env, now);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM clinics WHERE demo = 1 AND created_at > ?')
    .bind(new Date(now.getTime() - 10 * MINUTE).toISOString()).first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_NEW_PER_10_MIN) throw new Error('Muitas demonstrações abertas agora. Tente de novo em alguns minutos.');

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    test_mode: true,
    // Telas de gestão (pacientes, orçamentos, financeiro) ligadas: a demonstração é onde elas são testadas primeiro.
    modules_beta: true,
    dentist_name: 'Dra. Helena Prado',
    dentist_cro: 'CRO-SP 00000',
    // Aberta todos os dias, para a demonstração nunca cair num dia vazio.
    work_hours: { '0': '08:00-12:00', '1': '08:00-12:00, 13:00-19:00', '2': '08:00-12:00, 13:00-19:00', '3': '08:00-12:00, 13:00-19:00', '4': '08:00-12:00, 13:00-19:00', '5': '08:00-12:00, 13:00-19:00', '6': '08:00-13:00' },
  };
  const clinic = await env.DB.prepare('INSERT INTO clinics (name, address, timezone, settings, demo) VALUES (?, ?, ?, ?, 1) RETURNING id')
    .bind(NAME, ADDRESS, TZ, JSON.stringify(settings)).first<{ id: number }>();
  const cid = clinic!.id;

  const today = localDateKey(now, TZ);
  const at = (day: number, time: string) => atLocalTime(addDays(today, day), time, TZ);
  const ago = (min: number) => new Date(now.getTime() - min * MINUTE).toISOString();
  const slot = (day: number, time: string) => fmtSlot(at(day, time), TZ);
  const phone = (n: number) => `55119${String(80000000 + n * 1137).padStart(8, '0')}`;

  // ---------- Agenda (dia 0 = hoje) ----------
  const seeds: Seed[] = [
    { key: 'paulo', day: -1, time: '09:00', name: 'Paulo Mendonça', phone: phone(1), procedure: 'Limpeza', value: 180, status: 'confirmado' },
    { key: 'claudia', day: -1, time: '14:00', name: 'Cláudia Reis', phone: phone(2), procedure: 'Restauração', value: 250, status: 'confirmado' },

    { key: 'ana', day: 0, time: '08:00', name: 'Ana Beatriz Souza', phone: phone(3), procedure: 'Limpeza', value: 180, status: 'confirmado' },
    { key: 'carlos', day: 0, time: '09:00', name: 'Carlos Eduardo Lima', phone: phone(4), procedure: 'Restauração', value: 250, status: 'confirmado' },
    { key: 'roberto', day: 0, time: '10:30', name: 'Roberto Alves', phone: phone(5), procedure: 'Clareamento', value: 600, status: 'cancelado' },
    { key: 'juliana', day: 0, time: '10:30', name: 'Juliana Martins', phone: phone(6), procedure: 'Clareamento', value: 600, status: 'encaixe', replaced: 'Roberto Alves' },
    { key: 'pedro', day: 0, time: '14:00', name: 'Pedro Henrique Rocha', phone: phone(7), procedure: 'Avaliação', value: 120, status: 'confirmado' },
    { key: 'fernanda', day: 0, time: '15:30', name: 'Fernanda Costa', phone: phone(8), procedure: 'Manutenção do aparelho', value: 150, status: 'confirmado' },
    { key: 'lucas', day: 0, time: '17:00', name: 'Lucas Almeida', phone: phone(9), procedure: 'Tratamento de canal', value: 900, status: 'confirmado' },

    { key: 'mariana', day: 1, time: '08:00', name: 'Mariana Ribeiro', phone: phone(10), procedure: 'Limpeza', value: 180, status: 'confirmado' },
    { key: 'joao', day: 1, time: '09:00', name: 'João Pedro Santos', phone: phone(11), procedure: 'Extração', value: 350, status: 'aguardando' },
    { key: 'vaga', day: 1, time: '10:00', name: '', phone: null, procedure: 'Manutenção do aparelho', value: 150, status: 'oferecido', kind: 'vaga', replaced: 'Patrícia Gomes' },
    { key: 'camila', day: 1, time: '11:00', name: 'Camila Ferreira', phone: phone(12), procedure: 'Implante (consulta)', value: 1200, status: 'confirmado' },
    { key: 'bruno', day: 1, time: '13:30', name: 'Bruno Carvalho', phone: phone(13), procedure: 'Avaliação ortodôntica', value: 120, status: 'sem_resposta' },
    { key: 'larissa', day: 1, time: '14:30', name: 'Larissa Mendes', phone: phone(14), procedure: 'Restauração', value: 250, status: 'ligar' },
    { key: 'eduarda', day: 1, time: '15:30', name: 'Eduarda Lopes', phone: phone(15), procedure: 'Limpeza', value: 180, status: 'agendado' },
    { key: 'gabriel', day: 1, time: '16:30', name: 'Gabriel Oliveira', phone: phone(16), procedure: 'Limpeza', value: 180, status: 'remarcar' },
    { key: 'sofia', day: 1, time: '17:30', name: 'Sofia Barbosa', phone: phone(17), procedure: 'Clareamento', value: 600, status: 'confirmado' },

    { key: 'thiago', day: 2, time: '09:00', name: 'Thiago Pereira', phone: phone(18), procedure: 'Limpeza', value: 180, status: 'agendado' },
    { key: 'isabela', day: 2, time: '10:00', name: 'Isabela Cardoso', phone: phone(19), procedure: 'Restauração', value: 250, status: 'agendado' },
    { key: 'renata', day: 2, time: '14:00', name: 'Renata Araújo', phone: phone(20), procedure: 'Prótese', value: 1500, status: 'agendado' },
    { key: 'diego', day: 2, time: '16:00', name: 'Diego Moreira', phone: null, procedure: 'Avaliação', value: 120, status: 'sem_telefone' },

    { key: 'helena', day: 3, time: '08:30', name: 'Helena Vieira', phone: phone(21), procedure: 'Limpeza', value: 180, status: 'agendado' },
    { key: 'patricia', day: 3, time: '14:00', name: 'Patrícia Gomes', phone: phone(22), procedure: 'Manutenção do aparelho', value: 150, status: 'confirmado', movedFrom: { day: 1, time: '10:00' } },
    { key: 'marcos', day: 3, time: '16:00', name: 'Marcos Teixeira', phone: phone(23), procedure: 'Tratamento de canal', value: 900, status: 'agendado' },

    { key: 'otavio', day: 4, time: '09:00', name: 'Otávio Freitas', phone: phone(24), procedure: 'Avaliação', value: 120, status: 'agendado' },
    { key: 'beatriz', day: 4, time: '11:00', name: 'Beatriz Lopes', phone: phone(25), procedure: 'Clareamento', value: 600, status: 'agendado' },
    { key: 'simone', day: 4, time: '15:00', name: 'Simone Rezende', phone: phone(26), procedure: 'Restauração', value: 250, status: 'agendado' },

    { key: 'felipe', day: 5, time: '10:00', name: 'Felipe Cunha', phone: phone(27), procedure: 'Limpeza', value: 180, status: 'agendado' },
    { key: 'natalia', day: 5, time: '14:00', name: 'Natália Prado', phone: phone(28), procedure: 'Implante (consulta)', value: 1200, status: 'agendado' },
    { key: 'lucas2', day: 6, time: '17:00', name: 'Lucas Almeida', phone: phone(9), procedure: 'Tratamento de canal (2ª sessão)', value: null, status: 'agendado' },

    // Histórico (consultas antigas), para a ficha do paciente mostrar a linha do tempo.
    { key: 'h-ana', day: -180, time: '09:00', name: 'Ana Beatriz Souza', phone: phone(3), procedure: 'Limpeza', value: 180, status: 'confirmado' },
    { key: 'h-lucas1', day: -30, time: '16:00', name: 'Lucas Almeida', phone: phone(9), procedure: 'Avaliação', value: 120, status: 'confirmado' },
    { key: 'h-lucas2', day: -14, time: '17:00', name: 'Lucas Almeida', phone: phone(9), procedure: 'Tratamento de canal (1ª sessão)', value: null, status: 'confirmado' },
    { key: 'h-renata', day: -90, time: '14:00', name: 'Renata Araújo', phone: phone(20), procedure: 'Avaliação', value: 120, status: 'confirmado' },
    { key: 'h-camila', day: -60, time: '11:00', name: 'Camila Ferreira', phone: phone(12), procedure: 'Avaliação', value: 120, status: 'confirmado' },
    { key: 'h-carlos', day: -12, time: '09:00', name: 'Carlos Eduardo Lima', phone: phone(4), procedure: 'Avaliação', value: 120, status: 'confirmado' },
    { key: 'h-marta', day: -230, time: '10:00', name: 'Marta Siqueira', phone: phone(32), procedure: 'Limpeza', value: 180, status: 'confirmado' },
    { key: 'h-jorge', day: -400, time: '15:00', name: 'Jorge Batista', phone: phone(33), procedure: 'Avaliação', value: 120, status: 'confirmado' },
  ];

  const inserted = await env.DB.batch(seeds.map((s) => {
    const start = at(s.day, s.time);
    return env.DB.prepare(
      `INSERT INTO appointments (clinic_id, kind, source, patient_name, phone, procedure, value, starts_at, ends_at, status, replaced_name, moved_from)
       VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(
      cid, s.kind ?? 'consulta', s.name || null, s.phone, s.procedure, s.value, start.toISOString(), new Date(start.getTime() + HOUR).toISOString(),
      s.status, s.replaced ?? null, s.movedFrom ? at(s.movedFrom.day, s.movedFrom.time).toISOString() : null,
    );
  }));
  const id: Record<string, number> = {};
  seeds.forEach((s, i) => { id[s.key] = (inserted[i].results[0] as { id: number }).id; });
  const seed = (key: string) => seeds.find((s) => s.key === key)!;

  // ---------- Lista de espera ----------
  const waits = [
    { key: 'juliana', name: 'Juliana Martins', phone: seed('juliana').phone!, procedure: 'Clareamento', preference: 'Qualquer horário', value: 600, status: 'encaixado', offered: id.juliana, created: 5 * 24 * 60 },
    { key: 'rafael', name: 'Rafael Nunes', phone: phone(29), procedure: 'Manutenção do aparelho', preference: 'De manhã', value: 150, status: 'oferta', offered: id.vaga, created: 4 * 24 * 60 },
    { key: 'aline', name: 'Aline Duarte', phone: phone(30), procedure: 'Clareamento', preference: 'Só à tarde', value: 600, status: 'espera', offered: null, created: 3 * 24 * 60 },
    { key: 'vinicius', name: 'Vinícius Ramos', phone: phone(31), procedure: 'Avaliação', preference: 'Depois das 17h', value: 120, status: 'espera', offered: null, created: 20 * 60 },
  ];
  const wInserted = await env.DB.batch(waits.map((w) => env.DB.prepare(
    `INSERT INTO waitlist (clinic_id, name, phone, procedure, preference, value, status, offered_appointment_id, offered_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(cid, w.name, w.phone, w.procedure, w.preference, w.value, w.status, w.offered, w.key === 'rafael' ? ago(8) : null, ago(w.created))));
  const wid: Record<string, number> = {};
  waits.forEach((w, i) => { wid[w.key] = (wInserted[i].results[0] as { id: number }).id; });

  // ---------- Conversas ----------
  const s = settings;
  const vars = (name: string, day: number, time: string, procedure: string) => ({
    nome: firstName(name), clinica: NAME, procedimento: procedure, data: fmtLongDate(at(day, time), TZ), hora: fmtTime(at(day, time), TZ), endereco: ADDRESS,
  });
  const stmts: D1PreparedStatement[] = [];
  const msg = (key: string, dir: 'in' | 'out', body: string, minAgo: number, opts: { buttons?: Array<{ id: string; title: string }>; status?: string; appt?: number | null; wait?: number | null; phone?: string } = {}) => {
    const p = opts.phone ?? seed(key).phone!;
    stmts.push(env.DB.prepare(
      `INSERT INTO messages (clinic_id, appointment_id, waitlist_id, phone, phone_key, direction, body, buttons, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(cid, opts.appt === undefined ? id[key] ?? null : opts.appt, opts.wait ?? null, p, phoneKey(p), dir, body,
      opts.buttons ? JSON.stringify(opts.buttons) : null, dir === 'in' ? 'recebido' : opts.status ?? 'lido', ago(minAgo)));
  };
  const confirmMsg = (key: string, minAgo: number, status = 'lido') => {
    const a = seed(key);
    const day = a.movedFrom?.day ?? a.day;
    const time = a.movedFrom?.time ?? a.time;
    msg(key, 'out', fillTemplate(s.templates.confirm.preview, vars(a.name, day, time, a.procedure)), minAgo, {
      status, buttons: [{ id: `c:${id[key]}`, title: 'Confirmar' }, { id: `r:${id[key]}`, title: 'Remarcar' }],
    });
  };
  const confirmed = (key: string, minAgo: number, reply = 'Confirmar') => {
    const a = seed(key);
    msg(key, 'in', reply, minAgo);
    msg(key, 'out', fillTemplate(s.texts.confirmed, vars(a.name, a.day, a.time, a.procedure)), minAgo - 1);
  };

  const yesterday = 24 * 60 - 60;
  for (const [key, reply] of [['ana', 'Confirmar'], ['carlos', 'Confirmar'], ['pedro', 'Sim, estarei aí'], ['fernanda', 'Confirmar'], ['lucas', 'Confirmar']] as const) {
    confirmMsg(key, yesterday + 30);
    confirmed(key, yesterday - 20 - key.length * 7, reply);
  }
  for (const key of ['paulo', 'claudia']) { confirmMsg(key, 2 * 24 * 60); confirmed(key, 2 * 24 * 60 - 40); }

  // Juliana estava na lista de espera e ficou com o horário do Roberto.
  const ju = seed('juliana');
  msg('juliana', 'out', fillTemplate(s.templates.offer.preview, vars(ju.name, 0, ju.time, ju.procedure)), yesterday - 120, {
    wait: wid.juliana, buttons: [{ id: `a:${wid.juliana}`, title: 'Quero este horário' }, { id: `d:${wid.juliana}`, title: 'Não posso' }],
  });
  msg('juliana', 'in', 'Quero este horário', yesterday - 128, { wait: wid.juliana });
  msg('juliana', 'out', fillTemplate(s.texts.offer_accepted, vars(ju.name, 0, ju.time, ju.procedure)), yesterday - 129, { wait: wid.juliana });

  // Amanhã: confirmações enviadas hoje cedo.
  const sent = 240;
  for (const key of ['mariana', 'camila', 'sofia', 'patricia', 'gabriel']) confirmMsg(key, sent);
  for (const key of ['joao', 'bruno', 'larissa']) confirmMsg(key, sent, 'entregue');
  confirmed('mariana', sent - 12);
  confirmed('camila', sent - 55, 'Sim, estarei aí!');
  confirmed('sofia', sent - 110, 'vou sim, obrigada! 😊');
  for (const key of ['bruno', 'larissa']) {
    const a = seed(key);
    msg(key, 'out', fillTemplate(s.templates.confirm.preview, vars(a.name, a.day, a.time, a.procedure)), 60, {
      status: 'entregue', buttons: [{ id: `c:${id[key]}`, title: 'Confirmar' }, { id: `r:${id[key]}`, title: 'Remarcar' }],
    });
  }

  // Patrícia pediu para remarcar e escolheu outro dia; o horário dela foi oferecido à lista de espera.
  const slots = [{ day: 2, time: '11:00' }, { day: 3, time: '14:00' }, { day: 4, time: '08:00' }];
  const slotButtons = (key: string) => [
    ...slots.map((x) => ({ id: `s:${id[key]}:${Math.round(at(x.day, x.time).getTime() / MINUTE)}`, title: slot(x.day, x.time) })),
    { id: `h:${id[key]}`, title: 'Falar com a recepção' },
  ];
  msg('patricia', 'in', 'Remarcar', 14);
  msg('patricia', 'out', s.texts.reschedule, 14, { buttons: slotButtons('patricia') });
  msg('patricia', 'in', slot(3, '14:00'), 12);
  const pa = seed('patricia');
  msg('patricia', 'out', fillTemplate(s.texts.rescheduled, { ...vars(pa.name, 3, '14:00', pa.procedure), novo_horario: `${fmtLongDate(at(3, '14:00'), TZ)} às 14:00` }), 12);
  msg('rafael', 'out', fillTemplate(s.templates.offer.preview, vars('Rafael Nunes', 1, '10:00', 'Manutenção do aparelho')), 8, {
    phone: phone(29), appt: id.vaga, wait: wid.rafael, status: 'entregue',
    buttons: [{ id: `a:${wid.rafael}`, title: 'Quero este horário' }, { id: `d:${wid.rafael}`, title: 'Não posso' }],
  });

  // Gabriel quis falar com a recepção.
  msg('gabriel', 'in', 'Remarcar', 150);
  msg('gabriel', 'out', s.texts.reschedule, 150, { buttons: slotButtons('gabriel') });
  msg('gabriel', 'in', 'Falar com a recepção', 147);
  msg('gabriel', 'out', s.texts.human, 147);

  // ---------- Atividade ----------
  const ev = (minAgo: number, text: string, tone: '' | 'ok' | 'warn' | 'bad' = '', appt: number | null = null) => stmts.push(
    env.DB.prepare('INSERT INTO events (clinic_id, appointment_id, text, tone, created_at) VALUES (?, ?, ?, ?, ?)').bind(cid, appt, text, tone, ago(minAgo)),
  );
  ev(2 * 24 * 60 + 5, 'Confirmações enviadas para 2 paciente(s).');
  ev(yesterday + 30, 'Confirmações enviadas para 6 paciente(s).');
  ev(yesterday - 41, `Ana Beatriz Souza confirmou a consulta de ${slot(0, '08:00')}.`, 'ok', id.ana);
  ev(yesterday - 115, `Consulta de Roberto Alves (${slot(0, '10:30')}) cancelada no portal.`, 'warn', id.roberto);
  ev(yesterday - 120, `Vaga de ${slot(0, '10:30')} oferecida a Juliana Martins (lista de espera).`, 'warn', id.juliana);
  ev(yesterday - 128, `Encaixe: Juliana Martins ficou com o horário de ${slot(0, '10:30')}. Horário reaproveitado.`, 'ok', id.juliana);
  ev(20 * 60, 'Vinícius Ramos entrou na lista de espera.');
  ev(sent, 'Confirmações enviadas para 8 paciente(s).');
  ev(sent - 12, `Mariana Ribeiro confirmou a consulta de ${slot(1, '08:00')}.`, 'ok', id.mariana);
  ev(sent - 55, `Camila Ferreira confirmou a consulta de ${slot(1, '11:00')}.`, 'ok', id.camila);
  ev(sent - 110, `Sofia Barbosa confirmou a consulta de ${slot(1, '17:30')}.`, 'ok', id.sofia);
  ev(147, `Gabriel Oliveira quer falar com a recepção para remarcar (${slot(1, '16:30')}).`, 'bad', id.gabriel);
  ev(60, '2º lembrete enviado para 2 paciente(s) que não responderam.', 'warn');
  ev(40, `Consulta de Eduarda Lopes adicionada para ${slot(1, '15:30')}.`, '', id.eduarda);
  ev(25, `Larissa Mendes não respondeu. Recepção: ligar (consulta ${slot(1, '14:30')}).`, 'bad', id.larissa);
  ev(14, `Patrícia Gomes pediu para remarcar a consulta de ${slot(1, '10:00')}.`, 'warn', id.patricia);
  ev(12, `Patrícia Gomes remarcou para ${slot(3, '14:00')}. Horário de ${slot(1, '10:00')} liberado.`, '', id.patricia);
  ev(8, `Vaga de ${slot(1, '10:00')} oferecida a Rafael Nunes (lista de espera).`, 'warn', id.vaga);

  // Campos que mostram em que passo cada consulta está (para o ciclo automático continuar dali).
  const upd = (key: string, fields: Record<string, string | number | null>) => stmts.push(env.DB.prepare(
    `UPDATE appointments SET ${Object.keys(fields).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
  ).bind(...Object.values(fields), id[key]));
  for (const key of ['ana', 'carlos', 'pedro', 'fernanda', 'lucas', 'paulo', 'claudia']) upd(key, { confirm_sent_at: ago(yesterday + 30), replied_at: ago(yesterday) });
  upd('juliana', { confirm_sent_at: ago(yesterday - 128), replied_at: ago(yesterday - 128) });
  for (const key of ['mariana', 'camila', 'sofia']) upd(key, { confirm_sent_at: ago(sent), replied_at: ago(sent - 60) });
  upd('joao', { confirm_sent_at: ago(sent) });
  upd('bruno', { confirm_sent_at: ago(sent), second_sent_at: ago(60) });
  upd('larissa', { confirm_sent_at: ago(sent), second_sent_at: ago(60) });
  upd('gabriel', { confirm_sent_at: ago(sent), replied_at: ago(147) });
  upd('patricia', { confirm_sent_at: ago(sent), replied_at: ago(12) });
  upd('vaga', { offered_to: wid.rafael, offered_ids: String(wid.rafael) });
  await env.DB.batch(stmts);
  await seedRecords(env, cid, now, seeds, waits);
  return cid;
}

// ---------- Fichas, orçamentos e financeiro da demonstração ----------

const FEMALE = new Set(['Ana', 'Cláudia', 'Juliana', 'Fernanda', 'Mariana', 'Camila', 'Larissa', 'Eduarda', 'Sofia', 'Isabela', 'Renata',
  'Helena', 'Patrícia', 'Beatriz', 'Simone', 'Natália', 'Aline', 'Marta']);
const STREETS = ['Rua das Palmeiras', 'Av. dos Ipês', 'Rua Monte Azul', 'Rua das Hortênsias', 'Av. Brasil Novo', 'Rua do Mirante', 'Rua Jasmim', 'Alameda dos Pinheiros'];
const HOODS = ['Centro', 'Jardim Primavera', 'Vila Nova', 'Bela Vista', 'Parque das Flores'];
const PROFESSIONS = ['Professor', 'Engenheiro', 'Comerciante', 'Administrador', 'Estudante', 'Vendedor', 'Enfermeiro', 'Advogado', 'Aposentado', 'Designer'];
const PROFESSIONS_F = ['Professora', 'Engenheira', 'Comerciante', 'Administradora', 'Estudante', 'Vendedora', 'Enfermeira', 'Advogada', 'Aposentada', 'Designer'];
const INSURANCE = ['Particular', 'Particular', 'Plano Dental Bem-Estar', 'Particular', 'Convênio Empresa Alfa'];
const REFERRAL = ['Indicação de amigo', 'Instagram', 'Google', 'Indicação de amigo', 'Convênio', 'Passou na frente'];

/** CPF fictício, mas com os dígitos verificadores certos (passa na validação do cadastro). */
function fakeCpf(n: number): string {
  const d = String(100000000 + ((n * 7919113) % 899999999)).slice(0, 9).split('').map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    d.push(((sum * 10) % 11) % 10);
  }
  return d.join('');
}

const slug = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(' ').filter((_, i, a) => i === 0 || i === a.length - 1).join('.');

async function seedRecords(env: Env, cid: number, now: Date, seeds: Seed[], waits: Array<{ name: string; phone: string }>): Promise<void> {
  const today = localDateKey(now, TZ);
  const [year, month] = today.split('-').map(Number);
  const ago = (days: number) => new Date(now.getTime() - days * 24 * HOUR).toISOString();

  // Uma ficha para cada nome da agenda e da lista de espera.
  const people = new Map<string, string | null>();
  for (const s of seeds) if (s.name && !people.has(s.name)) people.set(s.name, s.phone);
  for (const w of waits) if (!people.has(w.name)) people.set(w.name, w.phone);
  const names = [...people.keys()];

  const special: Record<string, Record<string, string>> = {
    'Gabriel Oliveira': { birth_date: `${year - 15}-03-14`, profession: 'Estudante', guardian_name: 'Márcia Oliveira', guardian_phone: '5511988887777' },
    // Dois aniversariantes no mês, para o filtro "Aniversariantes" ter exemplos.
    'Mariana Ribeiro': { birth_date: `${year - 29}-${String(month).padStart(2, '0')}-${today.slice(8) > '20' ? '02' : '27'}` },
    'Pedro Henrique Rocha': { birth_date: `${year - 41}-${String(month).padStart(2, '0')}-${String(Math.min(28, Number(today.slice(8)))).padStart(2, '0')}` },
  };
  const yes = (d = '') => ({ a: 'sim', d });
  const no = { a: 'nao', d: '' };
  const allNo = (extra: Record<string, { a: string; d: string }> = {}) => ({
    tratamento: no, medicamentos: no, alergia: no, anestesia: no, pressao: no, diabetes: no, coracao: no, sangramento: no,
    gestante: no, fumante: no, infeccao: no, cirurgia: no, ...extra,
  });
  const anamnesis: Record<string, object> = {
    'Lucas Almeida': allNo({ queixa: { a: '', d: 'Dor forte no dente de baixo, lado esquerdo, ao mastigar.' }, alergia: yes('Penicilina'), sensibilidade: yes('Água gelada') }),
    'Renata Araújo': allNo({ queixa: { a: '', d: 'Quer repor os dentes que faltam do lado esquerdo.' }, pressao: yes('Controlada, usa losartana'), medicamentos: yes('Losartana 50 mg'), tratamento: yes('Cardiologista') }),
    'Otávio Freitas': allNo({ diabetes: yes('Tipo 2, controlada com metformina'), medicamentos: yes('Metformina') }),
    'Camila Ferreira': allNo({ queixa: { a: '', d: 'Perdeu um dente do fundo e quer fazer implante.' }, gestante: yes('Amamentando (bebê de 4 meses)') }),
    'Marcos Teixeira': allNo({ coracao: yes('Arritmia, acompanhamento com cardiologista'), medicamentos: yes('Anticoagulante'), sangramento: yes('Usa anticoagulante') }),
    'Ana Beatriz Souza': allNo({ sangra_gengiva: yes('Às vezes, na parte de baixo') }),
    'Carlos Eduardo Lima': allNo({ fumante: yes('10 cigarros por dia') }),
    'Sofia Barbosa': allNo({ sensibilidade: yes('Depois de clarear em casa') }),
    'Fernanda Costa': allNo(),
    'Mariana Ribeiro': allNo(),
    'Juliana Martins': allNo(),
  };
  const odontogram: Record<string, object> = {
    'Lucas Almeida': { 36: { s: 'canal', n: 'Canal em andamento (2ª sessão marcada)' }, 46: { s: 'restaurado', n: '' }, 18: { s: 'ausente', n: '' }, 28: { s: 'ausente', n: '' } },
    'Ana Beatriz Souza': { 16: { s: 'restaurado', n: 'Resina' }, 26: { s: 'restaurado', n: 'Resina' } },
    'Renata Araújo': { 35: { s: 'ausente', n: '' }, 36: { s: 'ausente', n: '' }, 46: { s: 'fratura', n: 'Fratura na cúspide, indicar coroa' }, 17: { s: 'restaurado', n: 'Amálgama antiga' } },
    'Carlos Eduardo Lima': { 25: { s: 'carie', n: 'Cárie na face oclusal' }, 37: { s: 'restaurado', n: '' } },
    'Camila Ferreira': { 46: { s: 'ausente', n: 'Extraído há 2 anos' }, 11: { s: 'coroa', n: '' } },
    'Natália Prado': { 36: { s: 'implante', n: 'Implante de 2023' }, 48: { s: 'extrair', n: 'Siso incluso' } },
    'Marcos Teixeira': { 47: { s: 'carie', n: '' }, 14: { s: 'canal', n: 'Canal antigo' } },
  };

  const rows = names.map((name, i) => {
    const first = name.split(' ')[0];
    const female = FEMALE.has(first);
    const age = 22 + ((i * 11) % 45);
    const p = people.get(name) ?? '';
    const sp = special[name] ?? {};
    return {
      name, phone: p, phone_key: p ? phoneKey(p) : '', cpf: name === 'Diego Moreira' ? '' : fakeCpf(i + 3),
      birth_date: sp.birth_date ?? `${year - age}-${String(((i * 5) % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`,
      sex: female ? 'Feminino' : 'Masculino', email: p ? `${slug(name)}@exemplo.com` : '', profession: sp.profession ?? (female ? PROFESSIONS_F : PROFESSIONS)[i % PROFESSIONS.length],
      cep: `0${String(1000000 + i * 3571).slice(0, 7)}`, address: `${STREETS[i % STREETS.length]}, ${40 + i * 17}`, neighborhood: HOODS[i % HOODS.length],
      city: 'São Paulo', state: 'SP', insurance: INSURANCE[i % INSURANCE.length],
      insurance_number: INSURANCE[i % INSURANCE.length] === 'Particular' ? '' : `00${(i * 48271) % 999999}`.slice(-8),
      guardian_name: sp.guardian_name ?? '', guardian_phone: sp.guardian_phone ?? '', referral: REFERRAL[i % REFERRAL.length],
      notes: name === 'Marcos Teixeira' ? 'Prefere horários no fim da tarde. Avisar antes de qualquer procedimento com sangramento (usa anticoagulante).' : '',
      anamnesis: JSON.stringify(anamnesis[name] ?? {}), anamnesis_at: anamnesis[name] ? ago(10 + (i % 20)) : null,
      odontogram: JSON.stringify(odontogram[name] ?? {}), created_at: ago(30 + i * 9),
    };
  });
  const cols = Object.keys(rows[0]) as Array<keyof (typeof rows)[number]>;
  const pInserted = await env.DB.batch(rows.map((r) => env.DB.prepare(
    `INSERT INTO patients (clinic_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')}) RETURNING id`,
  ).bind(cid, ...cols.map((k) => r[k]))));
  const pid: Record<string, number> = {};
  names.forEach((n, i) => { pid[n] = (pInserted[i].results[0] as { id: number }).id; });

  // Orçamentos (valores em centavos).
  type B = { who: string; title: string; status: string; items: Array<{ proc: string; tooth: string; value: number; done?: boolean }>; discount: number; installments: number; method: string; created: number; approved?: number; notes?: string };
  const budgets: B[] = [
    { who: 'Lucas Almeida', title: 'Canal e restauração do 36', status: 'aprovado', created: 30, approved: 29, discount: 5000, installments: 3, method: 'Cartão de crédito',
      items: [{ proc: 'Tratamento de canal', tooth: '36', value: 90000, done: false }, { proc: 'Restauração em resina', tooth: '36', value: 25000 }] },
    { who: 'Renata Araújo', title: 'Prótese e coroa', status: 'aberto', created: 88, discount: 0, installments: 6, method: 'Boleto', notes: 'Paciente vai pensar e retornar.',
      items: [{ proc: 'Prótese parcial removível', tooth: '35, 36', value: 180000 }, { proc: 'Coroa de porcelana', tooth: '46', value: 150000 }] },
    { who: 'Camila Ferreira', title: 'Implante do 46', status: 'aberto', created: 58, discount: 20000, installments: 10, method: 'Cartão de crédito',
      items: [{ proc: 'Implante', tooth: '46', value: 280000 }, { proc: 'Coroa sobre implante', tooth: '46', value: 150000 }] },
    { who: 'Carlos Eduardo Lima', title: 'Restauração do 25', status: 'aprovado', created: 12, approved: 12, discount: 0, installments: 1, method: 'Pix',
      items: [{ proc: 'Restauração em resina', tooth: '25', value: 25000 }] },
    { who: 'Bruno Carvalho', title: 'Aparelho ortodôntico', status: 'recusado', created: 40, discount: 0, installments: 12, method: 'Boleto', notes: 'Achou caro, vai voltar no ano que vem.',
      items: [{ proc: 'Instalação do aparelho fixo', tooth: '', value: 120000 }, { proc: 'Manutenção mensal (12x)', tooth: '', value: 180000 }] },
  ];
  const bInserted = await env.DB.batch(budgets.map((b) => env.DB.prepare(
    'INSERT INTO budgets (clinic_id, patient_id, title, status, items, discount, installments, method, notes, approved_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
  ).bind(cid, pid[b.who], b.title, b.status, JSON.stringify(b.items.map((x) => ({ ...x, done: x.done ?? false }))), b.discount, b.installments, b.method,
    b.notes ?? '', b.approved ? ago(b.approved) : null, ago(b.created), ago(b.approved ?? b.created))));
  const bid = (i: number) => (bInserted[i].results[0] as { id: number }).id;

  const stmts: D1PreparedStatement[] = [];
  const fin = (kind: 'receita' | 'despesa', description: string, category: string, reais: number, due: string, paid: string | null, method = '', who: string | null = null, budget: number | null = null) => {
    stmts.push(env.DB.prepare('INSERT INTO finance (clinic_id, kind, description, category, amount, due_date, paid_at, method, patient_id, budget_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(cid, kind, description, category, Math.round(reais * 100), due, paid, method, who ? pid[who] : null, budget));
  };
  const day = (n: number) => addDays(today, n);
  const ofMonth = (d: number) => `${today.slice(0, 8)}${String(d).padStart(2, '0')}`;
  const paidIfPast = (key: string) => (key <= today ? key : null);

  // Parcelas do orçamento aprovado do Lucas (R$ 1.100 em 3x) e do Carlos (Pix, pago).
  fin('receita', 'Canal e restauração do 36 (1/3)', 'Tratamento', 366.68, day(-29), day(-29), 'Cartão de crédito', 'Lucas Almeida', bid(0));
  fin('receita', 'Canal e restauração do 36 (2/3)', 'Tratamento', 366.66, day(1), null, 'Cartão de crédito', 'Lucas Almeida', bid(0));
  fin('receita', 'Canal e restauração do 36 (3/3)', 'Tratamento', 366.66, day(31), null, 'Cartão de crédito', 'Lucas Almeida', bid(0));
  fin('receita', 'Restauração do 25', 'Tratamento', 250, day(0), null, 'Pix', 'Carlos Eduardo Lima', bid(3));
  // Consultas pagas no dia.
  fin('receita', 'Limpeza', 'Consulta', 180, day(-1), day(-1), 'Pix', 'Paulo Mendonça');
  fin('receita', 'Restauração', 'Consulta', 250, day(-1), day(-1), 'Cartão de débito', 'Cláudia Reis');
  fin('receita', 'Limpeza', 'Consulta', 180, day(0), day(0), 'Dinheiro', 'Ana Beatriz Souza');
  fin('receita', 'Avaliação', 'Consulta', 120, day(-12), day(-12), 'Pix', 'Carlos Eduardo Lima');
  fin('receita', 'Avaliação', 'Consulta', 120, day(-30), day(-30), 'Dinheiro', 'Lucas Almeida');
  fin('receita', 'Avaliação', 'Consulta', 120, day(-45), null, 'Boleto', 'Jorge Batista');
  // Atendimentos pagos nos dias anteriores do mês (para o caixa da demonstração ter movimento).
  const sales: Array<[string, number]> = [['Limpeza', 180], ['Restauração', 250], ['Clareamento', 600], ['Avaliação', 120], ['Manutenção do aparelho', 150], ['Tratamento de canal', 900], ['Limpeza', 180], ['Extração', 350]];
  const payWith = ['Pix', 'Cartão de débito', 'Dinheiro', 'Cartão de crédito', 'Pix'];
  for (let d = 1, k = 0; d < Number(today.slice(8)) - 1; d++) {
    for (let j = 0; j < 2; j++, k++) {
      const [proc, value] = sales[k % sales.length];
      const who = names[(k * 7) % names.length];
      fin('receita', proc, 'Consulta', value, ofMonth(d), ofMonth(d), payWith[k % payWith.length], who);
    }
  }
  // Despesas do mês.
  fin('despesa', 'Aluguel da sala', 'Aluguel', 3500, ofMonth(5), paidIfPast(ofMonth(5)), 'Transferência');
  fin('despesa', 'Material odontológico (resinas, luvas, anestésicos)', 'Material', 1240.5, ofMonth(10), paidIfPast(ofMonth(10)), 'Boleto');
  fin('despesa', 'Conta de luz', 'Contas da clínica', 382.9, ofMonth(15), paidIfPast(ofMonth(15)), 'Débito automático');
  fin('despesa', 'Laboratório de prótese', 'Laboratório', 850, day(5), null, 'Pix');
  fin('despesa', 'Salário da auxiliar', 'Salários', 2200, ofMonth(28), paidIfPast(ofMonth(28)), 'Transferência');
  fin('despesa', 'Internet e telefone', 'Contas da clínica', 149.9, day(-3), null, 'Boleto');

  // Evoluções do prontuário.
  const note = (who: string, daysAgo: number, text: string) => stmts.push(
    env.DB.prepare('INSERT INTO patient_notes (clinic_id, patient_id, text, created_at) VALUES (?, ?, ?, ?)').bind(cid, pid[who], text, ago(daysAgo)),
  );
  note('Ana Beatriz Souza', 180, 'Profilaxia e aplicação de flúor. Gengivite leve na região inferior; orientada sobre o uso do fio dental. Retorno em 6 meses.');
  note('Lucas Almeida', 30, 'Avaliação: dor espontânea no 36. Raio-X periapical mostra lesão próxima à polpa. Indicado tratamento de canal. Orçamento entregue e aprovado.');
  note('Lucas Almeida', 14, 'Canal do 36, 1ª sessão: abertura, odontometria e medicação intracanal. Paciente sem dor no fim do atendimento. Alergia a penicilina: receitado outro antibiótico.');
  note('Renata Araújo', 90, 'Avaliação para prótese: ausência do 35 e do 36, fratura no 46. Planejada prótese parcial removível e coroa no 46. Pressão aferida: 13x8.');
  note('Camila Ferreira', 60, 'Avaliação para implante na região do 46. Pedido de tomografia. Amamentando: adiar cirurgia até liberação médica.');
  note('Carlos Eduardo Lima', 12, 'Avaliação: cárie oclusal no 25. Restauração em resina marcada. Orientado a reduzir o cigarro.');
  note('Marta Siqueira', 230, 'Profilaxia. Sem cáries. Retorno em 6 meses (paciente não voltou; chamar para revisão).');
  await env.DB.batch(stmts);
}
