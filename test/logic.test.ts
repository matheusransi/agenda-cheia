import { describe, expect, it } from 'vitest';
import { classifyText, normalizePhone, parseEvent, phoneKey } from '../src/parse';
import { DEFAULT_SETTINGS, loadSettings, parseWorkHours } from '../src/settings';
import { findFreeSlots } from '../src/slots';
import { addDays, atLocalTime, fmtLongDate, fmtSlot, localDateKey, zonedToUtc } from '../src/time';

const TZ = 'America/Sao_Paulo';

describe('horários', () => {
  it('converte horário de São Paulo para UTC', () => {
    expect(zonedToUtc(2026, 10, 20, 10, 0, TZ).toISOString()).toBe('2026-10-20T13:00:00.000Z');
    expect(atLocalTime('2026-10-20', '08:30', TZ).toISOString()).toBe('2026-10-20T11:30:00.000Z');
  });
  it('formata datas em português', () => {
    const d = new Date('2026-10-20T17:00:00Z');
    expect(fmtLongDate(d, TZ)).toBe('terça, 20/10');
    expect(fmtSlot(d, TZ)).toBe('Ter 20/10 · 14:00');
    expect(localDateKey(new Date('2026-10-20T02:00:00Z'), TZ)).toBe('2026-10-19');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('telefones e eventos', () => {
  it('normaliza telefones brasileiros', () => {
    expect(normalizePhone('(11) 98765-4321')).toBe('5511987654321');
    expect(normalizePhone('+55 11 98765 4321')).toBe('5511987654321');
    expect(normalizePhone('123')).toBeNull();
  });
  it('compara telefone com e sem o nono dígito', () => {
    expect(phoneKey('5511987654321')).toBe(phoneKey('551187654321'));
  });
  it('lê título e descrição do Google Agenda', () => {
    const p = parseEvent('Maria Costa - Limpeza', 'Tel: (11) 98765-4321<br>Valor: R$ 180');
    expect(p).toEqual({ patient: 'Maria Costa', procedure: 'Limpeza', phone: '5511987654321', value: 180 });
    const q = parseEvent('João Pereira | Canal 2ª sessão 21 99876 5432', '');
    expect(q.patient).toBe('João Pereira');
    expect(q.phone).toBe('5521998765432');
    expect(parseEvent('Bloqueio almoço', '').phone).toBeNull();
  });
});

describe('respostas em texto livre', () => {
  it('entende sim e não', () => {
    for (const t of ['1', 'Sim', 'vou sim!', 'Confirmo', 'ok 👍', 'pode ser']) expect(classifyText(t)).toBe('yes');
    for (const t of ['2', 'não vou conseguir', 'Preciso remarcar', 'quero cancelar', 'nao posso']) expect(classifyText(t)).toBe('no');
    for (const t of ['qual o endereço?', 'vocês aceitam convênio?']) expect(classifyText(t)).toBe('unknown');
  });
});

describe('configurações', () => {
  it('usa padrões e ignora tipos errados', () => {
    const s = loadSettings(JSON.stringify({ confirm_time: '09:00', final_hours: 'x', texts: { confirmed: 'Oi {nome}' }, extra: 1 }));
    expect(s.confirm_time).toBe('09:00');
    expect(s.final_hours).toBe(DEFAULT_SETTINGS.final_hours);
    expect(s.texts.confirmed).toBe('Oi {nome}');
    expect(s.texts.human).toBe(DEFAULT_SETTINGS.texts.human);
    expect('extra' in s).toBe(false);
  });
  it('lê horário de atendimento', () => {
    expect(parseWorkHours('08:00-12:00, 13:00-18:00')).toEqual([[480, 720], [780, 1080]]);
    expect(parseWorkHours('8-12')).toEqual([[480, 720]]);
    expect(parseWorkHours('')).toEqual([]);
  });
});

describe('horários livres', () => {
  it('oferece um horário por dia, pulando ocupados e fim de semana', () => {
    const now = new Date('2026-10-22T13:00:00Z'); // quinta 10:00
    const busy = [{ start: new Date('2026-10-23T11:00:00Z'), end: new Date('2026-10-23T13:00:00Z') }]; // sexta 08:00-10:00
    const slots = findFreeSlots(DEFAULT_SETTINGS, TZ, busy, 60 * 60_000, now);
    expect(slots.map((d) => fmtSlot(d, TZ))).toEqual(['Sex 23/10 · 10:00', 'Seg 26/10 · 08:00', 'Ter 27/10 · 08:00']);
  });
});
