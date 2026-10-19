// Procura horários livres para remarcação, com base no horário de atendimento da clínica.
import { parseWorkHours, type Settings } from './settings';
import { HOUR, MINUTE, addDays, atLocalTime, localDateKey, pad, weekdayOf } from './time';

export type Interval = { start: Date; end: Date };

/**
 * Retorna até `count` horários livres a partir de amanhã, no máximo um por dia,
 * para o paciente ter opções em dias diferentes.
 */
export function findFreeSlots(
  settings: Settings, tz: string, busy: Interval[], durationMs: number, now: Date, count = 3, days = 14,
): Date[] {
  const out: Date[] = [];
  const today = localDateKey(now, tz);
  const step = Math.max(10, settings.slot_step || 30) * MINUTE;

  for (let i = 1; i <= days && out.length < count; i++) {
    const key = addDays(today, i);
    const hours = parseWorkHours(settings.work_hours[String(weekdayOf(key))] ?? '');
    let found: Date | null = null;
    for (const [from, to] of hours) {
      const open = atLocalTime(key, `${pad(Math.floor(from / 60))}:${pad(from % 60)}`, tz).getTime();
      const close = atLocalTime(key, `${pad(Math.floor(to / 60))}:${pad(to % 60)}`, tz).getTime();
      for (let t = open; t + durationMs <= close; t += step) {
        if (t < now.getTime() + 2 * HOUR) continue;
        const clash = busy.some((b) => t < b.end.getTime() && t + durationMs > b.start.getTime());
        if (!clash) { found = new Date(t); break; }
      }
      if (found) break;
    }
    if (found) out.push(found);
  }
  return out;
}
