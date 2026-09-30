import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatTimeWithSeconds,
  santiagoDayKey,
  santiagoOffsetMinutes,
  startOfDaySantiago,
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

  it("formatea en hora de Chile", () => {
    const d = new Date("2026-07-15T18:05:00Z"); // 14:05 en Santiago (UTC-4)
    expect(formatDate(d)).toBe("15-07-2026");
    expect(formatTime(d)).toBe("14:05");
    expect(formatDateTime(d)).toBe("15-07-2026 14:05");
    expect(formatTimeWithSeconds(new Date("2026-07-15T18:05:09Z"))).toBe("14:05:09");
  });
});
