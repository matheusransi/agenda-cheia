// Conversões entre UTC e o horário local da clínica, sem bibliotecas externas.

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function localParts(date: Date, tz: string): LocalParts {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, weekday };
}

function offsetMs(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, date.getUTCSeconds());
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converte um horário local (ex.: 20/10 às 10:00 em São Paulo) para Date em UTC. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), tz);
  const second = guess - offsetMs(new Date(first), tz);
  return new Date(second);
}

/** "YYYY-MM-DD" do dia local. */
export function localDateKey(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** Soma dias a uma data "YYYY-MM-DD". */
export function addDays(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function weekdayOf(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Início e fim (UTC) de um dia local. */
export function dayRange(key: string, tz: string): { start: Date; end: Date } {
  const { year, month, day } = parseDateKey(key);
  const next = parseDateKey(addDays(key, 1));
  return { start: zonedToUtc(year, month, day, 0, 0, tz), end: zonedToUtc(next.year, next.month, next.day, 0, 0, tz) };
}

/** Horário "HH:MM" em minutos desde a meia-noite. */
export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Data local `key` no horário "HH:MM", em UTC. */
export function atLocalTime(key: string, hhmm: string, tz: string): Date {
  const { year, month, day } = parseDateKey(key);
  const minutes = hhmmToMinutes(hhmm);
  return zonedToUtc(year, month, day, Math.floor(minutes / 60), minutes % 60, tz);
}

export function minutesOfDay(date: Date, tz: string): number {
  const p = localParts(date, tz);
  return p.hour * 60 + p.minute;
}

/** "14:00" */
export function fmtTime(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "20/10" */
export function fmtDayMonth(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${pad(p.day)}/${pad(p.month)}`;
}

/** "terça, 20/10" */
export function fmtLongDate(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${WEEKDAYS_LONG[p.weekday]}, ${pad(p.day)}/${pad(p.month)}`;
}

/** "Ter 20/10 · 14:00" (cabe no limite de 20 caracteres dos botões do WhatsApp) */
export function fmtSlot(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${WEEKDAYS[p.weekday]} ${pad(p.day)}/${pad(p.month)} · ${pad(p.hour)}:${pad(p.minute)}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export const HOUR = 3600_000;
export const MINUTE = 60_000;
export const DAY_MS = 24 * HOUR;
