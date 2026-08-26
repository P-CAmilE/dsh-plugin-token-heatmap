import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeeks, monthLabels, sumRange } from "../src/client/grid.ts";

test("buildWeeks: 53 weeks, newest first, Monday-start rows", () => {
  const weeks = buildWeeks("2026-08-25"); // 2026-08-25 是周二
  assert.equal(weeks.length, 53);
  const latest = weeks[0];
  assert.deepEqual(latest.map((c) => c.key), ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]);
  assert.equal(latest[0].weekday, 1);
  assert.equal(latest[1].future, false);
  assert.equal(latest[6].future, true);
  const oldest = weeks[52];
  assert.equal(oldest[0].key, "2025-08-25"); // 52 周前的周一
});

test("monthLabels marks month changes", () => {
  const weeks = buildWeeks("2026-08-25");
  const labels = monthLabels(weeks);
  assert.equal(labels[0], "8月");
  const aug3 = weeks.findIndex((w) => w[0].key === "2026-08-03");
  assert.equal(labels[aug3], null); // 同月无标签
  const jul27 = weeks.findIndex((w) => w[0].key === "2026-07-27");
  assert.equal(labels[jul27], "7月");
});

test("sumRange sums totals within inclusive key bounds", () => {
  const days = {
    "2026-08-24": { total: 10, input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
    "2026-08-25": { total: 20, input: 5, output: 5, cacheRead: 5, cacheWrite: 5 },
    "2026-08-26": { total: 30, input: 5, output: 5, cacheRead: 0, cacheWrite: 20 },
    "2026-07-01": { total: 99, input: 0, output: 0, cacheRead: 0, cacheWrite: 99 },
  };
  assert.equal(sumRange(days, "2026-08-24", "2026-08-25"), 30);
  assert.equal(sumRange(days, "2026-08-24", "2026-08-26"), 60);
});
