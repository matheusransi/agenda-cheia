// Gestão da clínica: ficha do paciente (cadastro, anamnese, odontograma), evoluções, orçamentos e financeiro.
import type { Context, Hono } from 'hono';
import { type Appointment, type Clinic, type Env, logEvent, nowIso } from './db';
import { normalizePhone, phoneKey } from './parse';
import { localDateKey } from './time';

export type AppEnv = { Bindings: Env; Variables: { clinic: Clinic; demo: number | null } };

// ---------- Tipos ----------

export type Patient = {
  id: number; clinic_id: number; name: string; phone: string; phone_key: string; phone2: string; email: string; cpf: string;
  birth_date: string; sex: string; profession: string; cep: string; address: string; neighborhood: string; city: string; state: string;
  insurance: string; insurance_number: string; guardian_name: string; guardian_phone: string; referral: string; notes: string;
  anamnesis: string; anamnesis_at: string | null; odontogram: string; created_at: string; updated_at: string;
};

export type BudgetItem = { proc: string; tooth: string; value: number; done: boolean };
export type Budget = {
  id: number; clinic_id: number; patient_id: number; title: string; status: 'aberto' | 'aprovado' | 'recusado'; items: string;
  discount: number; installments: number; method: string; notes: string; approved_at: string | null; created_at: string; updated_at: string;
};
export type FinanceEntry = {
  id: number; clinic_id: number; kind: 'receita' | 'despesa'; description: string; category: string; amount: number;
  due_date: string; paid_at: string | null; method: string; patient_id: number | null; budget_id: number | null; created_at: string;
};

// ---------- Validação ----------

/** Confere os dígitos verificadores do CPF. */
export function isValidCpf(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[len])) return false;
  }
  return true;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: string) => DATE_RE.test(v) && !Number.isNaN(new Date(v + 'T12:00:00Z').getTime());

const TEXT_FIELDS: Array<[keyof Patient, number]> = [
  ['email', 120], ['sex', 20], ['profession', 80], ['address', 200], ['neighborhood', 80], ['city', 80],
  ['insurance', 80], ['insurance_number', 40], ['guardian_name', 120], ['referral', 60], ['notes', 2000],
];

/** Lê e valida os campos do cadastro. Lança erro com a mensagem para a recepção. */
export function cleanPatient(body: Record<string, unknown>, today: string): Partial<Patient> {
  const str = (k: string, max = 200) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '');
  const out: Partial<Patient> = {};
  const name = str('name', 120).replace(/\s+/g, ' ');
  if (!name) throw new Error('Informe o nome do paciente.');
  out.name = name;
  for (const [k, max] of TEXT_FIELDS) (out as Record<string, string>)[k] = str(k, max);
  const phone = (key: 'phone' | 'phone2' | 'guardian_phone', label: string) => {
    const raw = str(key, 40);
    if (!raw) return '';
    const n = normalizePhone(raw);
    if (!n) throw new Error(`${label} inválido. Use DDD + número, ex.: (11) 98765-4321.`);
    return n;
  };
  out.phone = phone('phone', 'WhatsApp');
  out.phone_key = out.phone ? phoneKey(out.phone) : '';
  out.phone2 = phone('phone2', 'Outro telefone');
  out.guardian_phone = phone('guardian_phone', 'Telefone do responsável');
  const cpf = str('cpf', 20).replace(/\D/g, '');
  if (cpf && !isValidCpf(cpf)) throw new Error('CPF inválido. Confira os números.');
  out.cpf = cpf;
  const birth = str('birth_date', 10);
  if (birth && (!isDate(birth) || birth > today || birth < '1900-01-01')) throw new Error('Data de nascimento inválida.');
  out.birth_date = birth;
  const cep = str('cep', 12).replace(/\D/g, '');
  if (cep && cep.length !== 8) throw new Error('CEP inválido: deve ter 8 números.');
  out.cep = cep;
  out.state = str('state', 2).toUpperCase().replace(/[^A-Z]/g, '');
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error('E-mail inválido.');
  return out;
}

