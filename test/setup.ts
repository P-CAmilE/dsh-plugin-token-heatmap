import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL 不自动清理（vitest 未开 globals）；无清理时多次 render 会在同一 body 累积 DOM，
// 导致 getByTestId 命中多个元素。显式在每个测试后卸载。
afterEach(() => {
  cleanup();
});
