import { describe, expect, it } from "vitest";
import { isoWeek, previousWeek, weekStart } from "../src/week";

describe("isoWeek", () => {
  it.each([
    ["2026-11-12T12:00:00Z", "2026-W46"], // Thursday
    ["2026-11-09T00:00:00Z", "2026-W46"], // Monday starts the week
    ["2026-11-15T23:59:59Z", "2026-W46"], // Sunday ends it
    ["2026-11-16T00:00:00Z", "2026-W47"],
    ["2026-01-01T00:00:00Z", "2026-W01"], // Thursday: week 1 of 2026
    ["2027-01-01T00:00:00Z", "2026-W53"], // Friday: still the last week of 2026
    ["2024-12-30T00:00:00Z", "2025-W01"], // Monday belongs to next year's week 1
    ["2021-01-03T00:00:00Z", "2020-W53"],
  ])("%s → %s", (date, week) => {
    expect(isoWeek(new Date(date))).toBe(week);
  });
});

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-W46")?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(weekStart("2025-W01")?.toISOString()).toBe("2024-12-30T00:00:00.000Z");
    expect(weekStart("2026-W53")?.toISOString()).toBe("2026-12-28T00:00:00.000Z");
  });

  it.each(["2026-46", "2026-W00", "2026-W54", "2025-W53", "x", ""])("rejects %s", (key) => {
    expect(weekStart(key)).toBeNull();
  });
});

describe("previousWeek", () => {
  it("steps back across year boundaries", () => {
    expect(previousWeek("2026-W46")).toBe("2026-W45");
    expect(previousWeek("2027-W01")).toBe("2026-W53");
    expect(previousWeek("2026-W01")).toBe("2025-W52");
    expect(previousWeek("nope")).toBeNull();
  });
});