/** Anamnese: {"pergunta": {"a": "sim"|"nao"|"", "d": "detalhe"}}. Ignora o que não estiver nesse formato. */
export function cleanAnamnesis(v: unknown): Record<string, { a: string; d: string }> {
  const out: Record<string, { a: string; d: string }> = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const [k, raw] of Object.entries(v).slice(0, 60)) {
    if (!/^[a-z_]{1,30}$/.test(k) || typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const a = r.a === 'sim' || r.a === 'nao' ? r.a : '';
    const d = typeof r.d === 'string' ? r.d.trim().slice(0, 300) : '';
    if (a || d) out[k] = { a, d };
  }
  return out;
}

export const TOOTH_STATUS = ['carie', 'restaurado', 'canal', 'coroa', 'implante', 'ausente', 'extrair', 'fratura', 'protese'];

/** Dentes na numeração da FDI: permanentes 11–48 e de leite 51–85. */
export function isTooth(t: string): boolean {
  const m = /^([1-8])([1-8])$/.exec(t);
  if (!m) return false;
  const q = Number(m[1]);
  return q <= 4 || Number(m[2]) <= 5;
}

export function cleanOdontogram(v: unknown): Record<string, { s: string; n: string }> {
  const out: Record<string, { s: string; n: string }> = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const [k, raw] of Object.entries(v)) {
    if (!isTooth(k) || typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const s = typeof r.s === 'string' && TOOTH_STATUS.includes(r.s) ? r.s : '';
    const n = typeof r.n === 'string' ? r.n.trim().slice(0, 200) : '';
    if (s || n) out[k] = { s, n };
  }
  return out;
}

const cents = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100_000_000) : 0;
};

export function cleanBudget(body: Record<string, unknown>): Pick<Budget, 'title' | 'discount' | 'installments' | 'method' | 'notes'> & { items: BudgetItem[] } {
  const raw = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  const items: BudgetItem[] = [];
  for (const it of raw) {
    if (typeof it !== 'object' || it === null) continue;
    const r = it as Record<string, unknown>;
    const proc = typeof r.proc === 'string' ? r.proc.trim().slice(0, 120) : '';
    if (!proc) continue;
    const tooth = typeof r.tooth === 'string' ? r.tooth.trim().slice(0, 20) : '';
    items.push({ proc, tooth, value: cents(r.value), done: r.done === true });
  }
  if (!items.length) throw new Error('Adicione pelo menos um procedimento ao orçamento.');
  const total = items.reduce((s, i) => s + i.value, 0);
  const discount = Math.min(cents(body.discount), total);
  const installments = Math.min(24, Math.max(1, Math.round(Number(body.installments)) || 1));
  const str = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '');
  return { title: str('title', 120), items, discount, installments, method: str('method', 40), notes: str('notes', 1000) };
}

export function budgetTotal(b: { items: BudgetItem[]; discount: number }): number {
  return Math.max(0, b.items.reduce((s, i) => s + i.value, 0) - b.discount);
}

/** Mesmo dia nos meses seguintes (31/01 → 28/02 → 31/03). */
export function addMonths(key: string, months: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** Divide o total em parcelas mensais; os centavos que sobram vão na primeira. */
export function installmentPlan(total: number, n: number, firstDue: string): Array<{ amount: number; due: string }> {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({ amount: base + (i === 0 ? total - base * n : 0), due: addMonths(firstDue, i) }));
}

export function cleanFinance(body: Record<string, unknown>): Omit<FinanceEntry, 'id' | 'clinic_id' | 'created_at' | 'budget_id'> {
  const str = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '');
  const kind = body.kind === 'despesa' ? 'despesa' : 'receita';
  const description = str('description', 160);
  if (!description) throw new Error('Informe a descrição.');
  const amount = cents(body.amount);
  if (!amount) throw new Error('Informe um valor maior que zero.');
  const due = str('due_date', 10);
  if (!isDate(due)) throw new Error('Informe a data de vencimento.');
  const paid = str('paid_at', 10);
  if (paid && !isDate(paid)) throw new Error('Data de pagamento inválida.');
  const pid = Number(body.patient_id);
  return {
    kind, description, category: str('category', 60), amount, due_date: due, paid_at: paid || null, method: str('method', 40),
    patient_id: Number.isInteger(pid) && pid > 0 ? pid : null,
  };
}

