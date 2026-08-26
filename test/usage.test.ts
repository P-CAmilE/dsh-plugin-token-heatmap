import { test } from "node:test";
import assert from "node:assert/strict";
import { addUsage, mergeMaps, prune, emptyTotals, type DailyUsageMap } from "../src/usage.ts";

test("addUsage accumulates buckets and recomputes total", () => {
  const map: DailyUsageMap = {};
  addUsage(map, "2026-08-25", 100, 50);
  addUsage(map, "2026-08-25", 10, 5, 3, 2);
  assert.deepEqual(map["2026-08-25"], { total: 170, input: 110, output: 55, cacheRead: 3, cacheWrite: 2 });
});

test("emptyTotals starts at zero", () => {
  assert.deepEqual(emptyTotals(), { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
});

test("mergeMaps sums into target", () => {
  const target: DailyUsageMap = {};
  addUsage(target, "2026-08-25", 1, 2);
  const source: DailyUsageMap = {};
  addUsage(source, "2026-08-25", 3, 4);
  addUsage(source, "2026-08-26", 5, 6);
  mergeMaps(target, source);
  assert.equal(target["2026-08-25"].total, 10);
  assert.equal(target["2026-08-26"].total, 11);
});

test("prune drops keys older than cutoff", () => {
  const map: DailyUsageMap = {};
  addUsage(map, "2025-07-31", 1, 1);
  addUsage(map, "2025-08-01", 2, 2);
  addUsage(map, "2026-08-25", 3, 3);
  prune(map, "2025-08-01");
  assert.deepEqual(Object.keys(map).sort(), ["2025-08-01", "2026-08-25"]);
});
