// Las fechas se guardan en UTC; se muestran y agrupan en America/Santiago (CLAUDE.md regla 11).

export const SANTIAGO_TZ = "America/Santiago";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SANTIAGO_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface SantiagoParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function santiagoParts(date: Date): SantiagoParts {
  const map: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/** Desfase (minutos) de Santiago respecto de UTC en ese instante: -180 en verano, -240 en invierno. */
export function santiagoOffsetMinutes(date: Date): number {
  const p = santiagoParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** Clave de día calendario en Chile: "2026-09-30". Sirve para agrupar reportes. */
export function santiagoDayKey(date: Date): string {
  const p = santiagoParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Instante UTC en que empieza el día (hora de Chile) que contiene `date`. */
export function startOfDaySantiago(date: Date): Date {
  const p = santiagoParts(date);
  const localMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  // Dos pasadas: el desfase puede cambiar entre la medianoche y el instante dado (cambio de horario).
  let guess = localMidnightAsUtc - santiagoOffsetMinutes(new Date(localMidnightAsUtc)) * 60_000;
  guess = localMidnightAsUtc - santiagoOffsetMinutes(new Date(guess)) * 60_000;
  // Si la medianoche local no existe (a las 24:00 los relojes saltan a las 01:00), el día empieza en la primera hora válida.
  const target = santiagoDayKey(date);
  for (let i = 0; i < 3 && santiagoDayKey(new Date(guess)) !== target; i++) guess += 3_600_000;
  return new Date(guess);
}

// ── Claves de día ("2026-09-30") para agrupar reportes: aritmética de calendario pura, sin horarios de verano. ──

function parseDayKey(key: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new RangeError(`Clave de día inválida: ${key}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Clave de día inexistente: ${key}`);
  }
  return { year, month, day };
}

function keyOfUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Suma (o resta) días a una clave de día calendario. */
export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDayKey(key);
  return keyOfUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Cantidad de días calendario entre dos claves (`to − from`). */
export function daysBetweenKeys(from: string, to: string): number {
  const a = parseDayKey(from);
  const b = parseDayKey(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** Instante UTC en que empieza (hora de Chile) el día calendario de la clave. */
export function startOfDayKeySantiago(key: string): Date {
  const { year, month, day } = parseDayKey(key);
  // Mediodía UTC cae siempre dentro del mismo día chileno (UTC-3/-4).
  return startOfDaySantiago(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** Lunes (clave de día) de la semana chilena —lunes a domingo— que contiene `date`. */
export function santiagoWeekKey(date: Date): string {
  return weekKeyOfDayKey(santiagoDayKey(date));
}

export function weekKeyOfDayKey(key: string): string {
  const { year, month, day } = parseDayKey(key);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = domingo
  return addDaysToKey(key, -((dow + 6) % 7));
}

/** Mes calendario chileno de `date`: "2026-09". */
export function santiagoMonthKey(date: Date): string {
  return santiagoDayKey(date).slice(0, 7);
}

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: SANTIAGO_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: SANTIAGO_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const timeSecondsFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: SANTIAGO_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "30-09-2026" */
export function formatDate(date: Date): string {
  return dateFormatter.format(date).replaceAll("/", "-");
}

/** "14:05" (hora de Chile) */
export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

/** "14:05:09" (hora de Chile) */
export function formatTimeWithSeconds(date: Date): string {
  return timeSecondsFormatter.format(date);
}

/** "30-09-2026 14:05" (hora de Chile) */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}
