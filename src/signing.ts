// Termos para o paciente assinar pelo celular: o portal cria um link secreto (/p/<token>), envia pelo WhatsApp,
// e o paciente lê, preenche (na ficha de entrada) e assina com o dedo. Também guarda os anexos da ficha (fotos, exames).
import type { Context, Hono } from 'hono';
import { type Clinic, type Env, getClinic, logEvent, nowIso } from './db';
import { isSimulated, send, windowOpen } from './messaging';
import { fillTemplate, firstName, normalizePhone, phoneKey } from './parse';
import {
  type AppEnv, type Budget, type Patient, approveBudget, cleanAnamnesis, cleanPatient, getPatient, isValidCpf, parseBudget,
} from './records';
import { DAY_MS, localDateKey } from './time';

export type DocKind = 'termo' | 'entrada' | 'orcamento';
export type Doc = {
  id: number; clinic_id: number; patient_id: number; budget_id: number | null; kind: DocKind; title: string; body: string; token: string;
  status: 'pendente' | 'assinado' | 'cancelado'; sent_at: string | null; opened_at: string | null; expires_at: string;
  signer_name: string | null; signer_cpf: string | null; signature: string | null; signed_at: string | null;
  signed_ip: string | null; signed_ua: string | null; body_hash: string | null; created_at: string;
};

export const LINK_DAYS = 7;

// ---------- Textos dos termos ----------

/** Perguntas da anamnese (as mesmas da ficha no portal, em public/gestao.js). */
export const ANAMNESE_QUESTIONS: Array<[string, string]> = [
  ['tratamento', 'Está em tratamento médico?'],
  ['medicamentos', 'Toma algum medicamento?'],
  ['alergia', 'Tem alergia a algum medicamento ou material (látex, anestésico)?'],
  ['anestesia', 'Já teve reação ruim à anestesia?'],
  ['pressao', 'Tem pressão alta?'],
  ['diabetes', 'Tem diabetes?'],
  ['coracao', 'Tem algum problema no coração?'],
  ['sangramento', 'Sangra muito quando se corta ou usa anticoagulante?'],
  ['gestante', 'Está grávida ou amamentando?'],
  ['infeccao', 'Tem ou já teve hepatite, HIV ou outra doença infecciosa?'],
  ['cirurgia', 'Já fez alguma cirurgia ou ficou internado?'],
  ['fumante', 'Fuma?'],
  ['sensibilidade', 'Sente sensibilidade nos dentes (frio, doce)?'],
  ['sangra_gengiva', 'A gengiva sangra ao escovar?'],
  ['bruxismo', 'Range ou aperta os dentes?'],
];

const COMMON_END = 'Declaro que li este termo, que tive a oportunidade de tirar todas as minhas dúvidas e que as respostas foram claras. '
  + 'Sei que posso desistir do tratamento a qualquer momento, avisando a clínica.';

const PRIVACY = 'Autorizo a {clinica} a guardar e usar meus dados pessoais e de saúde (cadastro, anamnese, exames, fotos clínicas e prontuário) '
  + 'somente para o meu atendimento, agendamento, cobrança e cumprimento de obrigações legais, de acordo com a Lei Geral de Proteção de Dados (LGPD). '
  + 'Meus dados não serão vendidos nem compartilhados para outros fins. Posso pedir a qualquer momento uma cópia, a correção ou a exclusão dos dados que não precisem ser guardados por lei.';

