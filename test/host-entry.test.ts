import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, inject, name } from "../src/index.ts";

// 回归：2026-08-28 线上事故 —— apply 顶层同步 ctx.get("sessionPersistence") 存在装配竞态，
// 服务未就绪时拿到 undefined，回填 0 会话且写入 done 永久跳过。
// 契约：宿主入口必须声明 sessionPersistence 为前置服务（cordis 就绪后才 apply）。
test("host entry waits for sessionPersistence before applying", () => {
  assert.equal(name, "token-heatmap");
  assert.ok(typeof apply === "function");
  assert.ok(
    inject.includes("sessionPersistence"),
    "host entry must declare sessionPersistence in inject; got: " + JSON.stringify(inject),
  );
});
