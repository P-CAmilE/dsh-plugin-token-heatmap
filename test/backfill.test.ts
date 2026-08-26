import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import type { DailyUsageMap } from "../src/usage.ts";
import { extractSamples, aggregateSamples, BackfillRunner } from "../src/backfill.ts";

function assistantMessage(time: number, usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number } | undefined): SessionEvent {
  return {
    type: "assistant/message",
    seq: 1,
    time,
    data: { turn: 0, step: 0, message: {} as never, usage } as never,
  } as SessionEvent;
}

test("extractSamples keeps only assistant/message events with usage", () => {
  const t0 = new Date(2026, 7, 25, 10).getTime();
  const events = [
    assistantMessage(t0, { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 }),
    { type: "assistant/chunk", seq: 2, time: t0, data: {} } as SessionEvent,
    assistantMessage(t0 + 1000, { inputTokens: 1, outputTokens: 1 }),
    assistantMessage(t0 + 1000, undefined), // 无 usage 不计数
  ];
  const samples = extractSamples(events);
  assert.equal(samples.length, 2);
  assert.deepEqual(samples[0], { day: "2026-08-25", input: 10, output: 5, cacheRead: 2, cacheWrite: 0 });
  assert.deepEqual(samples[1], { day: "2026-08-25", input: 1, output: 1, cacheRead: 0, cacheWrite: 0 });
});

test("aggregateSamples fills global and per-session maps", () => {
  const global: DailyUsageMap = {};
  const bySession: Record<string, DailyUsageMap> = {};
  aggregateSamples(global, bySession, "s1", [
    { day: "2026-08-25", input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
    { day: "2026-08-26", input: 3, output: 2, cacheRead: 1, cacheWrite: 0 },
  ]);
  assert.equal(global["2026-08-25"].total, 15);
  assert.equal(bySession.s1["2026-08-26"].total, 6);
});

test("BackfillRunner.run scans headers and writes done meta", async () => {
  const dir = mkdtempSync(join(tmpdir(), "heatmap-backfill-"));
  const t = new Date(2026, 7, 25, 10).getTime();
  const runner = new BackfillRunner(dir, {
    async list() {
      return [{ id: "s1" }, { id: "s2" }];
    },
    async inspect(id: string) {
      if (id === "s2") throw new Error("corrupt");
      return { meta: { id } as never, events: [assistantMessage(t, { inputTokens: 10, outputTokens: 5 })] };
    },
  } as never);
  const result = await runner.run();
  assert.equal(result.scanned, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.scannedIds.sort(), ["s1", "s2"]);
  assert.equal(result.global["2026-08-25"].total, 15);
  assert.equal(result.bySession.s1["2026-08-25"].total, 15);
  assert.equal(runner.meta().done, true);
});

test("BackfillRunner skips when already done", async () => {
  const dir = mkdtempSync(join(tmpdir(), "heatmap-backfill-"));
  const runner = new BackfillRunner(dir, { async list() { throw new Error("must not run"); } } as never);
  // 直接写入已完成的 meta，再运行应短路
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ done: true, scanned: 9, skipped: 0, startedAt: 1, finishedAt: 2 }), "utf8");
  const result = await runner.run();
  assert.equal(result.scanned, 9);
});
