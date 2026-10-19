// Leitura de telefones, eventos da agenda e respostas em texto livre.

/** Normaliza um telefone brasileiro para o formato internacional só com dígitos (ex.: 5511987654321). */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

/**
 * Chave usada para comparar telefones. O WhatsApp às vezes envia números brasileiros sem o nono dígito
 * (5511 8765-4321 em vez de 5511 98765-4321), então comparamos DDD + últimos 8 dígitos.
 */
export function phoneKey(phone: string): string {
  const d = phone.replace(/\D/g, '');
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  return local.slice(0, 2) + local.slice(-8);
}

/** "(11) 98765-4321" */
export function fmtPhone(phone: string): string {
  const d = phone.replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

const PHONE_RE = /(?:\+?55[\s.-]*)?\(?\b(\d{2})\)?[\s.-]*(9?\d{4})[\s.-]*(\d{4})\b/;
const VALUE_RE = /(?:valor|pre[çc]o)\s*:?\s*(?:R\$\s*)?(\d{1,6}(?:[.,]\d{2})?)|R\$\s*(\d{1,6}(?:[.,]\d{2})?)/i;

export type ParsedEvent = { patient: string; procedure: string; phone: string | null; value: number | null };

/**
 * Lê um evento do Google Agenda no formato combinado com a clínica:
 * título "Nome do paciente - Procedimento" e telefone (e valor, opcional) na descrição.
 */
export function parseEvent(title: string, description: string): ParsedEvent {
  const cleanDesc = stripHtml(description || '');
  const phoneMatch = PHONE_RE.exec(cleanDesc) || PHONE_RE.exec(title);
  const phone = phoneMatch ? normalizePhone(phoneMatch[1] + phoneMatch[2] + phoneMatch[3]) : null;

  let t = title.trim();
  if (phoneMatch && PHONE_RE.test(t)) t = t.replace(PHONE_RE, '').trim();
  const parts = t.split(/\s+[-–|]\s+|\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  const patient = parts[0] || 'Sem nome';
  const procedure = parts.slice(1).join(' - ');

  const valueMatch = VALUE_RE.exec(cleanDesc);
  const rawValue = valueMatch ? valueMatch[1] || valueMatch[2] : null;
  const value = rawValue ? Math.round(Number(rawValue.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))) : null;

  return { patient, procedure, phone, value: Number.isFinite(value) ? value : null };
}

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
}

export type Intent = 'yes' | 'no' | 'unknown';

const YES = /^(1|sim|s|ok|okay|confirm\w*|vou|irei|estarei|estarei sim|vou sim|pode ser|com certeza|claro|beleza|blz|certo|quero|aceito|positivo)\b/;
const NO = /^(2|n[ãa]o|nao|n|remarc\w*|desmarc\w*|cancel\w*|n[ãa]o vou|n[ãa]o posso|n[ãa]o consigo|outro (dia|hor[áa]rio))\b/;

/** Interpreta respostas em texto como "vou sim", "1", "não vou conseguir". */
export function classifyText(text: string): Intent {
  const t = text.toLowerCase().normalize('NFC').replace(/[!.,👍🙏😊]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return 'unknown';
  if (NO.test(t) || /\b(remarcar|desmarcar|cancelar|n[ãa]o vou|n[ãa]o consigo|n[ãa]o posso|imprevisto)\b/.test(t)) return 'no';
  if (YES.test(t) || /\b(confirmo|confirmado|estarei a[íi]|vou sim)\b/.test(t) || t === '👍') return 'yes';
  return 'unknown';
}

/** Substitui {nome}, {hora} etc. no texto. Chaves desconhecidas ficam como estão. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
