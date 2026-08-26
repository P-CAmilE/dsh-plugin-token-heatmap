import { test } from "node:test";
import assert from "node:assert/strict";
import { createTokenHeatmapRemote, usageSchema, backfillSchema, type TokenHeatmapNamespace } from "../src/client/remote.ts";

test("usageSchema parses valid payload", () => {
  const parsed = usageSchema.parse({
    version: 3,
    days: { "2026-08-25": { total: 10, input: 4, output: 5, cacheRead: 1, cacheWrite: 0 } },
  });
  assert.equal(parsed.version, 3);
  assert.equal(parsed.days["2026-08-25"].total, 10);
});

test("usageSchema rejects malformed input", () => {
  assert.throws(() => usageSchema.parse({ version: "x", days: {} }));
  assert.throws(() => usageSchema.parse({ version: 1, days: { d: { total: "x" } } }));
  assert.throws(() => usageSchema.parse({ version: 1, days: { d: { total: -1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } }));
  assert.throws(() => usageSchema.parse(null));
});

test("backfillSchema coerces missing fields to defaults", () => {
  assert.deepEqual(backfillSchema.parse({ done: true }), {
    done: true, scanned: 0, skipped: 0, startedAt: null, finishedAt: null,
  });
  assert.deepEqual(backfillSchema.parse({ done: false, scanned: 2, skipped: 1, startedAt: 42, finishedAt: null }), {
    done: false, scanned: 2, skipped: 1, startedAt: 42, finishedAt: null,
  });
});

test("createTokenHeatmapRemote unwraps the RPC envelope value", async () => {
  const ns: TokenHeatmapNamespace = {
    getGlobalUsage: async () => ({ ok: true, value: { version: 5, days: { "2026-08-26": { total: 1, input: 1, output: 0, cacheRead: 0, cacheWrite: 0 } } } }),
    getSessionUsage: async () => ({ ok: true, value: { version: 5, days: {} } }),
    getBackfillStatus: async () => ({ ok: true, value: { done: true, scanned: 23, skipped: 0, startedAt: 1, finishedAt: 2 } }),
  };
  const api = createTokenHeatmapRemote(ns);
  const payload = await api.getGlobalUsage();
  assert.equal(payload.version, 5);
  assert.equal(payload.days["2026-08-26"].total, 1);
  assert.equal((await api.getBackfillStatus()).done, true);
});

test("createTokenHeatmapRemote rejects on RPC failure with code and message", async () => {
  const ns: TokenHeatmapNamespace = {
    getGlobalUsage: async () => ({ ok: true, value: { version: 0, days: {} } }),
    getSessionUsage: async () => ({ ok: false, error: { code: "service-unavailable", message: "boom", details: {} } }),
    getBackfillStatus: async () => ({ ok: true, value: { done: false, scanned: 0, skipped: 0, startedAt: null, finishedAt: null } }),
  };
  const api = createTokenHeatmapRemote(ns);
  await assert.rejects(async () => api.getSessionUsage("s1"), /service-unavailable/);
  await assert.rejects(async () => api.getSessionUsage("s1"), /boom/);
});