export const TERM_MODELS: Array<{ key: string; title: string; body: string }> = [
  {
    key: 'geral', title: 'Termo de consentimento para tratamento odontológico',
    body: 'Eu, {paciente}, autorizo {dentista} e a equipe da {clinica} a realizar os exames, procedimentos e tratamentos odontológicos que me foram explicados, inclusive anestesia local e radiografias quando necessárias.\n\n'
      + 'Fui informado(a) sobre o diagnóstico, as opções de tratamento, os riscos, o custo e o tempo previsto. Entendo que a odontologia não é uma ciência exata e que o resultado depende também dos meus cuidados: seguir as orientações, tomar os remédios receitados, manter a higiene e comparecer às consultas e retornos.\n\n'
      + 'Comprometo-me a informar qualquer mudança na minha saúde ou nos remédios que uso.\n\n' + COMMON_END,
  },
  {
    key: 'canal', title: 'Termo de consentimento: tratamento de canal',
    body: 'Eu, {paciente}, autorizo o tratamento de canal (endodontia) proposto pela {clinica}.\n\n'
      + 'Fui informado(a) de que o tratamento pode levar mais de uma sessão, que posso sentir sensibilidade ou desconforto por alguns dias e que, em alguns casos, pode ser preciso refazer o canal, fazer uma pequena cirurgia ou até extrair o dente se a infecção não regredir.\n\n'
      + 'Sei que, depois do canal, o dente precisa de restauração definitiva ou coroa para não fraturar, e que adiar essa etapa aumenta o risco de perder o dente.\n\n' + COMMON_END,
  },
  {
    key: 'extracao', title: 'Termo de consentimento: extração e cirurgia oral',
    body: 'Eu, {paciente}, autorizo a extração dentária ou cirurgia oral proposta pela {clinica}.\n\n'
      + 'Fui informado(a) dos cuidados antes e depois da cirurgia e dos riscos possíveis, como dor, inchaço, sangramento, manchas roxas, limitação para abrir a boca, infecção, alveolite e, mais raramente, alteração temporária ou permanente de sensibilidade no lábio, queixo ou língua, ou comunicação com o seio maxilar.\n\n'
      + 'Comprometo-me a seguir as orientações pós-operatórias (repouso, alimentação, remédios, não fumar) e a voltar para a revisão e retirada dos pontos.\n\n' + COMMON_END,
  },
  {
    key: 'implante', title: 'Termo de consentimento: implante dentário',
    body: 'Eu, {paciente}, autorizo o tratamento com implante dentário proposto pela {clinica}, que inclui a cirurgia de instalação do implante e, depois do período de cicatrização, a prótese sobre ele.\n\n'
      + 'Fui informado(a) de que o implante precisa de alguns meses para se integrar ao osso, que pode ser necessário enxerto e que existe a possibilidade de o implante não se integrar e precisar ser substituído. Fumo, diabetes descontrolada e falta de higiene aumentam esse risco.\n\n'
      + 'Comprometo-me a fazer as consultas de manutenção e a manter a higiene indicada.\n\n' + COMMON_END,
  },
  {
    key: 'clareamento', title: 'Termo de consentimento: clareamento dental',
    body: 'Eu, {paciente}, autorizo o clareamento dental proposto pela {clinica}.\n\n'
      + 'Fui informado(a) de que o resultado varia de pessoa para pessoa, que restaurações, coroas e facetas não clareiam e podem precisar ser trocadas para combinar com a nova cor, e que é comum sentir sensibilidade durante o tratamento.\n\n'
      + 'Comprometo-me a usar o produto conforme a orientação e a evitar alimentos e bebidas com corante durante o tratamento.\n\n' + COMMON_END,
  },
  {
    key: 'ortodontia', title: 'Termo de consentimento: tratamento ortodôntico (aparelho)',
    body: 'Eu, {paciente}, autorizo o tratamento ortodôntico proposto pela {clinica}.\n\n'
      + 'Fui informado(a) de que o tempo de tratamento é uma estimativa e depende da colaboração (uso de elásticos, comparecimento às manutenções, cuidado com o aparelho), que a higiene precisa ser redobrada para evitar cáries e manchas e que, ao final, é necessário usar contenção para os dentes não voltarem à posição anterior.\n\n'
      + 'Sei que faltas às manutenções e quebras frequentes do aparelho atrasam o tratamento.\n\n' + COMMON_END,
  },
  {
    key: 'imagem', title: 'Autorização de uso de imagem',
    body: 'Eu, {paciente}, autorizo a {clinica} a usar fotos e vídeos do meu tratamento (antes e depois) para fins didáticos, científicos e de divulgação em redes sociais e materiais da clínica, sem identificação do meu nome.\n\n'
      + 'Esta autorização é gratuita e posso cancelá-la a qualquer momento, avisando a clínica; o cancelamento vale para novas publicações.',
  },
  { key: 'lgpd', title: 'Termo de privacidade e uso de dados (LGPD)', body: `Eu, {paciente}, declaro que fui informado(a) sobre como a {clinica} cuida dos meus dados.\n\n${PRIVACY}` },
];

