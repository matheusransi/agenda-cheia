// Configurações de cada clínica, editáveis pelo portal. Valores ausentes usam estes padrões.

export type Settings = {
  test_mode: boolean;
  wa_business_account_id: string;
  confirm_days_before: number;
  confirm_time: string;
  second_reminder: boolean;
  second_time: string;
  escalate_time: string;
  final_reminder: boolean;
  final_hours: number;
  send_from: string;
  send_until: string;
  offer_on_cancel: boolean;
  offer_minutes: number;
  slot_step: number;
  work_hours: Record<string, string>;
  /** Mostra no portal as telas de gestão (pacientes, orçamentos, financeiro). Em teste: ligado só na demonstração. */
  modules_beta: boolean;
  /** Dentista responsável, impresso nos documentos (atestado, receita, orçamento). */
  dentist_name: string;
  dentist_cro: string;
  /** Tabela de procedimentos, um por linha: "Limpeza = 180". Sugere nome e valor no orçamento e na nova consulta. */
  procedures: string;
  templates: {
    confirm: { name: string; preview: string };
    offer: { name: string; preview: string };
    reminder: { name: string; preview: string };
    sign: { name: string; preview: string };
  };
  texts: {
    confirmed: string;
    reschedule: string;
    reschedule_none: string;
    rescheduled: string;
    human: string;
    offer_accepted: string;
    offer_declined: string;
    offer_taken: string;
    fallback: string;
    reminder_text: string;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  test_mode: true,
  wa_business_account_id: '',
  confirm_days_before: 1,
  confirm_time: '10:00',
  second_reminder: true,
  second_time: '16:00',
  escalate_time: '18:00',
  final_reminder: true,
  final_hours: 2,
  send_from: '07:00',
  send_until: '21:00',
  offer_on_cancel: true,
  offer_minutes: 30,
  slot_step: 30,
  // 0 = domingo ... 6 = sábado. Vazio = fechado.
  work_hours: {
    '0': '',
    '1': '08:00-12:00, 13:00-18:00',
    '2': '08:00-12:00, 13:00-18:00',
    '3': '08:00-12:00, 13:00-18:00',
    '4': '08:00-12:00, 13:00-18:00',
    '5': '08:00-12:00, 13:00-18:00',
    '6': '',
  },
  modules_beta: false,
  dentist_name: '',
  dentist_cro: '',
  procedures: [
    'Avaliação = 120', 'Limpeza (profilaxia) = 180', 'Restauração em resina = 250', 'Tratamento de canal = 900',
    'Extração simples = 350', 'Clareamento = 600', 'Coroa de porcelana = 1500', 'Implante = 2800',
    'Manutenção do aparelho = 150', 'Raspagem (por arcada) = 300',
  ].join('\n'),
  templates: {
    confirm: {
      name: 'confirmacao_consulta',
      preview: 'Olá, {nome}! Aqui é da {clinica}. Sua consulta de {procedimento} está marcada para {data} às {hora}. Você confirma?',
    },
    offer: {
      name: 'oferta_vaga',
      preview: 'Oi, {nome}! Abriu um horário na {clinica} em {data} às {hora}. Você está na nossa lista de espera. Quer ficar com ele?',
    },
    reminder: {
      name: 'lembrete_consulta',
      preview: 'Oi, {nome}! Lembrete: sua consulta na {clinica} é hoje às {hora}. Endereço: {endereco}. Até logo!',
    },
    sign: {
      name: 'assinatura_documento',
      preview: 'Olá, {nome}! A {clinica} enviou um documento para você ler e assinar pelo celular: {link}',
    },
  },
  texts: {
    confirmed: 'Obrigado, {nome}! Consulta confirmada para {data} às {hora}. Endereço: {endereco}.',
    reschedule: 'Sem problema! Estes são os próximos horários livres. Qual fica melhor?',
    reschedule_none: 'Sem problema! A recepção vai falar com você para combinar um novo horário.',
    rescheduled: 'Pronto, {nome}! Sua consulta foi remarcada para {novo_horario}. Até lá!',
    human: 'Certo! A recepção vai falar com você em breve.',
    offer_accepted: 'Ótimo, {nome}! Está marcado: {data} às {hora}. Endereço: {endereco}.',
    offer_declined: 'Tudo bem! Você continua na lista e avisamos do próximo horário.',
    offer_taken: 'Esse horário acabou de ser preenchido, mas você continua na nossa lista de espera.',
    fallback: 'Recebemos sua mensagem! A recepção vai responder em breve.',
    reminder_text: 'Oi, {nome}! Lembrete: sua consulta é hoje às {hora}. Endereço: {endereco}.',
  },
};

type Plain = Record<string, unknown>;

function isPlain(v: unknown): v is Plain {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Junta as configurações salvas com os padrões, ignorando campos desconhecidos ou de tipo errado. */
export function mergeSettings(base: Plain, patch: unknown): Plain {
  const out: Plain = {};
  for (const [k, def] of Object.entries(base)) {
    const v = isPlain(patch) ? patch[k] : undefined;
    if (isPlain(def)) out[k] = mergeSettings(def, v);
    else if (v !== undefined && typeof v === typeof def) out[k] = v;
    else out[k] = def;
  }
  return out;
}

export function loadSettings(json: string | null | undefined): Settings {
  let saved: unknown = {};
  try { saved = JSON.parse(json || '{}'); } catch { saved = {}; }
  return mergeSettings(DEFAULT_SETTINGS as unknown as Plain, saved) as unknown as Settings;
}

/** "08:00-12:00, 13:00-18:00" → [[480, 720], [780, 1080]] */
export function parseWorkHours(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const piece of (text || '').split(/[,;]/)) {
    const m = /(\d{1,2}):?(\d{2})?\s*(?:-|–|às|a|até)\s*(\d{1,2}):?(\d{2})?/.exec(piece.trim());
    if (!m) continue;
    const start = Number(m[1]) * 60 + Number(m[2] || 0);
    const end = Number(m[3]) * 60 + Number(m[4] || 0);
    if (end > start) out.push([start, end]);
  }
  return out;
}
