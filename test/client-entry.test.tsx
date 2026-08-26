import { describe, it, expect } from "vitest";
import { inject, name, apply } from "../src/client/index.tsx";

// 回归测试：客户端条目声明的 inject 必须是宿主提供的服务名。
// 曾经的错误是把包名（@deepseek-ai/…）写进 inject，导致 cordis 客户端运行时
// 找不到同名服务，条目永远 pending（waiting for services），web boot 直接失败。
describe("client entry declaration", () => {
  it("declares only client service names, no package ids", () => {
    expect(inject).toEqual(["slots", "remote", "sessions"]);
    for (const key of inject) {
      expect(key.includes("@")).toBe(false);
    }
  });

  it("exports a cordis plugin triple", () => {
    expect(name).toBe("token-heatmap");
    expect(typeof apply).toBe("function");
  });
});