export const ENTRY_TITLE = 'Ficha de entrada';
export const ENTRY_BODY = 'Declaro que as informações que preenchi nesta ficha (dados pessoais e respostas de saúde) são verdadeiras e que vou avisar a clínica se alguma coisa mudar.\n\n'
  + PRIVACY + '\n\nAutorizo a {clinica} a entrar em contato comigo pelo WhatsApp e por telefone para confirmar consultas, enviar lembretes e documentos.';

function fmtCpf(d: string): string {
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d;
}

export function termVars(clinic: Clinic, p: Pick<Patient, 'name' | 'cpf'>): Record<string, string> {
  const s = clinic.settings;
  return {
    paciente: p.name + (p.cpf ? `, CPF ${fmtCpf(p.cpf)}` : ''),
    clinica: clinic.name,
    dentista: s.dentist_name ? `${s.dentist_name}${s.dentist_cro ? ` (${s.dentist_cro})` : ''}` : 'o(a) cirurgião(ã)-dentista responsável',
    data: localDateKey(new Date(), clinic.timezone).split('-').reverse().join('/'),
  };
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Texto do orçamento para o paciente assinar (aprovar). */
export function budgetText(clinic: Clinic, p: Patient, b: Budget): string {
  const parsed = parseBudget(b);
  const lines = parsed.items.map((i) => `• ${i.proc}${i.tooth ? ` (dente ${i.tooth})` : ''}: ${brl(i.value)}`);
  const pay = `${b.method || 'Forma de pagamento a combinar'}${b.installments > 1 ? `, em ${b.installments}x de ${brl(Math.floor(parsed.total / b.installments))}` : ', à vista'}`;
  return [
    `Eu, ${termVars(clinic, p).paciente}, aprovo o plano de tratamento e o orçamento abaixo, apresentados pela ${clinic.name}.`,
    lines.join('\n'),
    `${b.discount ? `Desconto: ${brl(b.discount)}\n` : ''}Total: ${brl(parsed.total)}\nPagamento: ${pay}.`,
    b.notes ? `Observações: ${b.notes}` : '',
    'Estou ciente de que o plano pode mudar se surgirem situações que não eram visíveis no início do tratamento; nesse caso, um novo orçamento será apresentado antes de qualquer cobrança extra.',
  ].filter(Boolean).join('\n\n');
}

// ---------- Criar e enviar ----------

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createDocument(
  env: Env, clinic: Clinic, p: Patient, d: { kind: DocKind; title: string; body: string; budget_id?: number | null }, now = new Date(),
): Promise<Doc> {
  const doc = await env.DB.prepare(
    'INSERT INTO documents (clinic_id, patient_id, budget_id, kind, title, body, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
  ).bind(clinic.id, p.id, d.budget_id ?? null, d.kind, d.title.slice(0, 160), d.body.slice(0, 20000), newToken(),
    new Date(now.getTime() + LINK_DAYS * DAY_MS).toISOString(), now.toISOString()).first<Doc>();
  return doc!;
}

export function docLink(origin: string, token: string): string {
  return `${origin}/p/${token}`;
}

/**
 * Envia o link pelo WhatsApp. Com a conversa aberta (paciente escreveu nas últimas 24h) vai como mensagem livre;
 * fora dela, usa o modelo aprovado "assinatura_documento" (variáveis: nome, clínica, link).
 */
export async function sendDocument(env: Env, clinic: Clinic, p: Patient, doc: Doc, origin: string): Promise<{ ok: boolean; error?: string }> {
  const phone = p.phone ? normalizePhone(p.phone) : null;
  if (!phone) return { ok: false, error: 'O paciente não tem WhatsApp no cadastro. Copie o link e envie de outro jeito.' };
  const link = docLink(origin, doc.token);
  const v = { nome: firstName(p.name), clinica: clinic.name, link };
  const t = clinic.settings.templates.sign;
  const preview = fillTemplate(t.preview, v);
  const open = isSimulated(env, clinic) || (await windowOpen(env, clinic, phone));
  const intro = doc.kind === 'entrada'
    ? `Olá, ${v.nome}! Para agilizar seu atendimento na ${clinic.name}, preencha sua ficha e assine pelo celular (leva uns 3 minutos): ${link}`
    : doc.kind === 'orcamento'
      ? `Olá, ${v.nome}! Segue o orçamento do seu tratamento na ${clinic.name}. Para aprovar, é só ler e assinar pelo celular: ${link}`
      : `Olá, ${v.nome}! A ${clinic.name} enviou o documento "${doc.title}" para você ler e assinar pelo celular: ${link}`;
  const res = await send(env, clinic, phone, open
    ? { kind: 'text', text: intro }
    : { kind: 'template', name: t.name, preview, params: [v.nome, v.clinica, v.link] });
  if (res.ok) await env.DB.prepare('UPDATE documents SET sent_at = ? WHERE id = ?').bind(nowIso(), doc.id).run();
  return res;
}

/** Ficha de entrada: cria (ou acha pelo telefone) o paciente e prepara o link para ele preencher e assinar. */
export async function createIntake(env: Env, clinic: Clinic, name: string, phone: string): Promise<{ patient: Patient; doc: Doc; created: boolean }> {
  const n = name.trim().replace(/\s+/g, ' ');
  const ph = normalizePhone(phone);
  if (!n) throw new Error('Informe o nome do paciente.');
  if (!ph) throw new Error('WhatsApp inválido. Use DDD + número, ex.: (11) 98765-4321.');
  const first = n.split(' ')[0].toLowerCase();
  let p = await env.DB.prepare(
    "SELECT * FROM patients WHERE clinic_id = ? AND phone_key = ? AND lower(substr(name, 1, instr(name || ' ', ' ') - 1)) = ? LIMIT 1",
  ).bind(clinic.id, phoneKey(ph), first).first<Patient>();
  const created = !p;
  if (!p) {
    p = await env.DB.prepare('INSERT INTO patients (clinic_id, name, phone, phone_key) VALUES (?, ?, ?, ?) RETURNING *')
      .bind(clinic.id, n, ph, phoneKey(ph)).first<Patient>();
  }
  const doc = await createDocument(env, clinic, p!, { kind: 'entrada', title: ENTRY_TITLE, body: fillTemplate(ENTRY_BODY, termVars(clinic, p!)) });
  return { patient: p!, doc, created };
}

// ---------- Assinatura ----------

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PATIENT_FORM_FIELDS = ['name', 'birth_date', 'sex', 'cpf', 'profession', 'phone', 'phone2', 'email', 'cep', 'address', 'neighborhood',
  'city', 'state', 'insurance', 'insurance_number', 'guardian_name', 'guardian_phone', 'referral'];

export type SignInput = { name?: string; cpf?: string; signature?: string; agree?: boolean; form?: Record<string, unknown> };

/** Valida e grava a assinatura. Na ficha de entrada também atualiza o cadastro e a anamnese. Lança erro com mensagem para o paciente. */
export async function signDocument(env: Env, doc: Doc, input: SignInput, meta: { ip: string; ua: string }, now = new Date()): Promise<void> {
  if (doc.status === 'assinado') throw new Error('Este documento já foi assinado.');
  if (doc.status === 'cancelado') throw new Error('Este documento foi cancelado pela clínica.');
  if (new Date(doc.expires_at) < now) throw new Error('Este link venceu. Peça um novo para a clínica.');
  const clinic = await getClinic(env, doc.clinic_id);
  const p = await getPatient(env, doc.clinic_id, doc.patient_id);
  if (!clinic || !p) throw new Error('Documento não encontrado.');
  const name = (input.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (name.split(' ').length < 2) throw new Error('Escreva seu nome completo.');
  const cpf = (input.cpf ?? '').replace(/\D/g, '');
  if (!isValidCpf(cpf)) throw new Error('CPF inválido. Confira os números.');
  const sig = input.signature ?? '';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 1500) throw new Error('Faça sua assinatura no quadro.');
  if (sig.length > 400_000) throw new Error('Assinatura muito grande. Toque em “Limpar” e assine de novo.');
  if (!input.agree) throw new Error('Marque “Li e concordo” para assinar.');

  const stmts: D1PreparedStatement[] = [];
  let signedText = `${doc.title}\n\n${doc.body}`;
  if (doc.kind === 'entrada') {
    const form = input.form ?? {};
    const merged: Record<string, unknown> = {};
    for (const k of PATIENT_FORM_FIELDS) merged[k] = typeof form[k] === 'string' && (form[k] as string).trim() ? form[k] : (p as Record<string, unknown>)[k];
    merged.notes = p.notes;
    if (!merged.cpf) merged.cpf = cpf;
    const fields = cleanPatient(merged, localDateKey(now, clinic.timezone));
    const anamnesis = cleanAnamnesis(form.anamnesis);
    const keys = Object.keys(fields);
    stmts.push(env.DB.prepare(`UPDATE patients SET ${keys.map((k) => `${k} = ?`).join(', ')}, anamnesis = ?, anamnesis_at = ?, updated_at = ? WHERE id = ?`)
      .bind(...keys.map((k) => (fields as Record<string, unknown>)[k]), JSON.stringify(anamnesis), now.toISOString(), now.toISOString(), p.id));
    signedText += `\n\n${JSON.stringify({ cadastro: fields, anamnese: anamnesis })}`;
  }
  const hash = await sha256(signedText);
  stmts.push(env.DB.prepare(
    `UPDATE documents SET status = 'assinado', signer_name = ?, signer_cpf = ?, signature = ?, signed_at = ?, signed_ip = ?, signed_ua = ?, body_hash = ?
     WHERE id = ? AND status = 'pendente'`,
  ).bind(name, cpf, sig, now.toISOString(), meta.ip.slice(0, 60), meta.ua.slice(0, 300), hash, doc.id));
  await env.DB.batch(stmts);
  await logEvent(env, clinic.id, doc.kind === 'entrada'
    ? `${p.name} preencheu a ficha de entrada e assinou pelo celular.`
    : `${p.name} assinou “${doc.title}” pelo celular.`, 'ok');

  // Orçamento assinado = aprovado: as parcelas entram no financeiro, com a 1ª vencendo hoje.
  if (doc.kind === 'orcamento' && doc.budget_id) {
    const b = await env.DB.prepare("SELECT * FROM budgets WHERE id = ? AND clinic_id = ? AND status = 'aberto'").bind(doc.budget_id, clinic.id).first<Budget>();
    if (b) await approveBudget(env, clinic, b, localDateKey(now, clinic.timezone), ' pelo paciente (assinatura no celular)');
  }
}

// ---------- Anexos ----------

const ATTACH_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_ATTACHMENT = 1_500_000;
export const ATTACH_CATEGORIES = ['Foto clínica', 'Raio-X', 'Exame', 'Antes e depois', 'Documento', 'Outro'];

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function cleanAttachment(body: Record<string, unknown>): { name: string; mime: string; data: Uint8Array; thumb: Uint8Array | null; category: string; caption: string } {
  const mime = String(body.mime ?? '');
  if (!ATTACH_TYPES.includes(mime)) throw new Error('Tipo de arquivo não aceito. Envie foto (JPG, PNG) ou PDF.');
  let data: Uint8Array;
  let thumb: Uint8Array | null = null;
  try {
    data = fromBase64(String(body.data ?? ''));
    if (body.thumb) thumb = fromBase64(String(body.thumb));
  } catch { throw new Error('Arquivo corrompido. Tente de novo.'); }
  if (!data.length) throw new Error('Arquivo vazio.');
  if (data.length > MAX_ATTACHMENT) throw new Error('Arquivo muito grande (máximo 1,5 MB). Para PDF, reduza o tamanho antes de enviar.');
  if (thumb && thumb.length > 150_000) thumb = null;
  const str = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '');
  const category = ATTACH_CATEGORIES.includes(str('category', 40)) ? str('category', 40) : 'Outro';
  return { name: str('name', 120) || 'arquivo', mime, data, thumb, category, caption: str('caption', 300) };
}