// ---------- Consultas do paciente ----------

/**
 * Condição SQL que liga uma consulta (a) a um paciente (p): mesmo telefone (com ou sem o nono dígito) e mesmo primeiro nome
 * (mãe e filho podem usar o mesmo WhatsApp), ou o nome completo igual.
 */
const APPT_MATCH = `(
  (p.phone_key != '' AND a.phone IS NOT NULL AND substr(a.phone, 3, 2) || substr(a.phone, -8) = p.phone_key
    AND lower(substr(a.patient_name, 1, instr(a.patient_name || ' ', ' ') - 1)) = lower(substr(p.name, 1, instr(p.name || ' ', ' ') - 1)))
  OR lower(a.patient_name) = lower(p.name)
)`;

/** Garante que quem tem consulta ou entra na lista de espera também tenha ficha (cria uma ficha simples se não houver). */
export async function ensurePatient(env: Env, clinicId: number, name: string | null, phone: string | null): Promise<void> {
  const n = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) return;
  const key = phone ? phoneKey(phone) : '';
  const first = n.split(' ')[0].toLowerCase();
  const found = await env.DB.prepare(
    `SELECT id FROM patients WHERE clinic_id = ? AND (lower(name) = lower(?)
       OR (? != '' AND phone_key = ? AND lower(substr(name, 1, instr(name || ' ', ' ') - 1)) = ?)) LIMIT 1`,
  ).bind(clinicId, n, key, key, first).first();
  if (found) return;
  await env.DB.prepare('INSERT INTO patients (clinic_id, name, phone, phone_key) VALUES (?, ?, ?, ?)').bind(clinicId, n, phone ?? '', key).run();
}

// ---------- Rotas ----------

const fail = (c: Context, status: 400 | 404 | 409, error: string) => c.json({ error }, status);
const today = (c: Context<AppEnv>) => localDateKey(new Date(), c.get('clinic').timezone);

/** Aprova o orçamento e lança as parcelas no financeiro (contas a receber). Retorna quantas parcelas foram lançadas. */
export async function approveBudget(env: Env, clinic: Clinic, b: Budget, firstDue: string, how = ''): Promise<number> {
  const p = await getPatient(env, clinic.id, b.patient_id);
  const parsed = parseBudget(b);
  const plan = parsed.total > 0 ? installmentPlan(parsed.total, b.installments, firstDue) : [];
  const label = parsed.title || parsed.items.map((i) => i.proc).slice(0, 2).join(', ');
  await env.DB.batch([
    env.DB.prepare("UPDATE budgets SET status = 'aprovado', approved_at = ?, updated_at = ? WHERE id = ?").bind(nowIso(), nowIso(), b.id),
    ...plan.map((x, i) => env.DB.prepare(
      "INSERT INTO finance (clinic_id, kind, description, category, amount, due_date, method, patient_id, budget_id) VALUES (?, 'receita', ?, 'Tratamento', ?, ?, ?, ?, ?)",
    ).bind(clinic.id, `${label}${plan.length > 1 ? ` (${i + 1}/${plan.length})` : ''}`, x.amount, x.due, b.method, b.patient_id, b.id)),
  ]);
  await logEvent(env, clinic.id, `Orçamento de ${p?.name ?? 'paciente'} aprovado${how}: ${plan.length} parcela(s) lançada(s) no financeiro.`, 'ok');
  return plan.length;
}

export async function getPatient(env: Env, clinicId: number, id: number): Promise<Patient | null> {
  return env.DB.prepare('SELECT * FROM patients WHERE clinic_id = ? AND id = ?').bind(clinicId, id).first<Patient>();
}

export function parseBudget(b: Budget) {
  let items: BudgetItem[] = [];
  try { items = JSON.parse(b.items); } catch { items = []; }
  return { ...b, items, total: budgetTotal({ items, discount: b.discount }) };
}

