import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageStore } from "../src/usage-store.ts";
import { dayKeyOf } from "../src/day.ts";

function makeStore(): { store: UsageStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "heatmap-"));
  return { store: new UsageStore(dir), dir };
}

test("addUsage accumulates global and per-session, version increments", () => {
  const { store } = makeStore();
  store.addUsage("s1", "2026-08-25", 10, 5);
  store.addUsage("s1", "2026-08-25", 1, 1);
  store.addUsage("s2", "2026-08-25", 3, 2);
  store.addUsage(null, "2026-08-26", 7, 7);
  assert.equal(store.snapshotGlobal()["2026-08-25"].total, 22);
  assert.equal(store.snapshotSession("s1")["2026-08-25"].total, 17);
  assert.equal(store.snapshotSession("s2")["2026-08-25"].total, 5);
  assert.equal(store.snapshotSession("nope")["2026-08-25"], undefined);
  assert.equal(store.getVersion(), 4);
});

test("flush writes atomic JSON files with pruning", () => {
  const { store, dir } = makeStore();
  store.addUsage("s1", "2020-01-01", 1, 1); // 会被 13 个月裁剪掉
  store.addUsage("s1", dayKeyOf(Date.now()), 2, 3);
  store.flush();
  const global = JSON.parse(readFileSync(join(dir, "global.json"), "utf8"));
  const sessions = JSON.parse(readFileSync(join(dir, "sessions.json"), "utf8"));
  assert.equal(global.version, 1);
  assert.equal(global.days["2020-01-01"], undefined);
  assert.equal(global.days[dayKeyOf(Date.now())].total, 5);
  assert.ok(sessions.bySession.s1);
});

test("load restores persisted state", () => {
  const { store, dir } = makeStore();
  store.addUsage("s1", dayKeyOf(Date.now()), 4, 4);
  store.flush();
  const second = new UsageStore(dir);
  second.load();
  assert.equal(second.snapshotSession("s1")[dayKeyOf(Date.now())].total, 8);
});

test("corrupted files fall back to empty state", () => {
  const { dir } = makeStore();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "global.json"), "{{{not json", "utf8");
  const store = new UsageStore(dir);
  store.load();
  assert.deepEqual(store.snapshotGlobal(), {});
});

test("pruneSessions removes sessions absent from live set", () => {
  const { store } = makeStore();
  store.addUsage("gone", dayKeyOf(Date.now()), 1, 1);
  store.addUsage("alive", dayKeyOf(Date.now()), 1, 1);
  store.pruneSessions(new Set(["alive"]));
  assert.deepEqual(store.snapshotSession("gone"), {});
  assert.equal(store.snapshotSession("alive")[dayKeyOf(Date.now())].total, 2);
});