/** O D1 devolve BLOB como ArrayBuffer (ou lista de números em versões antigas). */
function blobBytes(v: unknown): Uint8Array {
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return new Uint8Array(v as number[]);
}

// ---------- Rotas ----------

const fail = (c: Context, status: 400 | 404 | 409 | 410, error: string) => c.json({ error }, status);
const originOf = (c: Context) => new URL(c.req.url).origin;

async function docOf(c: Context<AppEnv>): Promise<Doc | null> {
  return c.env.DB.prepare('SELECT * FROM documents WHERE clinic_id = ? AND id = ?').bind(c.get('clinic').id, Number(c.req.param('did'))).first<Doc>();
}

export function registerSigning(app: Hono<AppEnv>): void {
  // Modelos de termo já com o nome do paciente e da clínica, para a recepção revisar antes de enviar.
  app.get('/api/clinics/:id/patients/:pid/term-models', async (c) => {
    const clinic = c.get('clinic');
    const p = await getPatient(c.env, clinic.id, Number(c.req.param('pid')));
    if (!p) return fail(c, 404, 'Paciente não encontrado.');
    const v = termVars(clinic, p);
    return c.json([
      { key: 'entrada', title: ENTRY_TITLE, body: fillTemplate(ENTRY_BODY, v), kind: 'entrada' },
      ...TERM_MODELS.map((m) => ({ key: m.key, title: m.title, body: fillTemplate(m.body, v), kind: 'termo' })),
    ]);
  });

  app.post('/api/clinics/:id/patients/:pid/documents', async (c) => {
    const clinic = c.get('clinic');
    const p = await getPatient(c.env, clinic.id, Number(c.req.param('pid')));
    if (!p) return fail(c, 404, 'Paciente não encontrado.');
    const b = await c.req.json<{ kind?: string; title?: string; body?: string; budget_id?: number; send?: boolean }>();
    let doc: Doc;
    if (b.kind === 'orcamento') {
      const budget = await c.env.DB.prepare('SELECT * FROM budgets WHERE clinic_id = ? AND id = ? AND patient_id = ?').bind(clinic.id, Number(b.budget_id), p.id).first<Budget>();
      if (!budget) return fail(c, 404, 'Orçamento não encontrado.');
      if (budget.status !== 'aberto') return fail(c, 409, 'Só dá para enviar para assinatura um orçamento em aberto.');
      // Um link por orçamento: os anteriores ainda pendentes são cancelados.
      await c.env.DB.prepare("UPDATE documents SET status = 'cancelado' WHERE budget_id = ? AND status = 'pendente'").bind(budget.id).run();
      doc = await createDocument(c.env, clinic, p, { kind: 'orcamento', title: `Orçamento: ${budget.title || 'plano de tratamento'}`, body: budgetText(clinic, p, budget), budget_id: budget.id });
    } else {
      const title = (b.title ?? '').trim();
      const body = (b.body ?? '').trim();
      if (!title || !body) return fail(c, 400, 'Informe o título e o texto do termo.');
      doc = await createDocument(c.env, clinic, p, { kind: b.kind === 'entrada' ? 'entrada' : 'termo', title, body });
    }
    let sent: { ok: boolean; error?: string } | null = null;
    if (b.send) sent = await sendDocument(c.env, clinic, p, doc, originOf(c));
    await logEvent(c.env, clinic.id, `“${doc.title}” ${sent?.ok ? 'enviado pelo WhatsApp' : 'criado'} para ${p.name} assinar.`);
    return c.json({ id: doc.id, link: docLink(originOf(c), doc.token), sent: sent?.ok ?? false, error: sent?.error });
  });

  app.post('/api/clinics/:id/documents/:did/send', async (c) => {
    const clinic = c.get('clinic');
    const doc = await docOf(c);
    if (!doc) return fail(c, 404, 'Documento não encontrado.');
    if (doc.status !== 'pendente') return fail(c, 409, 'Este documento não está mais aguardando assinatura.');
    // Reenviar renova o prazo do link.
    await c.env.DB.prepare('UPDATE documents SET expires_at = ? WHERE id = ?').bind(new Date(Date.now() + LINK_DAYS * DAY_MS).toISOString(), doc.id).run();
    const p = await getPatient(c.env, clinic.id, doc.patient_id);
    const r = await sendDocument(c.env, clinic, p!, doc, originOf(c));
    if (!r.ok) return fail(c, 400, r.error ?? 'Não foi possível enviar.');
    return c.json({ ok: true });
  });

  app.post('/api/clinics/:id/documents/:did/cancel', async (c) => {
    const doc = await docOf(c);
    if (!doc) return fail(c, 404, 'Documento não encontrado.');
    if (doc.status !== 'pendente') return fail(c, 409, 'Só dá para cancelar documentos ainda não assinados.');
    await c.env.DB.prepare("UPDATE documents SET status = 'cancelado' WHERE id = ?").bind(doc.id).run();
    return c.json({ ok: true });
  });

  // Ficha de entrada pelo WhatsApp: a recepção só digita nome e WhatsApp; o paciente preenche o resto.
  app.post('/api/clinics/:id/intake', async (c) => {
    const clinic = c.get('clinic');
    const b = await c.req.json<{ name?: string; phone?: string; send?: boolean }>();
    let r;
    try { r = await createIntake(c.env, clinic, b.name ?? '', b.phone ?? ''); } catch (e) { return fail(c, 400, (e as Error).message); }
    const sent = b.send === false ? null : await sendDocument(c.env, clinic, r.patient, r.doc, originOf(c));
    await logEvent(c.env, clinic.id, `Ficha de entrada ${sent?.ok ? 'enviada pelo WhatsApp' : 'criada'} para ${r.patient.name}.`);
    return c.json({ patient_id: r.patient.id, link: docLink(originOf(c), r.doc.token), sent: sent?.ok ?? false, error: sent?.error });
  });

  // ---------- Anexos ----------

  app.post('/api/clinics/:id/patients/:pid/attachments', async (c) => {
    const clinic = c.get('clinic');
    const p = await getPatient(c.env, clinic.id, Number(c.req.param('pid')));
    if (!p) return fail(c, 404, 'Paciente não encontrado.');
    let a;
    try { a = cleanAttachment(await c.req.json()); } catch (e) { return fail(c, 400, (e as Error).message); }
    const row = await c.env.DB.prepare(
      'INSERT INTO attachments (clinic_id, patient_id, name, mime, size, category, caption, data, thumb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    ).bind(clinic.id, p.id, a.name, a.mime, a.data.length, a.category, a.caption, a.data, a.thumb).first<{ id: number }>();
    return c.json({ id: row!.id });
  });

  app.get('/api/clinics/:id/attachments/:aid', async (c) => {
    const thumb = c.req.query('thumb') !== undefined;
    const row = await c.env.DB.prepare(`SELECT name, mime, ${thumb ? 'COALESCE(thumb, data)' : 'data'} AS bytes, thumb IS NOT NULL AS has_thumb FROM attachments WHERE clinic_id = ? AND id = ?`)
      .bind(c.get('clinic').id, Number(c.req.param('aid'))).first<{ name: string; mime: string; bytes: unknown; has_thumb: number }>();
    if (!row) return fail(c, 404, 'Arquivo não encontrado.');
    const mime = thumb && row.has_thumb ? 'image/jpeg' : row.mime;
    return new Response(blobBytes(row.bytes), {
      headers: {
        'content-type': mime,
        'cache-control': 'private, max-age=86400',
        'x-content-type-options': 'nosniff',
        // O leitor de PDF do navegador não abre em página isolada ("sandbox"); fotos ficam sempre isoladas.
        ...(mime === 'application/pdf' ? {} : { 'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" }),
        'content-disposition': `${c.req.query('download') !== undefined ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      },
    });
  });

  app.put('/api/clinics/:id/attachments/:aid', async (c) => {
    const b = await c.req.json<{ caption?: string; category?: string }>();
    const category = ATTACH_CATEGORIES.includes(b.category ?? '') ? b.category! : 'Outro';
    await c.env.DB.prepare('UPDATE attachments SET caption = ?, category = ? WHERE clinic_id = ? AND id = ?')
      .bind((b.caption ?? '').trim().slice(0, 300), category, c.get('clinic').id, Number(c.req.param('aid'))).run();
    return c.json({ ok: true });
  });

  app.delete('/api/clinics/:id/attachments/:aid', async (c) => {
    await c.env.DB.prepare('DELETE FROM attachments WHERE clinic_id = ? AND id = ?').bind(c.get('clinic').id, Number(c.req.param('aid'))).run();
    return c.json({ ok: true });
  });
}

// ---------- Página pública do paciente (/p/<token>), sem senha ----------

export function registerPublicSigning(app: Hono<AppEnv>): void {
  const byToken = (env: Env, token: string) => env.DB.prepare('SELECT * FROM documents WHERE token = ?').bind(token).first<Doc>();

  app.get('/p/:token', async (c) => {
    const res = await c.env.ASSETS.fetch(new Request(new URL('/assinar.html', c.req.url)));
    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'no-store');
    out.headers.set('referrer-policy', 'no-referrer');
    out.headers.set('x-robots-tag', 'noindex');
    return out;
  });

  app.get('/p/:token/dados', async (c) => {
    const doc = await byToken(c.env, c.req.param('token'));
    if (!doc) return fail(c, 404, 'Link inválido. Confira se copiou o endereço inteiro.');
    const clinic = await getClinic(c.env, doc.clinic_id);
    const p = await getPatient(c.env, doc.clinic_id, doc.patient_id);
    if (!clinic || !p) return fail(c, 404, 'Documento não encontrado.');
    if (!doc.opened_at && doc.status === 'pendente') await c.env.DB.prepare('UPDATE documents SET opened_at = ? WHERE id = ?').bind(nowIso(), doc.id).run();
    const expired = doc.status === 'pendente' && new Date(doc.expires_at) < new Date();
    const entry = doc.kind === 'entrada' && doc.status === 'pendente';
    return c.json({
      clinic: { name: clinic.name, address: clinic.address },
      kind: doc.kind, title: doc.title, body: doc.body, status: expired ? 'vencido' : doc.status, signed_at: doc.signed_at,
      patient: entry
        ? Object.fromEntries(PATIENT_FORM_FIELDS.map((k) => [k, (p as Record<string, unknown>)[k] ?? '']))
        : { name: p.name, cpf: p.cpf },
      anamnesis: entry ? JSON.parse(p.anamnesis || '{}') : null,
      questions: entry ? ANAMNESE_QUESTIONS : null,
    });
  });

  app.post('/p/:token/assinar', async (c) => {
    const doc = await byToken(c.env, c.req.param('token'));
    if (!doc) return fail(c, 404, 'Link inválido.');
    if (!c.req.header('content-type')?.includes('application/json')) return fail(c, 400, 'Pedido inválido.');
    try {
      await signDocument(c.env, doc, await c.req.json<SignInput>(), {
        ip: c.req.header('cf-connecting-ip') ?? '', ua: c.req.header('user-agent') ?? '',
      });
    } catch (e) {
      return fail(c, 400, (e as Error).message);
    }
    return c.json({ ok: true });
  });
}