export function registerRecords(app: Hono<AppEnv>): void {
  // Lista de pacientes, com a próxima e a última consulta de cada um. `?phone=` filtra pelo telefone (usado na conversa).
  app.get('/api/clinics/:id/patients', async (c) => {
    const clinic = c.get('clinic');
    const now = nowIso();
    const phone = normalizePhone(c.req.query('phone') ?? '');
    const live = "a.clinic_id = p.clinic_id AND a.kind = 'consulta' AND a.status NOT IN ('cancelado', 'vago', 'oferecido')";
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.phone, p.phone2, p.email, p.cpf, p.birth_date, p.sex, p.insurance, p.city, p.anamnesis, p.created_at,
         (SELECT MIN(a.starts_at) FROM appointments a WHERE ${live} AND a.starts_at >= ? AND ${APPT_MATCH}) AS next_at,
         (SELECT MAX(a.starts_at) FROM appointments a WHERE ${live} AND a.starts_at < ? AND ${APPT_MATCH}) AS last_at
       FROM patients p WHERE p.clinic_id = ?${phone ? ' AND p.phone_key = ?' : ''} ORDER BY p.name COLLATE NOCASE LIMIT 2000`,
    ).bind(now, now, clinic.id, ...(phone ? [phoneKey(phone)] : [])).all();
    return c.json(results);
  });

  app.post('/api/clinics/:id/patients', async (c) => {
    const clinic = c.get('clinic');
    let fields: Partial<Patient>;
    try { fields = cleanPatient(await c.req.json(), today(c)); } catch (e) { return fail(c, 400, (e as Error).message); }
    if (fields.cpf) {
      const dup = await c.env.DB.prepare('SELECT name FROM patients WHERE clinic_id = ? AND cpf = ?').bind(clinic.id, fields.cpf).first<{ name: string }>();
      if (dup) return fail(c, 409, `Já existe um paciente com esse CPF: ${dup.name}.`);
    }
    const keys = Object.keys(fields);
    const row = await c.env.DB.prepare(
      `INSERT INTO patients (clinic_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')}) RETURNING id`,
    ).bind(clinic.id, ...keys.map((k) => (fields as Record<string, unknown>)[k])).first<{ id: number }>();
    await logEvent(c.env, clinic.id, `Ficha de ${fields.name} cadastrada.`);
    return c.json({ id: row!.id });
  });

  // Cria fichas para quem já tem consulta na agenda e ainda não foi cadastrado.
  app.post('/api/clinics/:id/patients/import', async (c) => {
    const clinic = c.get('clinic');
    const before = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM patients WHERE clinic_id = ?').bind(clinic.id).first<{ n: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT patient_name, phone FROM appointments WHERE clinic_id = ? AND kind = 'consulta' AND patient_name IS NOT NULL AND patient_name != ''
       GROUP BY lower(patient_name), phone ORDER BY MAX(starts_at) DESC LIMIT 3000`,
    ).bind(clinic.id).all<{ patient_name: string; phone: string | null }>();
    for (const r of results) await ensurePatient(c.env, clinic.id, r.patient_name, r.phone);
    const after = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM patients WHERE clinic_id = ?').bind(clinic.id).first<{ n: number }>();
    return c.json({ created: (after?.n ?? 0) - (before?.n ?? 0) });
  });

  app.get('/api/clinics/:id/patients/:pid', async (c) => {
    const clinic = c.get('clinic');
    const p = await getPatient(c.env, clinic.id, Number(c.req.param('pid')));
    if (!p) return fail(c, 404, 'Paciente não encontrado.');
    const db = c.env.DB;
    const [appts, notes, budgets, finance, documents, attachments] = await Promise.all([
      db.prepare(`SELECT a.* FROM appointments a, patients p WHERE p.id = ? AND a.clinic_id = ? AND a.kind = 'consulta' AND ${APPT_MATCH}
        ORDER BY a.starts_at DESC LIMIT 200`).bind(p.id, clinic.id).all<Appointment>(),
      db.prepare('SELECT * FROM patient_notes WHERE clinic_id = ? AND patient_id = ? ORDER BY created_at DESC, id DESC LIMIT 300').bind(clinic.id, p.id).all(),
      db.prepare('SELECT * FROM budgets WHERE clinic_id = ? AND patient_id = ? ORDER BY created_at DESC, id DESC').bind(clinic.id, p.id).all<Budget>(),
      db.prepare('SELECT * FROM finance WHERE clinic_id = ? AND patient_id = ? ORDER BY due_date, id').bind(clinic.id, p.id).all<FinanceEntry>(),
      db.prepare('SELECT * FROM documents WHERE clinic_id = ? AND patient_id = ? ORDER BY created_at DESC, id DESC').bind(clinic.id, p.id).all(),
      db.prepare('SELECT id, name, mime, size, category, caption, created_at, thumb IS NOT NULL AS has_thumb FROM attachments WHERE clinic_id = ? AND patient_id = ? ORDER BY created_at DESC, id DESC')
        .bind(clinic.id, p.id).all(),
    ]);
    return c.json({
      patient: p, appointments: appts.results, notes: notes.results, budgets: budgets.results.map(parseBudget), finance: finance.results,
      documents: documents.results, attachments: attachments.results,
    });
  });

  // Atualiza o cadastro (quando vem `name`), a anamnese (`anamnesis`) e/ou o odontograma (`odontogram`).
  app.put('/api/clinics/:id/patients/:pid', async (c) => {
    const clinic = c.get('clinic');
    const p = await getPatient(c.env, clinic.id, Number(c.req.param('pid')));
    if (!p) return fail(c, 404, 'Paciente não encontrado.');
    const body = await c.req.json<Record<string, unknown>>();
    const fields: Record<string, unknown> = {};
    if (body.name !== undefined) {
      try { Object.assign(fields, cleanPatient(body, today(c))); } catch (e) { return fail(c, 400, (e as Error).message); }
      if (fields.cpf) {
        const dup = await c.env.DB.prepare('SELECT name FROM patients WHERE clinic_id = ? AND cpf = ? AND id != ?').bind(clinic.id, fields.cpf, p.id).first<{ name: string }>();
        if (dup) return fail(c, 409, `Já existe um paciente com esse CPF: ${dup.name}.`);
      }
    }
    if (body.anamnesis !== undefined) { fields.anamnesis = JSON.stringify(cleanAnamnesis(body.anamnesis)); fields.anamnesis_at = nowIso(); }
    if (body.odontogram !== undefined) fields.odontogram = JSON.stringify(cleanOdontogram(body.odontogram));
    const keys = Object.keys(fields);
    if (!keys.length) return fail(c, 400, 'Nada para salvar.');
    await c.env.DB.prepare(`UPDATE patients SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...keys.map((k) => fields[k]), nowIso(), p.id).run();
    return c.json({ ok: true });
  });

  // Apaga a ficha, as evoluções e os orçamentos. Os lançamentos do financeiro ficam (sem o vínculo), para não mudar o caixa.
  app.delete('/api/clinics/:id/patients/:pid', async (c) => {
    const clinic = c.get('clinic');
    const p = await getPatient(c.env, clinic.id, Number(c.req.param('pid')));
    if (!p) return fail(c, 404, 'Paciente não encontrado.');
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM patient_notes WHERE patient_id = ?').bind(p.id),
      c.env.DB.prepare('DELETE FROM documents WHERE patient_id = ?').bind(p.id),
      c.env.DB.prepare('DELETE FROM attachments WHERE patient_id = ?').bind(p.id),
      c.env.DB.prepare('DELETE FROM budgets WHERE patient_id = ?').bind(p.id),
      c.env.DB.prepare('UPDATE finance SET patient_id = NULL, budget_id = NULL WHERE patient_id = ?').bind(p.id),
      c.env.DB.prepare('DELETE FROM patients WHERE id = ?').bind(p.id),
    ]);
    await logEvent(c.env, clinic.id, `Ficha de ${p.name} excluída.`, 'warn');
    return c.json({ ok: true });
  });

  // ---------- Evoluções ----------

  app.post('/api/clinics/:id/patients/:pid/notes', async (c) => {
    const clinic = c.get('clinic');
    const p = await getPatient(c.env, clinic.id, Number(c.req.param('pid')));
    if (!p) return fail(c, 404, 'Paciente não encontrado.');
    const { text } = await c.req.json<{ text?: string }>();
    const t = (text ?? '').trim().slice(0, 4000);
    if (!t) return fail(c, 400, 'Escreva a evolução antes de salvar.');
    await c.env.DB.prepare('INSERT INTO patient_notes (clinic_id, patient_id, text) VALUES (?, ?, ?)').bind(clinic.id, p.id, t).run();
    return c.json({ ok: true });
  });

  app.delete('/api/clinics/:id/patients/:pid/notes/:nid', async (c) => {
    const clinic = c.get('clinic');
    await c.env.DB.prepare('DELETE FROM patient_notes WHERE clinic_id = ? AND patient_id = ? AND id = ?')
      .bind(clinic.id, Number(c.req.param('pid')), Number(c.req.param('nid'))).run();
    return c.json({ ok: true });
  });

  // ---------- Orçamentos ----------

  app.post('/api/clinics/:id/patients/:pid/budgets', async (c) => {
    const clinic = c.get('clinic');
    const p = await getPatient(c.env, clinic.id, Number(c.req.param('pid')));
    if (!p) return fail(c, 404, 'Paciente não encontrado.');
    let b;
    try { b = cleanBudget(await c.req.json()); } catch (e) { return fail(c, 400, (e as Error).message); }
    const row = await c.env.DB.prepare(
      'INSERT INTO budgets (clinic_id, patient_id, title, items, discount, installments, method, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    ).bind(clinic.id, p.id, b.title, JSON.stringify(b.items), b.discount, b.installments, b.method, b.notes).first<{ id: number }>();
    await logEvent(c.env, clinic.id, `Orçamento criado para ${p.name}.`);
    return c.json({ id: row!.id });
  });

  async function getBudget(c: Context<AppEnv>): Promise<Budget | null> {
    return c.env.DB.prepare('SELECT * FROM budgets WHERE clinic_id = ? AND id = ?').bind(c.get('clinic').id, Number(c.req.param('bid'))).first<Budget>();
  }

  // Edita o orçamento. Depois de aprovado só dá para marcar procedimentos como feitos (o valor já virou parcelas).
  app.put('/api/clinics/:id/budgets/:bid', async (c) => {
    const b = await getBudget(c);
    if (!b) return fail(c, 404, 'Orçamento não encontrado.');
    const body = await c.req.json<Record<string, unknown>>();
    if (b.status === 'aprovado') {
      const items = parseBudget(b).items;
      const done = Array.isArray(body.done) ? body.done : [];
      items.forEach((it, i) => { it.done = done[i] === true; });
      await c.env.DB.prepare('UPDATE budgets SET items = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(items), nowIso(), b.id).run();
      return c.json({ ok: true });
    }
    let clean;
    try { clean = cleanBudget(body); } catch (e) { return fail(c, 400, (e as Error).message); }
    const status = body.status === 'recusado' ? 'recusado' : 'aberto';
    await c.env.DB.prepare('UPDATE budgets SET title = ?, items = ?, discount = ?, installments = ?, method = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?')
      .bind(clean.title, JSON.stringify(clean.items), clean.discount, clean.installments, clean.method, clean.notes, status, nowIso(), b.id).run();
    return c.json({ ok: true });
  });

  // Aprovar: gera as parcelas no financeiro (contas a receber).
  app.post('/api/clinics/:id/budgets/:bid/approve', async (c) => {
    const clinic = c.get('clinic');
    const b = await getBudget(c);
    if (!b) return fail(c, 404, 'Orçamento não encontrado.');
    if (b.status === 'aprovado') return fail(c, 409, 'Este orçamento já foi aprovado.');
    const { first_due } = await c.req.json<{ first_due?: string }>().catch(() => ({ first_due: undefined }));
    const installments = await approveBudget(c.env, clinic, b, first_due && isDate(first_due) ? first_due : today(c));
    return c.json({ ok: true, installments });
  });

  // Excluir: as parcelas ainda não pagas saem do financeiro; as pagas ficam.
  app.delete('/api/clinics/:id/budgets/:bid', async (c) => {
    const b = await getBudget(c);
    if (!b) return fail(c, 404, 'Orçamento não encontrado.');
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM finance WHERE budget_id = ? AND paid_at IS NULL').bind(b.id),
      c.env.DB.prepare('UPDATE finance SET budget_id = NULL WHERE budget_id = ?').bind(b.id),
      c.env.DB.prepare('DELETE FROM budgets WHERE id = ?').bind(b.id),
    ]);
    return c.json({ ok: true });
  });

  // ---------- Financeiro ----------

  app.get('/api/clinics/:id/finance', async (c) => {
    const clinic = c.get('clinic');
    const t = today(c);
    const month = /^\d{4}-\d{2}$/.test(c.req.query('month') ?? '') ? c.req.query('month')! : t.slice(0, 7);
    const from = `${month}-01`;
    const to = addMonths(from, 1);
    const db = c.env.DB;
    const [entries, overdue, openBudgets] = await Promise.all([
      db.prepare(`SELECT f.*, p.name AS patient_name FROM finance f LEFT JOIN patients p ON p.id = f.patient_id
        WHERE f.clinic_id = ? AND ((f.due_date >= ? AND f.due_date < ?) OR (f.paid_at >= ? AND f.paid_at < ?)) ORDER BY f.due_date, f.id`)
        .bind(clinic.id, from, to, from, to).all(),
      db.prepare(`SELECT f.*, p.name AS patient_name FROM finance f LEFT JOIN patients p ON p.id = f.patient_id
        WHERE f.clinic_id = ? AND f.paid_at IS NULL AND f.due_date < ? ORDER BY f.due_date LIMIT 100`).bind(clinic.id, t).all(),
      db.prepare("SELECT items, discount FROM budgets WHERE clinic_id = ? AND status = 'aberto'").bind(clinic.id).all<Budget>(),
    ]);
    // Orçamentos ainda em aberto: dinheiro que pode entrar se o paciente aprovar.
    const openTotal = openBudgets.results.reduce((s, b) => s + parseBudget(b).total, 0);
    return c.json({ month, today: t, entries: entries.results, overdue: overdue.results, open_budgets: { n: openBudgets.results.length, total: openTotal } });
  });

  app.post('/api/clinics/:id/finance', async (c) => {
    const clinic = c.get('clinic');
    let f;
    try { f = cleanFinance(await c.req.json()); } catch (e) { return fail(c, 400, (e as Error).message); }
    if (f.patient_id && !(await getPatient(c.env, clinic.id, f.patient_id))) f.patient_id = null;
    await c.env.DB.prepare('INSERT INTO finance (clinic_id, kind, description, category, amount, due_date, paid_at, method, patient_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(clinic.id, f.kind, f.description, f.category, f.amount, f.due_date, f.paid_at, f.method, f.patient_id).run();
    return c.json({ ok: true });
  });

  app.put('/api/clinics/:id/finance/:fid', async (c) => {
    const clinic = c.get('clinic');
    const old = await c.env.DB.prepare('SELECT * FROM finance WHERE clinic_id = ? AND id = ?').bind(clinic.id, Number(c.req.param('fid'))).first<FinanceEntry>();
    if (!old) return fail(c, 404, 'Lançamento não encontrado.');
    let f;
    try { f = cleanFinance({ ...old, ...(await c.req.json<Record<string, unknown>>()) }); } catch (e) { return fail(c, 400, (e as Error).message); }
    if (f.patient_id && !(await getPatient(c.env, clinic.id, f.patient_id))) f.patient_id = null;
    await c.env.DB.prepare('UPDATE finance SET kind = ?, description = ?, category = ?, amount = ?, due_date = ?, paid_at = ?, method = ?, patient_id = ? WHERE id = ?')
      .bind(f.kind, f.description, f.category, f.amount, f.due_date, f.paid_at, f.method, f.patient_id, old.id).run();
    return c.json({ ok: true });
  });

  app.delete('/api/clinics/:id/finance/:fid', async (c) => {
    await c.env.DB.prepare('DELETE FROM finance WHERE clinic_id = ? AND id = ?').bind(c.get('clinic').id, Number(c.req.param('fid'))).run();
    return c.json({ ok: true });
  });
}
