import { test } from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { TokenHeatmapService } from "../src/service.ts";
import type { UsageStore } from "../src/usage-store.ts";
import type { BackfillMeta } from "../src/backfill.ts";

function fakeStore(overrides: Partial<UsageStore> = {}): UsageStore {
  return {
    getVersion: () => 7,
    snapshotGlobal: () => ({ "2026-08-25": { total: 5, input: 2, output: 3, cacheRead: 0, cacheWrite: 0 } }),
    snapshotSession: (id: string) => (id === "s1" ? { "2026-08-25": { total: 9, input: 4, output: 5, cacheRead: 0, cacheWrite: 0 } } : {}),
    ...overrides,
  } as UsageStore;
}

test("service self-registers under tokenHeatmap key", () => {
  const ctx = new Context();
  const meta = (): BackfillMeta => ({ done: true, scanned: 1, skipped: 0, startedAt: 1, finishedAt: 2 });
  const service = new TokenHeatmapService(ctx, fakeStore(), meta);
  const registered = ctx.get("tokenHeatmap");
  // Deviation from brief: cordis 4 exposes provided services through a tracing
  // Proxy (Service always carries Symbol.for("cordis.tracker")), so reference
  // equality with `service` never holds. The proxy's `Symbol.for("cordis.original")`
  // escape hatch reaches the raw registered instance - same assertion intent.
  assert.equal(registered[Symbol.for("cordis.original")], service);
});

test("getGlobalUsage returns version and days snapshot", async () => {
  const ctx = new Context();
  const meta = (): BackfillMeta => ({ done: true, scanned: 1, skipped: 0, startedAt: 1, finishedAt: 2 });
  const service = new TokenHeatmapService(ctx, fakeStore(), meta);
  const payload = await service.getGlobalUsage();
  assert.equal(payload.version, 7);
  assert.equal(payload.days["2026-08-25"].total, 5);
});

test("getSessionUsage returns empty map for unknown session", async () => {
  const ctx = new Context();
  const service = new TokenHeatmapService(ctx, fakeStore(), () => ({ done: false, scanned: 0, skipped: 0, startedAt: null, finishedAt: null }));
  assert.deepEqual((await service.getSessionUsage("missing")).days, {});
});

test("getBackfillStatus forwards meta", async () => {
  const ctx = new Context();
  const meta = (): BackfillMeta => ({ done: false, scanned: 3, skipped: 1, startedAt: 42, finishedAt: null });
  const service = new TokenHeatmapService(ctx, fakeStore(), meta);
  assert.deepEqual(await service.getBackfillStatus(), { done: false, scanned: 3, skipped: 1, startedAt: 42, finishedAt: null });
});
