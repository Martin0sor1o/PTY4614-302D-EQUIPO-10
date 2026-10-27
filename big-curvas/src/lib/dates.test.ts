import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  daysBetweenKeys,
  formatDate,
  formatDateTime,
  formatTime,
  formatTimeWithSeconds,
  santiagoDayKey,
  santiagoMonthKey,
  santiagoOffsetMinutes,
  santiagoWeekKey,
  startOfDayKeySantiago,
  startOfDaySantiago,
  weekKeyOfDayKey,
} from "./dates";

describe("dates (America/Santiago)", () => {
  it("usa UTC-3 en verano y UTC-4 en invierno", () => {
    expect(santiagoOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(-180);
    expect(santiagoOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(-240);
  });

  it("agrupa por día chileno, no por día UTC", () => {
    // 23:30 del 14 de julio en Santiago = 03:30 UTC del 15
    expect(santiagoDayKey(new Date("2026-07-15T03:30:00Z"))).toBe("2026-07-14");
    expect(santiagoDayKey(new Date("2026-07-15T04:00:00Z"))).toBe("2026-07-15");
  });

  it("calcula el inicio del día en UTC", () => {
    expect(startOfDaySantiago(new Date("2026-01-15T20:00:00Z")).toISOString()).toBe("2026-01-15T03:00:00.000Z");
    expect(startOfDaySantiago(new Date("2026-07-15T20:00:00Z")).toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("agrupa bien alrededor de los cambios de horario de Chile", () => {
    // Abril 2026: a las 24:00 del sáb 4 los relojes retroceden a las 23:00 (la hora 23:30 ocurre dos veces).
    expect(santiagoDayKey(new Date("2026-04-05T02:30:00Z"))).toBe("2026-04-04"); // 23:30 (UTC-3)
    expect(santiagoDayKey(new Date("2026-04-05T03:30:00Z"))).toBe("2026-04-04"); // 23:30 otra vez (UTC-4)
    expect(santiagoDayKey(new Date("2026-04-05T04:00:00Z"))).toBe("2026-04-05");
    expect(startOfDaySantiago(new Date("2026-04-05T10:00:00Z")).toISOString()).toBe("2026-04-05T04:00:00.000Z");
    // Septiembre 2026: a las 24:00 del sáb 5 los relojes saltan a las 01:00 del dom 6 (el día dura 23 h).
    expect(santiagoDayKey(new Date("2026-09-06T03:59:00Z"))).toBe("2026-09-05"); // 23:59 (UTC-4)
    expect(santiagoDayKey(new Date("2026-09-06T04:00:00Z"))).toBe("2026-09-06"); // 01:00 (UTC-3)
    expect(startOfDayKeySantiago("2026-09-06").toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(startOfDayKeySantiago("2026-09-07").toISOString()).toBe("2026-09-07T03:00:00.000Z");
  });

  it("aritmética de claves de día, semana (lunes) y mes", () => {
    expect(addDaysToKey("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetweenKeys("2026-09-01", "2026-09-30")).toBe(29);
    expect(weekKeyOfDayKey("2026-10-26")).toBe("2026-10-26"); // lunes
    expect(weekKeyOfDayKey("2026-11-01")).toBe("2026-10-26"); // domingo
    expect(santiagoWeekKey(new Date("2026-10-28T15:00:00Z"))).toBe("2026-10-26");
    // Domingo 00:30 en Santiago aún pertenece a la semana que empezó el lunes anterior (aunque en UTC ya sea lunes).
    expect(santiagoWeekKey(new Date("2026-11-02T02:30:00Z"))).toBe("2026-10-26");
    expect(santiagoMonthKey(new Date("2026-11-01T02:30:00Z"))).toBe("2026-10"); // 23:30 del 31 de octubre en Santiago
    expect(() => addDaysToKey("2026-02-30", 1)).toThrow(RangeError);
  });

  it("formatea en hora de Chile", () => {
    const d = new Date("2026-07-15T18:05:00Z"); // 14:05 en Santiago (UTC-4)
    expect(formatDate(d)).toBe("15-07-2026");
    expect(formatTime(d)).toBe("14:05");
    expect(formatDateTime(d)).toBe("15-07-2026 14:05");
    expect(formatTimeWithSeconds(new Date("2026-07-15T18:05:09Z"))).toBe("14:05:09");
  });
});
