import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKeyOf, isoWeekday, parseDayKey, cutoffKey } from "../src/day.ts";

test("dayKeyOf formats local date", () => {
  assert.equal(dayKeyOf(new Date(2026, 7, 25, 23, 59).getTime()), "2026-08-25");
  assert.equal(dayKeyOf(new Date(2026, 0, 1).getTime()), "2026-01-01");
});

test("dayKeyOf round-trips with parseDayKey", () => {
  const t = new Date(2025, 11, 31, 8).getTime();
  assert.equal(parseDayKey(dayKeyOf(t)), new Date(2025, 11, 31).getTime());
});

test("isoWeekday: Monday=1, Sunday=7", () => {
  assert.equal(isoWeekday(new Date(2026, 7, 24).getTime()), 1); // 2026-08-24 is Monday
  assert.equal(isoWeekday(new Date(2026, 7, 30).getTime()), 7); // Sunday
});

test("cutoffKey keeps 13 months back to the 1st", () => {
  const now = new Date(2026, 7, 25).getTime();
  assert.equal(cutoffKey(now), "2025-08-01");
  const jan = new Date(2026, 0, 10).getTime();
  // Brief expected "2024-12-01", but that is 13 months back; the documented
  // contract is 12 months before now's month (keeps 13 months incl. current),
  // so January 2026 → 2025-01-01.
  assert.equal(cutoffKey(jan), "2025-01-01");
});
